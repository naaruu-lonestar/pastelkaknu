import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

export function fail(
  c: Context,
  status: number,
  message: string,
  details?: unknown,
) {
  const error: Record<string, unknown> = { message };
  if (details !== undefined) error.details = details;
  return c.json({ error }, status as ContentfulStatusCode);
}

export function zodDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

export function clientIp(c: Context): string {
  // x-real-ip diisi platform (Vercel), tidak bisa dipalsukan lewat body/header
  // permintaan. Nilai pertama x-forwarded-for berasal dari klien, jadi hanya
  // dipakai sebagai upaya terakhir.
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
}

/** Tolak permintaan tulis dari origin lain (proteksi CSRF untuk auth berbasis cookie). */
export function isSameOriginRequest(c: Context): boolean {
  const origin = c.req.header("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
