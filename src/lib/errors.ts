/**
 * Menerjemahkan error database jadi pesan yang bisa ditindaklanjuti.
 *
 * Tanpa ini, database yang belum punya tabel atau token Turso yang salah tampil
 * sebagai "500 Terjadi kesalahan pada server", dan penyebabnya hanya terlihat di
 * log platform.
 */
export interface DatabaseIssue {
  status: 503;
  code:
    | "DB_SCHEMA_MISSING"
    | "DB_AUTH_FAILED"
    | "DB_UNAVAILABLE";
  message: string;
}

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: { code?: unknown; message?: unknown };
}

export function databaseIssue(error: unknown): DatabaseIssue | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as ErrorLike;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const causeMessage =
    candidate.cause && typeof candidate.cause.message === "string"
      ? candidate.cause.message
      : "";
  const code = [
    typeof candidate.code === "string" ? candidate.code : "",
    candidate.cause && typeof candidate.cause.code === "string"
      ? candidate.cause.code
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const haystack = `${message} ${causeMessage} ${code}`;

  const looksLikeDatabase =
    candidate.name === "LibsqlError" ||
    /^SQLITE_/.test(code) ||
    /\b(SERVER_ERROR|HRANA_[A-Z_]+|URL_[A-Z_]+|AUTH_[A-Z_]+|WEBSOCKET_[A-Z_]+|PROTO_ERROR)\b/.test(
      code,
    ) ||
    /no such table|SQLITE_|libsql|LibsqlError/i.test(haystack);

  if (!looksLikeDatabase) return null;

  if (/no such table/i.test(haystack)) {
    return {
      status: 503,
      code: "DB_SCHEMA_MISSING",
      message:
        "Database belum memiliki tabel yang dibutuhkan. Buka /api/health untuk memeriksa, lalu jalankan `npm run db:push` dengan TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN yang sama seperti di Vercel.",
    };
  }

  if (/\b(AUTH_[A-Z_]+|UNAUTHORIZED|FORBIDDEN)\b/i.test(haystack) || /\b401\b|\b403\b/.test(haystack)) {
    return {
      status: 503,
      code: "DB_AUTH_FAILED",
      message:
        "Token database ditolak. Periksa TURSO_AUTH_TOKEN di Vercel: nilainya harus token untuk database TURSO_DATABASE_URL yang dipakai.",
    };
  }

  if (/URL_[A-Z_]+|invalid.*url|unsupported.*url/i.test(haystack)) {
    return {
      status: 503,
      code: "DB_UNAVAILABLE",
      message:
        "TURSO_DATABASE_URL tidak valid. Gunakan alamat lengkap, misalnya libsql://nama-db-org.turso.io.",
    };
  }

  return {
    status: 503,
    code: "DB_UNAVAILABLE",
    message:
      "Database tidak bisa dihubungi. Periksa TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di Vercel, lalu lihat /api/health.",
  };
}
