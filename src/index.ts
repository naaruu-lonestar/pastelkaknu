import { Hono } from "hono";
import type { AppEnv } from "./types";
import { fail } from "./lib/http";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
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
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "degraded" }, 503);
  }
});

app.route("/api/public", publicRoutes);
app.route("/api/admin", adminRoutes);

app.notFound((c) => fail(c, 404, "Endpoint tidak ditemukan."));

app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return fail(c, 500, "Terjadi kesalahan pada server.");
});

export default app;
