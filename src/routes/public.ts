import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { ORDER_TYPES, PURPOSES } from "../types";
import { clientIp, fail, readJson, zodDetails } from "../lib/http";
import { consumeRateLimit } from "../lib/rate-limit";
import { createOrder, OrderValidationError } from "../lib/orders";
import { jakartaToday } from "../lib/time";

const app = new Hono<AppEnv>();

const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z
    .string()
    .trim()
    .regex(
      /^(?:\+62|62|0)8[1-9][0-9]{6,11}$/,
      "Nomor WhatsApp tidak valid. Gunakan format 08xx atau 628xx.",
    ),
  purpose: z.enum(PURPOSES),
  orderType: z.enum(ORDER_TYPES),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."),
  deliveryTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Waktu tidak valid."),
  deliveryLocation: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(0).max(10_000),
      }),
    )
    .min(1)
    .max(10),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

app.get("/products", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, price, description, image_url AS imageUrl
     FROM products
     WHERE is_active = 1
     ORDER BY sort_order ASC, price ASC`,
  ).all<{
    id: string;
    name: string;
    price: number;
    description: string;
    imageUrl: string | null;
  }>();

  c.header("Cache-Control", "public, max-age=60");
  return c.json({ products: results });
});

app.get("/config", async (c) => {
  const number = (c.env.WHATSAPP_NUMBER ?? "6281234567890").replace(/\D/g, "");
  const dailyCapacity = await c.env.DB.prepare(
    "SELECT daily_capacity FROM production_settings WHERE id = 'default'",
  ).first<{ daily_capacity: number }>();

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    business: {
      name: c.env.BUSINESS_NAME ?? "Pastel Ibu",
      whatsappNumber: number,
      whatsappUrl: `https://wa.me/${number}`,
    },
    options: {
      purposes: PURPOSES,
      orderTypes: ORDER_TYPES,
    },
    today: jakartaToday(),
    dailyCapacity: Number(dailyCapacity?.daily_capacity ?? 300),
  });
});

app.post("/orders", async (c) => {
  const body = await readJson(c);
  if (body === null) {
    return fail(c, 400, "Body permintaan harus berupa JSON.");
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "Data pesanan tidak valid.", zodDetails(parsed.error));
  }

  const ip = clientIp(c);
  const limit = await consumeRateLimit(c.env.DB, `order:${ip}`, 30, 3600);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    return fail(c, 429, "Terlalu banyak pesanan dari perangkat ini. Coba lagi nanti.", {
      retryAfter: limit.retryAfter,
    });
  }

  try {
    const result = await createOrder(c.env, parsed.data);
    return c.json(
      {
        order: result.order,
        duplicate: result.duplicate,
        whatsapp: result.whatsapp,
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return fail(c, 400, error.message, error.details);
    }
    throw error;
  }
});

export default app;
