import { Hono } from "hono";
import { z } from "zod";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, OrderStatus } from "../types";
import { ORDER_STATUSES } from "../types";
import { clientIp, fail, isSameOriginRequest, readJson, zodDetails } from "../lib/http";
import { consumeRateLimit, resetRateLimit } from "../lib/rate-limit";
import { consumePasswordWork, verifyPassword } from "../lib/password";
import {
  ADMIN_COOKIE,
  createAdminSession,
  destroyAdminSession,
} from "../lib/session";
import { requireAdmin, requireRole } from "../middleware/auth";
import {
  addDays,
  eachDate,
  isIsoDate,
  jakartaToday,
  nowIso,
} from "../lib/time";
import {
  capacityStatus,
  getCapacity,
  getDailyCapacity,
  loadOrderDetail,
} from "../lib/orders";

const app = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().trim().min(3).max(190).email("Email tidak valid."),
  password: z.string().min(1).max(200),
});

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
});

const productFields = {
  name: z.string().trim().min(2).max(100),
  price: z.number().int().min(1).max(10_000_000),
  description: z.string().trim().max(500),
  imageUrl: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
};

const productCreateSchema = z.object({
  name: productFields.name,
  price: productFields.price,
  description: productFields.description.optional(),
  imageUrl: productFields.imageUrl.optional(),
  isActive: productFields.isActive.optional(),
  sortOrder: productFields.sortOrder.optional(),
});

const productPatchSchema = z.object(productFields).partial();

const productionSettingsSchema = z.object({
  dailyCapacity: z.number().int().min(1).max(100_000),
});

interface AdminRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: number;
}

/* ------------------------------------------------------------------ auth */

