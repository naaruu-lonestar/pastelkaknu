#!/usr/bin/env node
/**
 * Menerapkan skema dan seed ke database Turso (atau file SQLite lokal).
 *
 * Pemakaian:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:push
 *   npm run db:push -- --url file:.local/pastel-ibu.db
 *
 * File bersifat idempoten: CREATE TABLE IF NOT EXISTS dan ON CONFLICT DO NOTHING,
 * jadi aman dijalankan berulang tanpa menimpa data admin.
 */
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

function readArg(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return "";
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
}

const url = readArg("url") || process.env.TURSO_DATABASE_URL || "";
const authToken = readArg("token") || process.env.TURSO_AUTH_TOKEN || "";

if (!url) {
  console.error(
    "TURSO_DATABASE_URL belum diatur. Isi .env atau jalankan: npm run db:push -- --url file:.local/pastel-ibu.db",
  );
  process.exit(1);
}

const files = ["migrations/0001_init.sql", "seeds/0001_products.sql"];

for (const file of files) {
  if (!existsSync(file)) {
    console.error(`File ${file} tidak ditemukan.`);
    process.exit(1);
  }
}

const client = createClient({ url, authToken: authToken || undefined });

try {
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    await client.executeMultiple(sql);
    console.log(`ok  ${file}`);
  }

  const products = await client.execute(
    "SELECT COUNT(*) AS total FROM products WHERE is_active = 1",
  );
  const capacity = await client.execute(
    "SELECT daily_capacity FROM production_settings WHERE id = 'default'",
  );
  console.log(
    `Selesai. Produk aktif: ${products.rows[0]?.total ?? 0}, kapasitas harian: ${
      capacity.rows[0]?.daily_capacity ?? "-"
    }.`,
  );
} catch (error) {
  console.error(
    "Gagal menerapkan skema:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
