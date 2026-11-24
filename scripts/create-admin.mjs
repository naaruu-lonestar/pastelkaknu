#!/usr/bin/env node
/**
 * Membuat atau mereset akun admin Pastel Ibu.
 *
 * Pemakaian (password lewat env, supaya tidak tersimpan di riwayat perintah):
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
 *   ADMIN_EMAIL=admin@contoh.id ADMIN_PASSWORD='...' npm run admin:create
 *
 * Opsi lain: --name "Ibu" --role OWNER|STAFF --url --token
 *
 * Password minimal 10 karakter. Hash memakai PBKDF2-SHA256 210.000 iterasi,
 * format yang sama dengan src/lib/password.ts. Nilai di-bind sebagai parameter,
 * tidak pernah dirangkai ke dalam string SQL.
 */
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

function loadDotEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? fallback : value;
}

const email = (readArg("email", process.env.ADMIN_EMAIL ?? "") ?? "")
  .trim()
  .toLowerCase();
const password = readArg("password", process.env.ADMIN_PASSWORD ?? "");
const name = (readArg("name", process.env.ADMIN_NAME ?? "Admin Pastel Ibu") ?? "").trim();
const role = (readArg("role", process.env.ADMIN_ROLE ?? "OWNER") ?? "").toUpperCase();
const url = readArg("url") || process.env.TURSO_DATABASE_URL || "";
const authToken = readArg("token") || process.env.TURSO_AUTH_TOKEN || "";

if (!url) {
  console.error(
    "TURSO_DATABASE_URL belum diatur. Isi .env, atau pakai --url file:.local/pastel-ibu.db",
  );
  process.exit(1);
}
if (!email || !password) {
  console.error(
    "Wajib mengisi ADMIN_EMAIL dan ADMIN_PASSWORD (atau flag --email / --password).",
  );
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Format email tidak valid.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password minimal 10 karakter.");
  process.exit(1);
}
if (!["OWNER", "STAFF"].includes(role)) {
  console.error("Role harus OWNER atau STAFF.");
  process.exit(1);
}

const ITERATIONS = 210_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
const id = randomUUID();
const timestamp = new Date().toISOString();

const client = createClient({ url, authToken: authToken || undefined });

try {
  await client.execute({
    sql: `INSERT INTO admin_users (id, name, email, password_hash, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT (email) DO UPDATE SET
            name = excluded.name,
            password_hash = excluded.password_hash,
            role = excluded.role,
            is_active = 1,
            updated_at = excluded.updated_at`,
    args: [id, name, email, stored, role, timestamp, timestamp],
  });

  // Reset password/role membatalkan semua sesi lama akun itu.
  await client.execute({
    sql: `DELETE FROM admin_sessions
          WHERE admin_user_id = (SELECT id FROM admin_users WHERE lower(email) = ?)`,
    args: [email],
  });

  console.log(`Akun admin ${email} (role ${role}) siap dipakai login.`);
  console.log("Password tidak ditampilkan di sini; simpan di tempat aman.");
} catch (error) {
  console.error(
    "Gagal menyimpan akun admin:",
    error instanceof Error ? error.message : error,
  );
  console.error(
    "Pastikan skema sudah diterapkan (npm run db:push) dan URL/token database benar.",
  );
  process.exit(1);
}
