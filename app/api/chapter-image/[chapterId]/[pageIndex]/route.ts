import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  getFallbackChapterImageTarget,
  validateFallbackImageUrl,
} from "../../../../../lib/sources/fallback-chapters";

type CloudflareFetchInit = RequestInit & {
  cf?: { cacheEverything?: boolean; cacheTtl?: number };
};

async function fetchValidatedImage(
  imageUrl: string,
  referer: string,
  source: "nettruyen" | "truyenqq",
) {
  let current = imageUrl;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
        Referer: referer,
        "User-Agent": "Mozilla/5.0 (compatible; MucReader/3.0; +https://muctruyen.pages.dev)",
      },
      redirect: "manual",
      cf: { cacheEverything: true, cacheTtl: 7 * 24 * 60 * 60 },
    } as CloudflareFetchInit);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    const next = location ? validateFallbackImageUrl(source, new URL(location, current).toString(), referer) : null;
    if (!next) return new Response(null, { status: 502 });
    current = next;
  }
  return new Response(null, { status: 502 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string; pageIndex: string }> },
) {
  const { chapterId, pageIndex: rawPageIndex } = await params;
  const pageIndex = Number(rawPageIndex);
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB || !Number.isInteger(pageIndex)) {
    return NextResponse.json({ error: "Trang truyện không khả dụng" }, { status: 404 });
  }
  const target = await getFallbackChapterImageTarget(runtime.DB, chapterId, pageIndex);
  if (!target) return NextResponse.json({ error: "Trang truyện không khả dụng" }, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetchValidatedImage(target.imageUrl, target.referer, target.source);
  } catch {
    return NextResponse.json({ error: "Nguồn ảnh tạm thời không phản hồi" }, { status: 502 });
  }
  const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const contentLength = Number(upstream.headers.get("content-length") ?? 0);
  if (!upstream.ok || !/^image\/(?:avif|gif|jpeg|png|webp)$/.test(contentType)) {
    return NextResponse.json({ error: "Nguồn ảnh trả về dữ liệu không hợp lệ" }, { status: 502 });
  }
  if (Number.isFinite(contentLength) && contentLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Ảnh vượt giới hạn an toàn" }, { status: 413 });
  }

  const headers = new Headers({
    "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["content-length", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}
