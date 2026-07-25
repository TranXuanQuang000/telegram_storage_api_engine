import { NextResponse } from "next/server";
import { SOURCE_MANIFESTS } from "../../../lib/source-hub";

export async function GET() {
  return NextResponse.json({
    version: "1.0",
    sources: Object.values(SOURCE_MANIFESTS),
    catalogEndpoint: "/api/source-catalog?source=all&q=&page=1&limit=24",
    safety: {
      arbitraryUrlFetch: false,
      paywallBypass: false,
      drmBypass: false,
      metadataOnlySourcesReturnContent: false,
    },
  }, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
