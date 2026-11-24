import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie } from "hono/cookie";
import type { AppEnv, Role } from "../types";
import { fail, isSameOriginRequest } from "../lib/http";
import { ADMIN_COOKIE, readAdminSession } from "../lib/session";

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isSameOriginRequest(c)) {
    return fail(c, 403, "Permintaan lintas origin ditolak.");
  }

  const token = getCookie(c, ADMIN_COOKIE);
  if (!token) return fail(c, 401, "Sesi tidak ditemukan. Silakan login.");

  const session = await readAdminSession(c.env, token);
  if (!session) {
    deleteCookie(c, ADMIN_COOKIE, { path: "/" });
    return fail(c, 401, "Sesi kedaluwarsa. Silakan login kembali.");
  }

  c.set("admin", session.admin);
  c.set("sessionId", session.sessionId);
  c.header("Cache-Control", "no-store");
  await next();
});

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const admin = c.get("admin");
    if (!admin) return fail(c, 401, "Sesi tidak ditemukan. Silakan login.");
    if (!roles.includes(admin.role)) {
      return fail(c, 403, "Anda tidak memiliki akses untuk tindakan ini.");
    }
    await next();
  });
