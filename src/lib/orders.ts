import type { Env, OrderStatus } from "../types";
import type { Database } from "./database";
import {
  addDays,
  isIsoDate,
  isIsoTime,
  jakartaToday,
  nowIso,
} from "./time";

export type CapacityCondition = "AMAN" | "HAMPIR_PENUH" | "MELEBIHI";

export interface CapacityStatus {
  dailyCapacity: number;
  remaining: number;
  usagePercent: number;
  condition: CapacityCondition;
  label: string;
}

const DEFAULT_DAILY_CAPACITY = 300;

export function capacityStatus(
  totalQuantity: number,
  dailyCapacity: number,
): CapacityStatus {
  const capacity = dailyCapacity > 0 ? dailyCapacity : DEFAULT_DAILY_CAPACITY;
  const usagePercent = Math.round((totalQuantity / capacity) * 100);

  let condition: CapacityCondition = "AMAN";
  if (usagePercent >= 100) condition = "MELEBIHI";
  else if (usagePercent >= 80) condition = "HAMPIR_PENUH";

  const label =
    condition === "MELEBIHI"
      ? "Melebihi kapasitas"
      : condition === "HAMPIR_PENUH"
        ? "Hampir penuh"
        : "Aman";

  return {
    dailyCapacity: capacity,
    remaining: capacity - totalQuantity,
    usagePercent,
    condition,
    label,
  };
}

export async function getDailyCapacity(db: Database): Promise<number> {
  const row = await db
    .prepare("SELECT daily_capacity FROM production_settings WHERE id = 'default'")
    .first<{ daily_capacity: number }>();
  return Number(row?.daily_capacity ?? DEFAULT_DAILY_CAPACITY);
}

export interface DayCapacity extends CapacityStatus {
  date: string;
  orderCount: number;
  totalQuantity: number;
}

