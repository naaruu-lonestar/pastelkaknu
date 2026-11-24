/**
 * Entry point Vercel Functions.
 *
 * Semua permintaan /api/* masuk ke satu function ini (catch-all), lalu diteruskan
 * ke aplikasi Hono yang sama dengan yang dipakai di lokal. Aset statis di public/
 * dilayani Vercel langsung dari CDN, jadi situs publik dan /admin tetap satu origin.
 */
import app from "../src/index";
import type { Env } from "../src/types";
import { createEnv } from "../src/lib/env";

function resolveEnv(): Env | null {
  try {
    return createEnv();
  } catch (error) {
    console.error("Konfigurasi runtime belum siap:", error);
    return null;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const env = resolveEnv();
    if (!env) {
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
    return app.fetch(request, env);
  },
};
