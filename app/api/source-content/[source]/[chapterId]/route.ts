import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../../../lib/reader-access";
import { getSourceContent, isSourceHubId, SOURCE_MANIFESTS } from "../../../../../lib/source-hub";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ source: string; chapterId: string }> },
) {
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.authenticated ? "reader_not_allowed" : "account_required" },
      { status: access.authenticated ? 403 : 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { source, chapterId } = await context.params;
  if (!isSourceHubId(source)) {
    return NextResponse.json({ error: "unknown_source" }, { status: 400 });
  }
  const content = await getSourceContent(source, chapterId);
  if (content === "metadata-only") {
    return NextResponse.json({
      error: "metadata_only",
      message: "Nguồn này chỉ cho phép Mực lập chỉ mục metadata. Hãy đọc tại website nguồn.",
      source: SOURCE_MANIFESTS[source],
    }, { status: 403 });
  }
  if (!content) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(content, {
    headers: {
      "Cache-Control": access.mode === "public"
        ? "public, max-age=120, s-maxage=900, stale-while-revalidate=3600"
        : "private, no-store",
    },
  });
}
