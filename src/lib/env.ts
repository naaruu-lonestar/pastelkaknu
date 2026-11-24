import type { Env } from "../types";
import { createDatabase, type Database } from "./database";

let database: Database | null = null;
let databaseUrl: string | null = null;

function getDatabase(): Database {
  const url = (process.env.TURSO_DATABASE_URL ?? "").trim();
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL belum diatur. Tambahkan variabel lingkungan itu (dan TURSO_AUTH_TOKEN) di Vercel.",
    );
  }

  // Klien dipakai ulang di dalam satu instance function agar koneksi tidak dibuat
  // ulang pada setiap request.
  if (!database || databaseUrl !== url) {
    database = createDatabase({
      url,
      authToken: (process.env.TURSO_AUTH_TOKEN ?? "").trim() || undefined,
    });
    databaseUrl = url;
  }
  return database;
}

export function createEnv(): Env {
  return {
    DB: getDatabase(),
    BUSINESS_NAME: process.env.BUSINESS_NAME?.trim() || "Pastel Ibu",
    WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER?.trim() || "6281234567890",
    ADMIN_SESSION_TTL_HOURS: process.env.ADMIN_SESSION_TTL_HOURS?.trim() || "8",
  };
}
