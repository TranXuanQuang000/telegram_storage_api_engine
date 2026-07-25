import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";

function runtimeDb() { return (env as unknown as { DB?: D1Database }).DB; }

export async function GET() {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ user: null });

  try {
    const user = await getSessionUser(db);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
