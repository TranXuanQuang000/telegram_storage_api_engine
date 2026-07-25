/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { refreshTrackedOTruyenStories, runOTruyenIngest } from "../lib/sources/otruyen";
import { runRatingEnrichment } from "../lib/sources/ratings";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let catalogRefreshInFlight: Promise<void> | null = null;

function refreshCatalogHeadIfStale(db: D1Database) {
  if (catalogRefreshInFlight) return catalogRefreshInFlight;
  catalogRefreshInFlight = (async () => {
    const running = await db.prepare(
      "SELECT id FROM sync_runs WHERE source_id = 'source_otruyen' AND status = 'running' AND started_at > datetime('now', '-10 minutes') LIMIT 1",
    ).first<{ id: string }>();
    if (running) return;
    const freshness = await db.prepare(
      "SELECT CASE WHEN last_sync_at IS NULL OR last_sync_at < datetime('now', '-20 minutes') THEN 1 ELSE 0 END AS stale FROM sources WHERE id = 'source_otruyen'",
    ).first<{ stale: number }>();
    if (freshness && Number(freshness.stale) !== 1) return;
    await runOTruyenIngest(db, { mode: "refresh", pagesPerRun: 4 });
    await refreshTrackedOTruyenStories(db, 18);
  })()
    .catch((error) => console.warn("Background catalog head refresh failed", error))
    .finally(() => { catalogRefreshInFlight = null; });
  return catalogRefreshInFlight;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (
      env.DB
      && request.method === "GET"
      && (url.pathname === "/" || url.pathname === "/discover" || url.pathname.startsWith("/api/catalog"))
    ) {
      ctx.waitUntil(refreshCatalogHeadIfStale(env.DB));
    }

    if (env.ASSETS && (request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 200) {
        return assetRes;
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          if (!env.IMAGES?.input) {
            return new Response(body);
          }
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      // Refresh the volatile head every hour, while a separate cursor keeps
      // advancing through the complete source catalog.
      await runOTruyenIngest(env.DB, { mode: "refresh", pagesPerRun: 6 });
      await runOTruyenIngest(env.DB, { mode: "incremental", pagesPerRun: 12 });
      await refreshTrackedOTruyenStories(env.DB, 24);
      await runRatingEnrichment(env.DB, 12);
    })());
  },
};

export default worker;
