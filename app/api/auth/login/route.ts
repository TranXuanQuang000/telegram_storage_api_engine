import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, passwordNeedsUpgrade, setSessionCookie, verifyPassword } from "../../../../lib/auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
}).strict();

function runtimeDb() { return (env as unknown as { DB?: D1Database }).DB; }

export async function POST(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Cơ sở dữ liệu D1 chưa sẵn sàng" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  try {
    const user = await db.prepare("SELECT id, password_hash FROM users WHERE username = ?").bind(username).first();
    if (!user) {
      return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu" }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password_hash as string);
    if (!isValid) {
      return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu" }, { status: 401 });
    }
    if (passwordNeedsUpgrade(user.password_hash as string)) {
      const upgradedHash = await hashPassword(password);
      await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(upgradedHash, user.id as string)
        .run();
    }

    const sessionId = await createSession(db, user.id as string);

    const response = NextResponse.json({ success: true });
    response.cookies.set("muc_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    await setSessionCookie(sessionId).catch(() => null);

    return response;
  } catch (error: unknown) {
    console.error("Login error:", error);
    const msg = error instanceof Error ? error.message : "Lỗi hệ thống khi đăng nhập";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
