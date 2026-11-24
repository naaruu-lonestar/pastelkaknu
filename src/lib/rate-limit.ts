import type { Database } from "./database";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

/**
 * Fixed-window rate limit di D1. Satu baris per key, direset saat jendela habis.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  // Bersihkan baris lama sesekali agar tabel tidak tumbuh tanpa batas.
  if (Math.random() < 0.02) {
    await db
      .prepare("DELETE FROM rate_limits WHERE window_start <= ?")
      .bind(now - 86_400)
      .run();
  }

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (limit_key, hit_count, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT (limit_key) DO UPDATE SET
         hit_count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.hit_count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= ? THEN ? ELSE rate_limits.window_start END
       RETURNING hit_count, window_start`,
    )
    .bind(key, now, windowStart, windowStart, now)
    .first<{ hit_count: number; window_start: number }>();

  const hitCount = Number(row?.hit_count ?? 1);
  const startedAt = Number(row?.window_start ?? now);
  const retryAfter = Math.max(0, startedAt + windowSeconds - now);

  return {
    allowed: hitCount <= limit,
    limit,
    remaining: Math.max(0, limit - hitCount),
    retryAfter,
  };
}

export async function resetRateLimit(db: Database, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db
    .prepare(
      `DELETE FROM rate_limits WHERE limit_key IN (${keys.map(() => "?").join(", ")})`,
    )
    .bind(...keys)
    .run();
}
