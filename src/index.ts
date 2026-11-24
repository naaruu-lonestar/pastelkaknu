import { Hono } from "hono";
import type { AppEnv } from "./types";
import { fail } from "./lib/http";
import { databaseIssue } from "./lib/errors";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";

const app = new Hono<AppEnv>();

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  c.header("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  if (new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
});

app.use("/api/admin/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/", (c) =>
  c.json({
    name: c.env.BUSINESS_NAME ?? "Pastel Ibu",
    version: "0.1.0",
    endpoints: {
      public: ["GET /api/public/products", "GET /api/public/config", "POST /api/public/orders"],
      admin: [
        "POST /api/admin/auth/login",
        "POST /api/admin/auth/logout",
        "GET /api/admin/auth/me",
        "GET /api/admin/dashboard",
        "GET /api/admin/orders",
        "GET /api/admin/orders/:id",
        "PATCH /api/admin/orders/:id/status",
        "GET /api/admin/products",
        "POST /api/admin/products",
        "PATCH /api/admin/products/:id",
        "GET /api/admin/production",
        "PATCH /api/admin/production/settings",
      ],
      health: "GET /api/health",
    },
  }),
);

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
  } catch (error) {
    const issue = databaseIssue(error);
    return c.json(
      {
        status: "degraded",
        database: { connected: false, code: issue?.code ?? "DB_UNAVAILABLE" },
        hint: issue?.message ?? "Database tidak bisa dihubungi.",
      },
      503,
    );
  }

  try {
    const products = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM products WHERE is_active = 1",
    ).first<{ total: number }>();
    const admins = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM admin_users",
    ).first<{ total: number }>();

    return c.json({
      status: "ok",
      database: { connected: true, schemaReady: true },
      activeProducts: Number(products?.total ?? 0),
      adminConfigured: Number(admins?.total ?? 0) > 0,
    });
  } catch (error) {
    const issue = databaseIssue(error);
    return c.json(
      {
        status: "degraded",
        database: { connected: true, schemaReady: false, code: issue?.code ?? "DB_SCHEMA_MISSING" },
        hint: issue?.message ?? "Skema database belum siap.",
      },
      503,
    );
  }
});

app.route("/api/public", publicRoutes);
app.route("/api/admin", adminRoutes);

app.notFound((c) => fail(c, 404, "Endpoint tidak ditemukan."));

app.onError((error, c) => {
  console.error("Unhandled error:", error);

  // Masalah database bukan kesalahan pemrograman: jawab 503 dengan pesan yang
  // bisa ditindaklanjuti, bukan 500 generik tanpa petunjuk.
  const issue = databaseIssue(error);
  if (issue) {
    c.header("Cache-Control", "no-store");
    return c.json({ error: { code: issue.code, message: issue.message } }, 503);
  }

  return fail(c, 500, "Terjadi kesalahan pada server.");
});

export default app;
