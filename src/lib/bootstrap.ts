/**
 * Menyiapkan database pada permintaan pertama.
 *
 * Database Turso yang baru dibuat belum punya tabel, sehingga katalog dan login
 * gagal dengan "no such table". Bootstrap ini menjalankan skema + seed yang
 * idempoten, lalu membuat akun admin awal dari ADMIN_EMAIL / ADMIN_PASSWORD bila
 * tabel admin masih kosong. Hasilnya disimpan per instance function, jadi biaya
 * tambahannya hanya pada cold start.
 */
import type { Env } from "../types";
import { hashPassword } from "./password";
import { SCHEMA_STATEMENTS, SEED_STATEMENTS } from "./schema";

const MIN_PASSWORD_LENGTH = 10;

const pending = new WeakMap<object, Promise<void>>();

export function ensureDatabase(env: Env): Promise<void> {
  const key = env.DB as unknown as object;
  const existing = pending.get(key);
  if (existing) return existing;

  const task = bootstrap(env).catch((error) => {
    // Jangan simpan kegagalan: permintaan berikutnya boleh mencoba lagi.
    pending.delete(key);
    throw error;
  });

  pending.set(key, task);
  return task;
}

async function bootstrap(env: Env): Promise<void> {
  const db = env.DB;
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
  await db.batch(SEED_STATEMENTS.map((sql) => db.prepare(sql)));
  await ensureInitialAdmin(env);
}

async function ensureInitialAdmin(env: Env): Promise<void> {
  const email = (env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? "";

  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    if (email || password) {
      console.warn(
        "ADMIN_EMAIL/ADMIN_PASSWORD diabaikan: isi keduanya dan gunakan password minimal 10 karakter.",
      );
    }
    return;
  }

  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM admin_users",
  ).first<{ total: number }>();

  if (Number(total?.total ?? 0) > 0) return;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_users (id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'OWNER', 1, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      (env.ADMIN_NAME ?? "").trim() || "Admin Pastel Ibu",
      email,
      await hashPassword(password),
      now,
      now,
    )
    .run();

  console.info(`Akun admin awal dibuat dari env: ${email}`);
}
