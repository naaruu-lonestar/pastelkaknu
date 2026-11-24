/**
 * Server pengembangan lokal.
 *
 * Menjalankan aplikasi Hono di Node memakai env dari .env, plus menyajikan folder
 * public/ (di produksi tugas itu dilakukan CDN Vercel). Database lokal bisa berupa
 * file SQLite lewat libSQL.
 *
 *   npm run dev   → http://localhost:3000
 */
import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import app from "./index";
import type { Env } from "./types";
import { createEnv } from "./lib/env";
import { ensureDatabase } from "./lib/bootstrap";

function loadDotEnv(): void {
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

let env: Env;
try {
  env = createEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "Buat file .env dari .env.example, lalu isi TURSO_DATABASE_URL (boleh file:.local/pastel-ibu.db untuk lokal).",
  );
  process.exit(1);
}

try {
  await ensureDatabase(env);
} catch (error) {
  console.error("Gagal menyiapkan database:", error);
  process.exit(1);
}

const server = new Hono();

server.get("/admin", (c) => c.redirect("/admin/"));

// Aset statis lebih dulu; kalau tidak ada file yang cocok, lanjut ke aplikasi.
server.use("/*", serveStatic({ root: "./public" }));
server.all("/*", (c) => app.fetch(c.req.raw, env));

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: server.fetch, port, hostname }, (info) => {
  console.log(`Pastel Ibu berjalan di http://${hostname}:${info.port}`);
  console.log("Situs publik: /   Dashboard admin: /admin/");
});