app.post("/auth/login", async (c) => {
  if (!isSameOriginRequest(c)) {
    return fail(c, 403, "Permintaan lintas origin ditolak.");
  }

  const body = await readJson(c);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 401, "Email atau password salah.");
  }

  const db = c.env.DB;
  const ip = clientIp(c);
  const email = parsed.data.email.toLowerCase();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${email}`;

  const ipLimit = await consumeRateLimit(db, ipKey, 10, 900);
  if (!ipLimit.allowed) {
    c.header("Retry-After", String(ipLimit.retryAfter));
    return fail(c, 429, "Terlalu banyak percobaan login. Coba lagi nanti.", {
      retryAfter: ipLimit.retryAfter,
    });
  }

  const emailLimit = await consumeRateLimit(db, emailKey, 5, 900);
  if (!emailLimit.allowed) {
    c.header("Retry-After", String(emailLimit.retryAfter));
    return fail(c, 429, "Akun sementara dikunci karena percobaan login gagal.", {
      retryAfter: emailLimit.retryAfter,
    });
  }

  const user = await db
    .prepare(
      "SELECT id, name, email, password_hash, role, is_active FROM admin_users WHERE lower(email) = ?",
    )
    .bind(email)
    .first<AdminRow>();

  if (!user || user.is_active !== 1) {
    await consumePasswordWork(parsed.data.password);
    return fail(c, 401, "Email atau password salah.");
  }

  const valid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!valid) return fail(c, 401, "Email atau password salah.");

  await resetRateLimit(db, [ipKey, emailKey]);

  const session = await createAdminSession(
    c.env,
    user.id,
    c.req.header("user-agent") ?? "",
  );

  setCookie(c, ADMIN_COOKIE, session.token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: session.maxAgeSeconds,
  });

  c.header("Cache-Control", "no-store");
  return c.json({
    admin: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    expiresAt: session.expiresAt,
  });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, ADMIN_COOKIE);
  if (token) await destroyAdminSession(c.env, token);
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/auth/me", requireAdmin, (c) => {
  return c.json({ admin: c.get("admin") });
});

/* -------------------------------------------------------------- dashboard */

app.get("/dashboard", requireAdmin, async (c) => {
  const db = c.env.DB;
  const dateParam = c.req.query("date") ?? "";
  const date = isIsoDate(dateParam) ? dateParam : jakartaToday();

  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_orders,
         COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END), 0) AS confirmed_orders,
         COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END), 0) AS processing_orders,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_orders,
         COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
         COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total_quantity ELSE 0 END), 0) AS total_products
       FROM orders`,
    )
    .first<{
      total_orders: number;
      pending_orders: number;
      confirmed_orders: number;
      processing_orders: number;
      completed_orders: number;
      cancelled_orders: number;
      total_products: number;
    }>();

  const capacity = await getCapacity(db, date);
  const dailyCapacity = await getDailyCapacity(db);

  const { results: upcomingRows } = await db
    .prepare(
      `SELECT delivery_date AS date,
              COUNT(*) AS order_count,
              COALESCE(SUM(total_quantity), 0) AS total_quantity
       FROM orders
       WHERE status != 'CANCELLED' AND delivery_date BETWEEN ? AND ?
       GROUP BY delivery_date
       ORDER BY delivery_date ASC`,
    )
    .bind(date, addDays(date, 6))
    .all<{ date: string; order_count: number; total_quantity: number }>();

  const upcomingByDate = new Map(upcomingRows.map((row) => [row.date, row]));
  const upcoming = eachDate(date, addDays(date, 6), 7).map((day) => {
    const row = upcomingByDate.get(day);
    const totalQuantity = Number(row?.total_quantity ?? 0);
    return {
      date: day,
      orderCount: Number(row?.order_count ?? 0),
      totalQuantity,
      ...capacityStatus(totalQuantity, dailyCapacity),
    };
  });

  const { results: recentOrders } = await db
    .prepare(
      `SELECT id, order_number AS orderNumber, customer_name AS customerName,
              delivery_date AS deliveryDate, total_quantity AS totalQuantity,
              total_price AS totalPrice, status, created_at AS createdAt
       FROM orders
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all();

  return c.json({
    date,
    stats: {
      totalOrders: Number(totals?.total_orders ?? 0),
      totalProducts: Number(totals?.total_products ?? 0),
      pendingOrders: Number(totals?.pending_orders ?? 0),
      confirmedOrders: Number(totals?.confirmed_orders ?? 0),
      processingOrders: Number(totals?.processing_orders ?? 0),
      completedOrders: Number(totals?.completed_orders ?? 0),
      cancelledOrders: Number(totals?.cancelled_orders ?? 0),
    },
    capacity,
    upcoming,
    recentOrders,
  });
});

/* ----------------------------------------------------------------- orders */

app.get("/orders", requireAdmin, async (c) => {
  const db = c.env.DB;
  const q = (c.req.query("q") ?? "").trim();
  const statusParam = (c.req.query("status") ?? "").trim().toUpperCase();
  const date = (c.req.query("date") ?? "").trim();
  const from = (c.req.query("from") ?? "").trim();
  const to = (c.req.query("to") ?? "").trim();
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query("perPage") ?? "20", 10) || 20),
  );

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    where.push(
      "(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)",
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  if (statusParam) {
    if (!ORDER_STATUSES.includes(statusParam as OrderStatus)) {
      return fail(c, 400, "Status pesanan tidak dikenal.");
    }
    where.push("status = ?");
    params.push(statusParam);
  }

  if (date) {
    if (!isIsoDate(date)) return fail(c, 400, "Tanggal filter tidak valid.");
    where.push("delivery_date = ?");
    params.push(date);
  } else {
    if (from) {
      if (!isIsoDate(from)) return fail(c, 400, "Tanggal awal tidak valid.");
      where.push("delivery_date >= ?");
      params.push(from);
    }
    if (to) {
      if (!isIsoDate(to)) return fail(c, 400, "Tanggal akhir tidak valid.");
      where.push("delivery_date <= ?");
      params.push(to);
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM orders ${whereSql}`)
    .bind(...params)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  const { results } = await db
    .prepare(
      `SELECT id, order_number AS orderNumber, customer_name AS customerName,
              customer_phone AS customerPhone, delivery_date AS deliveryDate,
              delivery_time AS deliveryTime, total_quantity AS totalQuantity,
              total_price AS totalPrice, status, created_at AS createdAt,
              updated_at AS updatedAt
       FROM orders
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, perPage, (page - 1) * perPage)
    .all();

  return c.json({
    orders: results,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
});

app.get("/orders/:id", requireAdmin, async (c) => {
  const order = await loadOrderDetail(c.env.DB, c.req.param("id"));
  if (!order) return fail(c, 404, "Pesanan tidak ditemukan.");
  return c.json({ order });
});

app.patch("/orders/:id/status", requireAdmin, async (c) => {
  const body = await readJson(c);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "Status pesanan tidak valid.", zodDetails(parsed.error));
  }

  const db = c.env.DB;
  const admin = c.get("admin");
  const current = await db
    .prepare(
      "SELECT id, status, delivery_date FROM orders WHERE id = ? OR order_number = ?",
    )
    .bind(c.req.param("id"), c.req.param("id"))
    .first<{ id: string; status: string; delivery_date: string }>();

  if (!current) return fail(c, 404, "Pesanan tidak ditemukan.");

  const nextStatus = parsed.data.status;
  if (current.status === nextStatus) {
    const order = await loadOrderDetail(db, current.id);
    return c.json({ order, changed: false });
  }

  const now = nowIso();
  await db.batch([
    db
      .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
      .bind(nextStatus, now, current.id),
    db
      .prepare(
        `INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        current.id,
        current.status,
        nextStatus,
        admin.id,
        parsed.data.note ?? "",
        now,
      ),
  ]);

  const order = await loadOrderDetail(db, current.id);
  const capacity = await getCapacity(db, current.delivery_date);

  return c.json({
    order,
    changed: true,
    capacity,
    capacityWarning:
      nextStatus !== "CANCELLED" && capacity.totalQuantity > capacity.dailyCapacity,
  });
});

