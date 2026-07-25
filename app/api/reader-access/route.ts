import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../lib/reader-access";

export async function GET() {
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  return NextResponse.json({
    mode: access.mode,
    allowed: access.allowed,
    authenticated: access.authenticated,
    inviteRequired: access.inviteRequired,
    registrationOpen: access.registrationOpen,
    reason: access.reason,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
