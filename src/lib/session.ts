import type { AdminUser, Env } from "../types";
import { nowIso } from "./time";

export const ADMIN_COOKIE = "pastel_admin_session";
const DEFAULT_TTL_HOURS = 8;

export interface AdminSession {
  sessionId: string;
  admin: AdminUser;
  expiresAt: string;
}

interface SessionRow {
  session_id: string;
  expires_at: string;
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionTtlHours(env: Env): number {
  const parsed = Number(env.ADMIN_SESSION_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_HOURS;
  return Math.min(72, Math.max(1, Math.floor(parsed)));
}

export async function createAdminSession(
  env: Env,
  adminId: string,
  userAgent: string,
): Promise<{ token: string; expiresAt: string; maxAgeSeconds: number }> {
  const ttlHours = sessionTtlHours(env);
  const token = createToken();
  const tokenHash = await sha256Hex(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
  const now = nowIso();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare(
      "INSERT INTO admin_sessions (id, admin_user_id, token_hash, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(sessionId, adminId, tokenHash, userAgent.slice(0, 300), expiresAt, now),
  ]);

  return { token, expiresAt, maxAgeSeconds: ttlHours * 3600 };
}

export async function readAdminSession(
  env: Env,
  token: string,
): Promise<AdminSession | null> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.name, u.email, u.role, u.is_active
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.admin_user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
  )
    .bind(tokenHash, nowIso())
    .first<SessionRow>();

  if (!row) return null;

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    admin: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as AdminUser["role"],
    },
  };
}

export async function destroyAdminSession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}
