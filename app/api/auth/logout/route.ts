import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { destroySession } from "../../../../lib/auth";

function runtimeDb() { return (env as unknown as { DB?: D1Database }).DB; }

export async function POST() {
  const db = runtimeDb();
  if (db) {
    await destroySession(db);
  }
  return NextResponse.json({ success: true });
}
