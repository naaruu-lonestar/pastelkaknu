/**
 * Satu-satunya Vercel Function untuk API.
 *
 * vercel.json menulis ulang /api/<path> menjadi /api/handler?route=<path>, pola
 * capture wildcard yang didokumentasikan Vercel. Routing karena itu tidak
 * bergantung pada dukungan catch-all di folder api/, dan aset public/ tetap
 * dilayani langsung oleh CDN Vercel.
 */
import app from "../src/index";
import type { Env } from "../src/types";
import { createEnv } from "../src/lib/env";
import { ensureDatabase } from "../src/lib/bootstrap";
import { databaseIssue } from "../src/lib/errors";

/** Pulihkan URL /api/... asli (path + query) sebelum masuk ke aplikasi Hono. */
async function restoreApiRequest(request: Request): Promise<Request> {
  const url = new URL(request.url);
  const route = url.searchParams.get("route");
  if (route === null) return request;

  url.searchParams.delete("route");
  const target = new URL(`/api/${route.replace(/^\/+/, "")}`, url.origin);
  target.search = url.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  return new Request(target, {
    method: request.method,
    headers: request.headers,
    body,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    let env: Env;
    try {
      env = createEnv();
    } catch (error) {
      console.error("Konfigurasi runtime belum siap:", error);
      return Response.json(
        {
          error: {
            message:
              "Server belum dikonfigurasi. Hubungi admin: variabel database belum diatur.",
          },
        },
        { status: 503 },
      );
    }

    // Database Turso baru belum punya tabel; siapkan skema + seed + admin awal
    // sebelum request pertama dilayani. Aman dipanggil berulang.
    try {
      await ensureDatabase(env);
    } catch (error) {
      console.error("Bootstrap database gagal:", error);
      const issue = databaseIssue(error);
      return Response.json(
        {
          error: {
            code: issue?.code ?? "DB_BOOTSTRAP_FAILED",
            message:
              issue?.message ??
              "Database belum siap dipakai. Periksa TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN, lalu lihat /api/health.",
          },
        },
        { status: 503 },
      );
    }

    return app.fetch(await restoreApiRequest(request), env);
  },
};