/* --------------------------------------------------------------- products */

app.get("/products", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, price, description, image_url AS imageUrl, is_active AS isActive,
            sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
     FROM products
     ORDER BY sort_order ASC, price ASC`,
  ).all<Record<string, unknown>>();

  return c.json({
    products: results.map((row) => ({ ...row, isActive: Number(row.isActive) === 1 })),
  });
});

app.post("/products", requireAdmin, requireRole("OWNER"), async (c) => {
  const body = await readJson(c);
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "Data produk tidak valid.", zodDetails(parsed.error));
  }

  const data = parsed.data;
  const id = crypto.randomUUID();
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO products (id, name, price, description, image_url, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      data.name,
      data.price,
      data.description ?? "",
      data.imageUrl ?? null,
      data.isActive === false ? 0 : 1,
      data.sortOrder ?? 0,
      now,
      now,
    )
    .run();

  return c.json({ product: { id, name: data.name, price: data.price } }, 201);
});

app.patch("/products/:id", requireAdmin, requireRole("OWNER"), async (c) => {
  const body = await readJson(c);
  const parsed = productPatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "Data produk tidak valid.", zodDetails(parsed.error));
  }

  const data = parsed.data;
  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name);
  }
  if (data.price !== undefined) {
    updates.push("price = ?");
    params.push(data.price);
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description);
  }
  if (data.imageUrl !== undefined) {
    updates.push("image_url = ?");
    params.push(data.imageUrl);
  }
  if (data.isActive !== undefined) {
    updates.push("is_active = ?");
    params.push(data.isActive ? 1 : 0);
  }
  if (data.sortOrder !== undefined) {
    updates.push("sort_order = ?");
    params.push(data.sortOrder);
  }

  if (updates.length === 0) {
    return fail(c, 400, "Tidak ada perubahan yang dikirim.");
  }

  updates.push("updated_at = ?");
  params.push(nowIso());
  params.push(c.req.param("id"));

  const result = await c.env.DB.prepare(
    `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
  )
    .bind(...params)
    .run();

  if (!result.meta.changes) return fail(c, 404, "Produk tidak ditemukan.");

  return c.json({ ok: true });
});

/* ------------------------------------------------------------- production */

app.get("/production", requireAdmin, async (c) => {
  const db = c.env.DB;
  const fromParam = (c.req.query("from") ?? "").trim();
  const toParam = (c.req.query("to") ?? "").trim();
  const from = isIsoDate(fromParam) ? fromParam : jakartaToday();
  const to = isIsoDate(toParam) ? toParam : addDays(from, 13);

  if (to < from) return fail(c, 400, "Rentang tanggal tidak valid.");
  if (to > addDays(from, 91)) {
    return fail(c, 400, "Rentang maksimal 92 hari.");
  }

  const dailyCapacity = await getDailyCapacity(db);
  const { results } = await db
    .prepare(
      `SELECT delivery_date AS date,
              COUNT(*) AS order_count,
              COALESCE(SUM(total_quantity), 0) AS total_quantity
       FROM orders
       WHERE status != 'CANCELLED' AND delivery_date BETWEEN ? AND ?
       GROUP BY delivery_date
       ORDER BY delivery_date ASC`,
    )
    .bind(from, to)
    .all<{ date: string; order_count: number; total_quantity: number }>();

  const byDate = new Map(results.map((row) => [row.date, row]));
  const days = eachDate(from, to).map((date) => {
    const row = byDate.get(date);
    const totalQuantity = Number(row?.total_quantity ?? 0);
    return {
      date,
      orderCount: Number(row?.order_count ?? 0),
      totalQuantity,
      ...capacityStatus(totalQuantity, dailyCapacity),
    };
  });

  return c.json({ from, to, dailyCapacity, days });
});

app.patch(
  "/production/settings",
  requireAdmin,
  requireRole("OWNER"),
  async (c) => {
    const body = await readJson(c);
    const parsed = productionSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "Kapasitas produksi tidak valid.",
        zodDetails(parsed.error),
      );
    }

    const admin = c.get("admin");
    const now = nowIso();
    const capacity = parsed.data.dailyCapacity;

    await c.env.DB.prepare(
      `INSERT INTO production_settings (id, daily_capacity, updated_by, updated_at)
       VALUES ('default', ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         daily_capacity = excluded.daily_capacity,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
      .bind(capacity, admin.id, now)
      .run();

    return c.json({ dailyCapacity: capacity, updatedAt: now });
  },
);

export default app;
