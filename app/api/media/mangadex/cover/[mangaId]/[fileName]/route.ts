import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ mangaId: string; fileName: string }> }) {
  const { mangaId, fileName } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(mangaId) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return NextResponse.json({ error: "Ảnh bìa không hợp lệ" }, { status: 400 });
  }
  const upstream = await fetch(`https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`, {
    headers: {
      Accept: "image/avif,image/webp,image/*",
      "User-Agent": "MucCatalog/1.2 (+https://muctruyen.pages.dev; source-attribution)",
    },
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Không tải được ảnh bìa từ nguồn" }, { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "X-Content-Type-Options": "nosniff",
      "X-Muc-Image-Source": "MangaDex",
    },
  });
}
