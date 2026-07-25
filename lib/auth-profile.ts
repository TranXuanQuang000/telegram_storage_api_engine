import { getSessionUser, type DbClient } from "./auth";

export async function currentProfile(db: D1Database): Promise<{ id: string; displayName: string } | null> {
  const user = await getSessionUser(db as unknown as DbClient);
  if (!user) return null;

  const userId = user.id as string;
  const displayName = ((user.display_name || user.username) as string) ?? "Người dùng";
  const emailHash = `usr_${userId.replace(/[^a-zA-Z0-9]/g, "")}`;

  try {
    await db.prepare(
      `INSERT OR IGNORE INTO profiles (id, email_hash, display_name, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(userId, emailHash, displayName).run();
  } catch (err) {
    console.error("Profile auto-creation error:", err);
  }

  return {
    id: userId,
    displayName,
  };
}
