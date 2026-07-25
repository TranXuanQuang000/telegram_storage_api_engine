import { getSessionUser, type DbClient } from "./auth";

export type ReaderAccessMode = "public" | "account" | "invite" | "allowlist";

export type ReaderAccessRuntime = {
  DB?: D1Database;
  MUC_READER_ACCESS_MODE?: string;
  MUC_READER_ALLOWLIST?: string;
  MUC_INVITE_CODE?: string;
};

export type ReaderAccessState = {
  mode: ReaderAccessMode;
  allowed: boolean;
  authenticated: boolean;
  inviteRequired: boolean;
  registrationOpen: boolean;
  username: string | null;
  reason: "public" | "account_required" | "not_allowlisted" | "database_unavailable";
};

function accessMode(runtime: ReaderAccessRuntime): ReaderAccessMode {
  const configured = runtime.MUC_READER_ACCESS_MODE?.trim().toLowerCase();
  return configured === "account" || configured === "invite" || configured === "allowlist"
    ? configured
    : "public";
}

function allowlistedUsernames(runtime: ReaderAccessRuntime) {
  return new Set(
    (runtime.MUC_READER_ALLOWLIST ?? "")
      .split(",")
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean),
  );
}

function equalSecret(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function getReaderAccessConfiguration(runtime: ReaderAccessRuntime) {
  const mode = accessMode(runtime);
  return {
    mode,
    inviteRequired: mode === "invite",
    registrationOpen: mode !== "invite" || Boolean(runtime.MUC_INVITE_CODE?.trim()),
  };
}

export async function getReaderAccess(runtime: ReaderAccessRuntime): Promise<ReaderAccessState> {
  const configuration = getReaderAccessConfiguration(runtime);
  if (configuration.mode === "public") {
    return {
      ...configuration,
      allowed: true,
      authenticated: false,
      username: null,
      reason: "public",
    };
  }

  if (!runtime.DB) {
    return {
      ...configuration,
      allowed: false,
      authenticated: false,
      username: null,
      reason: "database_unavailable",
    };
  }

  const user = await getSessionUser(runtime.DB as unknown as DbClient);
  if (!user) {
    return {
      ...configuration,
      allowed: false,
      authenticated: false,
      username: null,
      reason: "account_required",
    };
  }

  const username = String(user.username ?? "").toLowerCase();
  const allowed = configuration.mode !== "allowlist" || allowlistedUsernames(runtime).has(username);
  return {
    ...configuration,
    allowed,
    authenticated: true,
    username,
    reason: allowed ? "public" : "not_allowlisted",
  };
}

export function validateReaderRegistration(
  runtime: ReaderAccessRuntime,
  username: string,
  inviteCode?: string,
) {
  const configuration = getReaderAccessConfiguration(runtime);
  if (configuration.mode === "invite") {
    const expected = runtime.MUC_INVITE_CODE?.trim() ?? "";
    return Boolean(expected && inviteCode && equalSecret(inviteCode.trim(), expected));
  }
  if (configuration.mode === "allowlist") {
    return allowlistedUsernames(runtime).has(username.trim().toLowerCase());
  }
  return true;
}
