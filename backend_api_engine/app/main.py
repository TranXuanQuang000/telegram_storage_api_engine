import hmac
import os
import sys
import time
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

if "pytest" not in sys.modules:
    load_dotenv()

from app.api.v1.otruyen import router as otruyen_router
from app.api.v1.novel import router as novel_router
from app.api.v1.sources import router as sources_router
from app.api.v1.imports import router as imports_router
from app.api.v1.coverage import router as coverage_router
from app.api.v1.archive import router as archive_router

from app.services.aggregator import get_aggregator_service
from app.services.catalog_snapshot import get_catalog_snapshot_status
from app.services.telegram_storage import TelegramStorageService


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await get_aggregator_service().close()

app = FastAPI(
    title="Multi-Source Aggregator API Engine",
    description="REST API Compatibility Server R3",
    version="1.6.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://muctruyen.pages.dev,http://localhost:3000",
    ).split(",")
    if origin.strip()
]

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=[
        "Accept",
        "Authorization",
        "Content-Type",
        "X-Archive-Api-Key",
        "X-Muc-Api-Key",
    ],
)

# 2. Response Compression Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)


# 3. Response Timing Middleware (X-Response-Time-Ms)
@app.middleware("http")
async def add_response_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response: Response = await call_next(request)
    process_time_ms = (time.perf_counter() - start_time) * 1000
    response.headers["X-Response-Time-Ms"] = f"{process_time_ms:.2f}"
    return response


@app.middleware("http")
async def protect_content_api(request: Request, call_next):
    expected = os.getenv("MUC_API_TOKEN", "").strip()
    is_archive_path = request.url.path.startswith("/v1/api/archive")
    if expected and request.url.path.startswith("/v1/api/") and not is_archive_path:
        bearer = request.headers.get("authorization", "")
        provided = bearer[7:].strip() if bearer.lower().startswith("bearer ") else request.headers.get("x-muc-api-key", "")
        if not hmac.compare_digest(provided, expected):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"status": "error", "message": "Unauthorized API client", "data": None},
                headers={"Cache-Control": "private, no-store"},
            )
    return await call_next(request)


# 4. Global Error Handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": str(exc) or "Internal Server Error",
            "data": None,
        },
    )


# 5. Router Inclusions
app.include_router(otruyen_router, prefix="/v1/api", tags=["OTruyen Comic API"])
app.include_router(novel_router, prefix="/v1/api", tags=["Novel API Extension"])
app.include_router(sources_router, prefix="/v1/api", tags=["Source Registry"])
app.include_router(imports_router, prefix="/v1/api", tags=["Public Metadata Import"])
app.include_router(coverage_router, prefix="/v1/api", tags=["Coverage Audit"])
app.include_router(archive_router, tags=["Authorized Telegram Archive"])


@app.get("/health")
async def health_check():
    storage = TelegramStorageService.from_env()
    return {
        "status": "ok",
        "service": "aggregator-api-engine",
        "version": "1.6.0",
        "capabilities": {
            "comic_drop_in": True,
            "novel_api": True,
            "adaptive_source_selection": True,
            "chapter_coverage_audit": True,
            "public_metadata_import": True,
            "telegram_storage": storage.configured,
            "authorized_archive": True,
            "archive_allowed_sources": sorted(storage.allowed_sources),
            "api_token": bool(os.getenv("MUC_API_TOKEN", "").strip()),
            "novel_catalog_snapshot": get_catalog_snapshot_status(),
        },
    }