export async function getCapacity(
  db: Database,
  date: string,
): Promise<DayCapacity> {
  const dailyCapacity = await getDailyCapacity(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_quantity), 0) AS total_quantity
       FROM orders
       WHERE delivery_date = ? AND status != 'CANCELLED'`,
    )
    .bind(date)
    .first<{ order_count: number; total_quantity: number }>();

  const totalQuantity = Number(row?.total_quantity ?? 0);
  return {
    date,
    orderCount: Number(row?.order_count ?? 0),
    totalQuantity,
    ...capacityStatus(totalQuantity, dailyCapacity),
  };
}

export class OrderValidationError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "OrderValidationError";
    this.details = details;
  }
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  purpose: string;
  orderType: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryLocation: string;
  notes?: string;
  items: OrderItemInput[];
  idempotencyKey?: string;
}

export interface OrderItemView {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  purpose: string;
  orderType: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryLocation: string;
  notes: string;
  totalQuantity: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItemView[];
}

export interface StatusHistoryView {
  previousStatus: string | null;
  newStatus: string;
  changedBy: string;
  note: string;
  createdAt: string;
}

export interface OrderDetail extends OrderView {
  history: StatusHistoryView[];
}

export interface WhatsappPayload {
  number: string;
  message: string;
  url: string;
}

export interface CreatedOrder {
  order: OrderDetail;
  duplicate: boolean;
  whatsapp: WhatsappPayload;
}

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  purpose: string;
  order_type: string;
  delivery_date: string;
  delivery_time: string;
  delivery_location: string;
  notes: string;
  total_quantity: number;
  total_price: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  subtotal: number;
}

interface HistoryRow {
  previous_status: string | null;
  new_status: string;
  changed_by: string;
  note: string;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  is_active: number;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    bytes,
    (byte) => ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length],
  ).join("");
}

export function generateOrderNumber(todayIsoDate: string): string {
  return `PI-${todayIsoDate.slice(2).replace(/-/g, "")}-${randomCode(4)}`;
}

export function mapOrder(row: OrderRow, items: ItemRow[] = []): OrderView {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    purpose: row.purpose,
    orderType: row.order_type,
    deliveryDate: row.delivery_date,
    deliveryTime: row.delivery_time,
    deliveryLocation: row.delivery_location,
    notes: row.notes,
    totalQuantity: Number(row.total_quantity),
    totalPrice: Number(row.total_price),
    status: row.status as OrderStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.product_name_snapshot,
      unitPrice: Number(item.unit_price_snapshot),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    })),
  };
}

export async function loadOrderDetail(
  db: Database,
  idOrNumber: string,
): Promise<OrderDetail | null> {
  const order = await db
    .prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?")
    .bind(idOrNumber, idOrNumber)
    .first<OrderRow>();

  if (!order) return null;

  const { results: items } = await db
    .prepare(
      "SELECT product_id, product_name_snapshot, unit_price_snapshot, quantity, subtotal FROM order_items WHERE order_id = ? ORDER BY product_name_snapshot",
    )
    .bind(order.id)
    .all<ItemRow>();

  const { results: history } = await db
    .prepare(
      "SELECT previous_status, new_status, changed_by, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC",
    )
    .bind(order.id)
    .all<HistoryRow>();

  return {
    ...mapOrder(order, items),
    history: history.map((entry) => ({
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      changedBy: entry.changed_by,
      note: entry.note,
      createdAt: entry.created_at,
    })),
  };
}

function buildWhatsappMessage(
  orderNumber: string,
  input: CreateOrderInput,
  items: OrderItemView[],
  totalQuantity: number,
  totalPrice: number,
): string {
  return [
    "*PESANAN BARU — PASTEL IBU*",
    "",
    `No. pesanan: ${orderNumber}`,
    `Nama: ${input.customerName}`,
    `WhatsApp: ${input.customerPhone}`,
    `Keperluan: ${input.purpose}`,
    `Jenis pesanan: ${input.orderType}`,
    "",
    ...items.map(
      (item) =>
        `${item.name}: ${item.quantity} pcs x ${rupiah(item.unitPrice)} = ${rupiah(item.subtotal)}`,
    ),
    "",
    `Total jumlah: ${totalQuantity} pcs`,
    `Total harga: ${rupiah(totalPrice)}`,
    "",
    `Tanggal: ${input.deliveryDate}`,
    `Waktu: ${input.deliveryTime}`,
    `Lokasi: ${input.deliveryLocation}`,
    `Catatan: ${input.notes?.trim() || "-"}`,
    "",
    "Mohon konfirmasi pesanan ini.",
  ].join("\n");
}

export function buildWhatsapp(
  env: Env,
  orderNumber: string,
  input: CreateOrderInput,
  items: OrderItemView[],
  totalQuantity: number,
  totalPrice: number,
): WhatsappPayload {
  const number = (env.WHATSAPP_NUMBER ?? "6281234567890").replace(/\D/g, "");
  const message = buildWhatsappMessage(
    orderNumber,
    input,
    items,
    totalQuantity,
    totalPrice,
  );
  return {
    number,
    message,
    url: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
  };
}

async function findByIdempotencyKey(
  db: Database,
  key: string,
): Promise<OrderDetail | null> {
  const row = await db
    .prepare("SELECT id FROM orders WHERE idempotency_key = ?")
    .bind(key)
    .first<{ id: string }>();
  if (!row) return null;
  return loadOrderDetail(db, row.id);
}

export async function createOrder(
  env: Env,
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  const db = env.DB;
  const today = jakartaToday();

  if (!isIsoDate(input.deliveryDate)) {
    throw new OrderValidationError("Format tanggal pengiriman tidak valid.");
  }
  if (input.deliveryDate < today) {
    throw new OrderValidationError(
      "Tanggal pengiriman tidak boleh sebelum hari ini.",
    );
  }
  if (input.deliveryDate > addDays(today, 180)) {
    throw new OrderValidationError(
      "Tanggal pengiriman terlalu jauh. Maksimal 180 hari ke depan.",
    );
  }
  if (!isIsoTime(input.deliveryTime)) {
    throw new OrderValidationError("Format waktu pengiriman tidak valid.");
  }

  const merged = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new OrderValidationError(
        "Jumlah produk harus bilangan bulat dan tidak negatif.",
      );
    }
    if (item.quantity === 0) continue;
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  if (merged.size === 0) {
    throw new OrderValidationError("Pilih minimal satu produk.");
  }
  for (const quantity of merged.values()) {
    if (quantity > 10_000) {
      throw new OrderValidationError(
        "Jumlah produk melebihi batas 10.000 pcs per pesanan.",
      );
    }
  }

  const ids = [...merged.keys()];
  const { results: products } = await db
    .prepare(
      `SELECT id, name, price, is_active FROM products WHERE id IN (${ids.map(() => "?").join(", ")})`,
    )
    .bind(...ids)
    .all<ProductRow>();

  const productsById = new Map(products.map((product) => [product.id, product]));

  const items: OrderItemView[] = [];
  let totalQuantity = 0;
  let totalPrice = 0;

  for (const [productId, quantity] of merged) {
    const product = productsById.get(productId);
    if (!product) {
      throw new OrderValidationError("Produk tidak ditemukan.", { productId });
    }
    if (!product.is_active) {
      throw new OrderValidationError(
        `Produk ${product.name} sedang tidak tersedia.`,
        { productId },
      );
    }
    const unitPrice = Number(product.price);
    const subtotal = unitPrice * quantity;
    items.push({
      productId,
      name: product.name,
      unitPrice,
      quantity,
      subtotal,
    });
    totalQuantity += quantity;
    totalPrice += subtotal;
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(db, input.idempotencyKey);
    if (existing) {
      return {
        order: existing,
        duplicate: true,
        whatsapp: buildWhatsapp(
          env,
          existing.orderNumber,
          input,
          existing.items,
          existing.totalQuantity,
          existing.totalPrice,
        ),
      };
    }
  }

  const orderId = crypto.randomUUID();
  const now = nowIso();
  const notes = input.notes?.trim() ?? "";
  const idempotencyKey = input.idempotencyKey ?? null;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = generateOrderNumber(today);

    const statements = [
      db
        .prepare(
          `INSERT INTO orders (
             id, order_number, idempotency_key, customer_name, customer_phone,
             purpose, order_type, delivery_date, delivery_time, delivery_location,
             notes, total_quantity, total_price, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        )
        .bind(
          orderId,
          orderNumber,
          idempotencyKey,
          input.customerName,
          input.customerPhone,
          input.purpose,
          input.orderType,
          input.deliveryDate,
          input.deliveryTime,
          input.deliveryLocation,
          notes,
          totalQuantity,
          totalPrice,
          now,
          now,
        ),
      ...items.map((item) =>
        db
          .prepare(
            `INSERT INTO order_items (
               id, order_id, product_id, product_name_snapshot,
               unit_price_snapshot, quantity, subtotal
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            orderId,
            item.productId,
            item.name,
            item.unitPrice,
            item.quantity,
            item.subtotal,
          ),
      ),
      db
        .prepare(
          `INSERT INTO order_status_history (
             id, order_id, previous_status, new_status, changed_by, note, created_at
           ) VALUES (?, ?, NULL, 'PENDING', 'public', ?, ?)`,
        )
        .bind(crypto.randomUUID(), orderId, "Pesanan dibuat oleh pelanggan.", now),
    ];

    try {
      await db.batch(statements);
      const detail = await loadOrderDetail(db, orderId);
      if (!detail) throw new Error("Pesanan gagal dimuat setelah disimpan.");

      return {
        order: detail,
        duplicate: false,
        whatsapp: buildWhatsapp(
          env,
          orderNumber,
          input,
          items,
          totalQuantity,
          totalPrice,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error;

      if (message.includes("orders.idempotency_key") && idempotencyKey) {
        const existing = await findByIdempotencyKey(db, idempotencyKey);
        if (existing) {
          return {
            order: existing,
            duplicate: true,
            whatsapp: buildWhatsapp(
              env,
              existing.orderNumber,
              input,
              existing.items,
              existing.totalQuantity,
              existing.totalPrice,
            ),
          };
        }
      }

      if (message.includes("orders.order_number")) continue;
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gagal membuat nomor pesanan unik.");
}
