import { getChatGPTUser } from "../app/chatgpt-auth";

export async function currentProfile(db: D1Database): Promise<{ id: string; displayName: string } | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  const bytes = new TextEncoder().encode(user.email.trim().toLocaleLowerCase("en-US"));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const emailHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const id = `profile_${emailHash.slice(0, 32)}`;
  await db.prepare("INSERT INTO profiles (id, email_hash, display_name, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name").bind(id, emailHash, user.displayName).run();
  return { id, displayName: user.displayName };
}

