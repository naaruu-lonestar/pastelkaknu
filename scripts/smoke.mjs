#!/usr/bin/env node
/**
 * Smoke test sekali jalan untuk deployment Pastel Ibu.
 *
 * Memeriksa: health check, katalog produk, login admin, dan pembuatan pesanan
 * uji lewat API yang sama dengan yang dipakai browser.
 *
 * Pemakaian:
 *   node scripts/smoke.mjs --url https://pastel-ibu.vercel.app
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run smoke -- --url https://...
 *
 * Opsi: --keep  (biarkan pesanan uji berstatus PENDING; default dibatalkan
 *               supaya tidak memakan kapasitas produksi)
 *
 * Tanpa ADMIN_EMAIL/ADMIN_PASSWORD, pemeriksaan admin dilewati dan diberi tanda
 * peringatan. Keluar dengan kode 1 bila ada pemeriksaan yang gagal.
 */
const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value === undefined || value.startsWith("--") ? fallback : value;
}

const base = (readArg("url") || process.env.SMOKE_URL || "").replace(/\/+$/, "");
const email = (readArg("email") || process.env.ADMIN_EMAIL || "").trim();
const password = readArg("password") || process.env.ADMIN_PASSWORD || "";
const keepOrder = args.includes("--keep");

if (!/^https?:\/\/[^/]+/.test(base)) {
  console.error(
    "URL belum diisi. Contoh:\n  node scripts/smoke.mjs --url https://pastel-ibu.vercel.app",
  );
  process.exit(1);
}

const TIMEOUT_MS = 20_000;
const results = [];
let sessionCookie = null;
let orderNumber = null;
let orderCancelled = false;

function log(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "OK  " : "GAGAL"}  ${label.padEnd(24)} ${detail}`);
}

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload, headers: response.headers };
}

function errorText(payload) {
  const message = payload && payload.error && payload.error.message;
  return typeof message === "string" ? message : "";
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function main() {
  console.log(`Smoke test: ${base}\n`);

  /* ---------------------------------------------------------------- publik */
  let health;
  try {
    health = await call("/api/health");
  } catch (error) {
    log("health", false, `tidak bisa dihubungi (${error.message})`);
    return;
  }

  const healthy = health.status === 200 && health.payload?.status === "ok";
  log(
    "health",
    healthy,
    `${health.status} ${health.payload?.status ?? ""} ${
      health.payload?.database?.code ?? ""
    }`.trim(),
  );
  if (!healthy) {
    const hint =
      health.payload?.hint ||
      health.payload?.error?.message ||
      "URL tidak menjawab seperti aplikasi Pastel Ibu. Cek domain, atau pastikan preset Vercel = Other.";
    console.log(`\nBerhenti: ${hint}`);
    return;
  }

  const products = await call("/api/public/products");
  const list = Array.isArray(products.payload?.products) ? products.payload.products : [];
  log(
    "katalog produk",
    products.status === 200 && list.length > 0,
    `${products.status}, ${list.length} produk`,
  );

  const config = await call("/api/public/config");
  const today = config.payload?.today;
  const capacity = config.payload?.dailyCapacity;
  log(
    "konfigurasi publik",
    config.status === 200 && typeof today === "string" && Number(capacity) > 0,
    `today=${today ?? "-"}, kapasitas=${capacity ?? "-"}`,
  );

  if (list.length === 0 || typeof today !== "string") {
    console.log("\nBerhenti: katalog/kapasitas belum terisi. Jalankan `npm run db:push`.");
    return;
  }

  /* ----------------------------------------------------------------- admin */
  let orderId = null;

  if (!email || !password) {
    console.log(
      "\nLEWAT  pemeriksaan admin — set ADMIN_EMAIL dan ADMIN_PASSWORD untuk mengaktifkannya.",
    );
  } else {
    const login = await call("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const cookies =
      typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [];
    const rawCookie = cookies.find((value) => value.startsWith("pastel_admin_session="));
    if (rawCookie) sessionCookie = rawCookie.split(";")[0];

    log(
      "login admin",
      login.status === 200 && Boolean(sessionCookie),
      `${login.status}${errorText(login.payload) ? ` ${errorText(login.payload)}` : ""}`,
    );

    if (sessionCookie) {
      const me = await call("/api/admin/auth/me");
      log("sesi admin", me.status === 200, `${me.status} ${me.payload?.admin?.role ?? ""}`.trim());
    }
  }

  /* ---------------------------------------------------------------- pesanan */
  const product = list[0];
  const created = await call("/api/public/orders", {
    method: "POST",
    body: JSON.stringify({
      customerName: "Smoke Test",
      customerPhone: "081234567890",
      purpose: "Pribadi",
      orderType: "Reguler",
      deliveryDate: addDays(today, 2),
      deliveryTime: "10:00",
      deliveryLocation: "Pesanan uji otomatis dari scripts/smoke.mjs",
      notes: "Diabaikan bila sudah selesai diverifikasi.",
      items: [{ productId: product.id, quantity: 1 }],
      idempotencyKey: `smoke-${Date.now()}`,
    }),
  });

  orderId = created.payload?.order?.id ?? null;
  orderNumber = created.payload?.order?.orderNumber ?? null;
  log(
    "buat pesanan",
    (created.status === 201 || created.status === 200) && Boolean(orderNumber),
    `${created.status} ${orderNumber ?? errorText(created.payload)}`.trim(),
  );

  if (orderNumber && sessionCookie) {
    const found = await call(`/api/admin/orders?q=${encodeURIComponent(orderNumber)}`);
    const visible =
      found.status === 200 &&
      Array.isArray(found.payload?.orders) &&
      found.payload.orders.some((order) => order.orderNumber === orderNumber);
    log("pesanan terlihat di admin", visible, `${found.status}`);

    if (orderId && !keepOrder) {
      const cancelled = await call(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "CANCELLED",
          note: "Dibatalkan otomatis oleh smoke test.",
        }),
      });
      orderCancelled = cancelled.status === 200;
      log(
        "bersihkan pesanan uji",
        orderCancelled,
        "status CANCELLED, tidak dihitung ke kapasitas",
      );
    }
  }

  if (sessionCookie) {
    const logout = await call("/api/admin/auth/logout", { method: "POST" });
    log("logout admin", logout.status === 200, `${logout.status}`);
  }
}

main()
  .catch((error) => {
    log("smoke test", false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    const failed = results.filter((item) => !item.ok);
    console.log("");
    if (failed.length === 0) {
      console.log(`Semua ${results.length} pemeriksaan lulus.`);
      if (orderNumber) {
        console.log(
          orderCancelled
            ? `Pesanan uji ${orderNumber} tersimpan dengan status CANCELLED.`
            : `Pesanan uji ${orderNumber} masih PENDING — batalkan dari dashboard bila tidak diperlukan.`,
        );
      }
      return;
    }
    console.log(`${failed.length} dari ${results.length} pemeriksaan gagal:`);
    for (const item of failed) console.log(`- ${item.label}: ${item.detail}`);
    process.exitCode = 1;
  });
