import { cookies } from "next/headers";

const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_SCHEME = "pbkdf2-sha256";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: saltBuffer,
    iterations,
    hash: "SHA-256",
  }, keyMaterial, 256));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const versioned = storedHash.split("$");
  const isVersioned = versioned.length === 4 && versioned[0] === PASSWORD_SCHEME;
  const iterations = isVersioned ? Number.parseInt(versioned[1], 10) : 10_000;
  const [saltHex, hashHex] = isVersioned ? [versioned[2], versioned[3]] : storedHash.split(":");
  if (!saltHex || !hashHex || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  if (!salt || !expected) return false;
  const actual = await derivePassword(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export function passwordNeedsUpgrade(storedHash: string) {
  return !storedHash.startsWith(`${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$`);
}

export type DbClient = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      run: () => Promise<unknown>;
      first: () => Promise<Record<string, unknown> | null>;
    };
  };
};

export async function createSession(db: DbClient, userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  
  await db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(sessionId, userId, expiresAt).run();
  
  return sessionId;
}

export async function setSessionCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set("muc_session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  });
}

export async function getSessionUser(db: DbClient) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("muc_session")?.value;
  
  if (!sessionId) return null;
  
  const session = await db.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP"
  ).bind(sessionId).first();
  
  if (!session) return null;
  
  const user = await db.prepare(
    "SELECT id, username, display_name FROM users WHERE id = ?"
  ).bind(session.user_id as string).first();
  
  return user;
}

export async function destroySession(db: DbClient) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("muc_session")?.value;
  
  if (sessionId) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    cookieStore.delete("muc_session");
  }
}
