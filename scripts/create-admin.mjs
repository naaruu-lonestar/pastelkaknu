#!/usr/bin/env node
/**
 * Membuat atau mereset akun admin Pastel Ibu.
 *
 * Pemakaian:
 *   node scripts/create-admin.mjs --email admin@pastelibu.id --password "rahasia-panjang" \
 *     --name "Ibu" --role OWNER [--remote]
 *
 * Password minimal 10 karakter. Hash memakai PBKDF2-SHA256 210.000 iterasi,
 * format yang sama dengan src/lib/password.ts.
 */
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? fallback : value;
}

const email = (readArg("email", process.env.ADMIN_EMAIL ?? "") ?? "").trim().toLowerCase();
const password = readArg("password", process.env.ADMIN_PASSWORD ?? "");
const name = (readArg("name", process.env.ADMIN_NAME ?? "Admin Pastel Ibu") ?? "").trim();
const role = (readArg("role", process.env.ADMIN_ROLE ?? "OWNER") ?? "").toUpperCase();
const database = readArg("database", process.env.D1_DATABASE_NAME ?? "pastel-ibu-db");
const remote = args.includes("--remote");

if (!email || !password) {
  console.error(
    'Wajib mengisi --email dan --password (atau env ADMIN_EMAIL / ADMIN_PASSWORD).',
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
const escapeSql = (value) => value.replace(/'/g, "''");

const sql = `INSERT INTO admin_users (id, name, email, password_hash, role, is_active, created_at, updated_at)
VALUES (
  '${id}',
  '${escapeSql(name)}',
  '${escapeSql(email)}',
  '${stored}',
  '${role}',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT (email) DO UPDATE SET
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = 1,
  updated_at = excluded.updated_at;

DELETE FROM admin_sessions
WHERE admin_user_id = (SELECT id FROM admin_users WHERE lower(email) = '${escapeSql(email)}');
`;

const directory = mkdtempSync(join(tmpdir(), "pastel-admin-"));
const file = join(directory, "create-admin.sql");
writeFileSync(file, sql, "utf8");

const wranglerArgs = ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local", "--file", file];
if (remote) wranglerArgs.push("--yes");

console.log(
  `Menyimpan akun admin ${email} (role ${role}) ke database ${database} ${remote ? "remote" : "lokal"}...`,
);

try {
  execFileSync("npx", wranglerArgs, { stdio: "inherit" });
  console.log("Selesai. Akun admin siap dipakai login.");
} catch (error) {
  console.error("Gagal menjalankan wrangler d1 execute.", error instanceof Error ? error.message : error);
  process.exit(1);
}
