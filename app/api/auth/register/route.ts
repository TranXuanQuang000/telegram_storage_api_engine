import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, createSession, setSessionCookie } from "../../../../lib/auth";
import { validateReaderRegistration, type ReaderAccessRuntime } from "../../../../lib/reader-access";

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().max(50).optional(),
  password: z.string().min(6),
  inviteCode: z.string().max(120).optional(),
}).strict();

function runtimeDb() { return (env as unknown as { DB?: D1Database }).DB; }

export async function POST(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Cơ sở dữ liệu D1 chưa sẵn sàng" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không đúng định dạng JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Tên đăng nhập (3-20 ký tự) hoặc mật khẩu (ít nhất 6 ký tự) không hợp lệ" }, { status: 400 });
  }

  const { username, displayName, password, inviteCode } = parsed.data;
  if (!validateReaderRegistration(env as unknown as ReaderAccessRuntime, username, inviteCode)) {
    return NextResponse.json({
      error: "Mã mời không đúng hoặc tài khoản này chưa nằm trong danh sách được phép.",
    }, { status: 403 });
  }

  try {
    const existingUser = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existingUser) {
      return NextResponse.json({ error: "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();

    await db.prepare(
      "INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(userId, username, hashedPassword, displayName || username).run();

    const sessionId = await createSession(db, userId);

    const response = NextResponse.json({ success: true, userId });
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
    console.error("Register error:", error);
    const msg = error instanceof Error ? error.message : "Lỗi hệ thống khi đăng ký";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
