"use strict";

const API = {
  config: "/api/public/config",
  products: "/api/public/products",
  orders: "/api/public/orders",
};

const PHONE_PATTERN = /^(?:\+62|62|0)8[1-9][0-9]{6,11}$/;
const MAX_DAYS_AHEAD = 180;
const MAX_QUANTITY = 10000;

const state = {
  config: null,
  products: [],
  quantities: new Map(),
  idempotencyKey: newIdempotencyKey(),
  submitting: false,
};

const el = {
  header: document.querySelector(".site-header"),
  navToggle: document.querySelector(".nav-toggle"),
  nav: document.querySelector("#nav"),
  productGrid: document.querySelector("#product-grid"),
  productsNote: document.querySelector("#products-note"),
  orderForm: document.querySelector("#order-form"),
  orderItems: document.querySelector("#order-items"),
  itemsError: document.querySelector("#items-error"),
  formAlert: document.querySelector("#form-alert"),
  submit: document.querySelector("#submit-button"),
  summaryItems: document.querySelector("#summary-items"),
  summaryQuantity: document.querySelector("#summary-quantity"),
  summaryTotal: document.querySelector("#summary-total"),
  summaryCapacity: document.querySelector("#summary-capacity"),
  heroCapacity: document.querySelector("#hero-capacity"),
  orderLayout: document.querySelector(".order-layout"),
  success: document.querySelector("#order-success"),
  successNumber: document.querySelector("#success-number"),
  successTotal: document.querySelector("#success-total"),
  successWarning: document.querySelector("#success-warning"),
  successWhatsapp: document.querySelector("#success-whatsapp"),
  orderAgain: document.querySelector("#order-again"),
  footerWhatsapp: document.querySelector("#footer-whatsapp"),
  footerYear: document.querySelector("#footer-year"),
  toast: document.querySelector("#toast"),
  fields: {
    customerName: document.querySelector("#customerName"),
    customerPhone: document.querySelector("#customerPhone"),
    purpose: document.querySelector("#purpose"),
    orderType: document.querySelector("#orderType"),
    deliveryDate: document.querySelector("#deliveryDate"),
    deliveryTime: document.querySelector("#deliveryTime"),
    deliveryLocation: document.querySelector("#deliveryLocation"),
    notes: document.querySelector("#notes"),
  },
};

/* ------------------------------------------------------------- utilities */

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatPhone(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.startsWith("62")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  return digits;
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.hidden = true;
  }, 4000);
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { response, payload };
}

function errorMessage(payload, fallback) {
  const message = payload && payload.error && payload.error.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Ambil JSON dengan satu percobaan ulang untuk gangguan sesaat (cold start,
 * jaringan). Error 4xx tidak diulang karena isinya tidak akan berubah.
 */
async function fetchJson(url) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let retryable = true;

    try {
      const { response, payload } = await getJson(url);
      if (response.ok && payload) return payload;

      lastError = new Error(
        errorMessage(payload, `Server menolak permintaan (${response.status}).`),
      );
      // 4xx (validasi, 404) tidak akan berubah bila diulang.
      retryable = response.status >= 500;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (!retryable) break;
    if (attempt === 0) await delay(700);
  }

  throw lastError || new Error("Server tidak merespons.");
}

/* ---------------------------------------------------------------- render */

function pastelArtSvg() {
  return `
    <svg viewBox="0 0 120 100" aria-hidden="true" focusable="false">
      <path d="M18 78c0-21 18-38 42-38s42 17 42 38c0 4-3 6-7 6H25c-4 0-7-2-7-6Z" fill="currentColor" opacity=".16"/>
      <path d="M60 30c7-9 19-12 25-8 6 4 5 15-2 22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".55"/>
      <path d="M24 74c0-16 16-29 36-29s36 13 36 29" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <path d="M32 74h56" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <path d="M38 60c6 4 14 6 22 6s16-2 22-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".45"/>
    </svg>`;
}

function makeProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const art = document.createElement("div");
  art.className = "product-art";
  if (product.imageUrl) {
    const img = document.createElement("img");
    img.src = product.imageUrl;
    img.alt = product.name;
    img.loading = "lazy";
    img.width = 640;
    img.height = 400;
    art.append(img);
  } else {
    art.innerHTML = pastelArtSvg();
  }

  const body = document.createElement("div");
  body.className = "product-body";

  const title = document.createElement("h3");
  title.textContent = product.name;

  const price = document.createElement("p");
  price.className = "product-price";
  price.append(document.createTextNode(formatRupiah(product.price)));
  const unit = document.createElement("span");
  unit.textContent = " /pcs";
  price.append(unit);

  const desc = document.createElement("p");
  desc.className = "product-desc";
  desc.textContent = product.description || "Pastel rumahan yang dibuat segar setiap hari.";

  body.append(title, price, desc);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-ghost";
  button.textContent = "Tambah ke pesanan";
  button.addEventListener("click", () => {
    const current = state.quantities.get(product.id) || 0;
    setQuantity(product.id, Math.min(MAX_QUANTITY, current + 1), { focusForm: true });
    showToast(`${product.name} ditambahkan ke pesanan.`);
  });

  card.append(art, body, button);
  return card;
}

function makeOrderItemRow(product) {
  const row = document.createElement("div");
  row.className = "order-item";
  row.dataset.productId = product.id;

  const info = document.createElement("div");
  info.className = "order-item-info";
  const name = document.createElement("strong");
  name.textContent = product.name;
  const price = document.createElement("span");
  price.textContent = `${formatRupiah(product.price)} /pcs`;
  info.append(name, price);

  const qty = document.createElement("div");
  qty.className = "qty";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.dataset.action = "decrease";
  minus.setAttribute("aria-label", `Kurangi jumlah ${product.name}`);
  minus.textContent = "−";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.pattern = "[0-9]*";
  input.value = "0";
  input.maxLength = 5;
  input.dataset.action = "input";
  input.setAttribute("aria-label", `Jumlah ${product.name}`);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.dataset.action = "increase";
  plus.setAttribute("aria-label", `Tambah jumlah ${product.name}`);
  plus.textContent = "+";

  qty.append(minus, input, plus);
  row.append(info, qty);
  return row;
}

function renderCatalog() {
  el.productGrid.replaceChildren();
  el.orderItems.replaceChildren();

  if (state.products.length === 0) {
    const empty = document.createElement("article");
    empty.className = "product-card";
    const text = document.createElement("p");
    text.className = "product-desc";
    text.textContent = "Belum ada produk yang tersedia saat ini.";
    empty.append(text);
    el.productGrid.append(empty);
    el.orderItems.setAttribute("aria-busy", "false");
    return;
  }

  for (const product of state.products) {
    el.productGrid.append(makeProductCard(product));
    el.orderItems.append(makeOrderItemRow(product));
  }

  el.productGrid.setAttribute("aria-busy", "false");
  el.orderItems.setAttribute("aria-busy", "false");
  syncInputs();
  renderSummary();
}

function syncInputs() {
  for (const row of el.orderItems.querySelectorAll(".order-item")) {
    const productId = row.dataset.productId;
    const quantity = state.quantities.get(productId) || 0;
    const input = row.querySelector('input[data-action="input"]');
    const minus = row.querySelector('button[data-action="decrease"]');
    const plus = row.querySelector('button[data-action="increase"]');
    if (input && document.activeElement !== input) input.value = String(quantity);
    if (minus) minus.disabled = quantity <= 0;
    if (plus) plus.disabled = quantity >= MAX_QUANTITY;
  }
}

function renderSummary() {
  el.summaryItems.replaceChildren();

  let totalQuantity = 0;
  let totalPrice = 0;
  let hasItems = false;

  for (const product of state.products) {
    const quantity = state.quantities.get(product.id) || 0;
    if (quantity <= 0) continue;
    hasItems = true;
    const subtotal = quantity * product.price;
    totalQuantity += quantity;
    totalPrice += subtotal;

    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${product.name} `;
    const qtyLabel = document.createElement("span");
    qtyLabel.className = "summary-qty";
    qtyLabel.textContent = `${quantity} × ${formatRupiah(product.price)}`;
    label.append(qtyLabel);

    const value = document.createElement("strong");
    value.textContent = formatRupiah(subtotal);
    item.append(label, value);
    el.summaryItems.append(item);
  }

  if (!hasItems) {
    const empty = document.createElement("li");
    empty.className = "summary-empty";
    empty.textContent = "Belum ada pastel dipilih.";
    el.summaryItems.append(empty);
  }

  el.summaryQuantity.textContent = `${totalQuantity} pcs`;
  el.summaryTotal.textContent = formatRupiah(totalPrice);
}

/* ---------------------------------------------------------------- inputs */

function setQuantity(productId, quantity, options = {}) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const safe = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number(quantity) || 0)));
  if (safe === 0) state.quantities.delete(productId);
  else state.quantities.set(productId, safe);

  el.itemsError.textContent = "";
  syncInputs();
  renderSummary();

  if (options.focusForm) {
    el.itemsError.textContent = "";
  }
}

el.orderItems.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".order-item");
  if (!row) return;

  const productId = row.dataset.productId;
  const current = state.quantities.get(productId) || 0;
  const action = button.dataset.action;

  if (action === "increase") setQuantity(productId, current + 1);
  if (action === "decrease") setQuantity(productId, current - 1);
});

el.orderItems.addEventListener("input", (event) => {
  const input = event.target.closest('input[data-action="input"]');
  if (!input) return;
  const row = input.closest(".order-item");
  const productId = row.dataset.productId;
  const digits = input.value.replace(/\D/g, "").slice(0, 5);
  input.value = digits;
  setQuantity(productId, digits === "" ? 0 : Number(digits));
  input.value = String(state.quantities.get(productId) || 0);
});

el.orderItems.addEventListener("blur", (event) => {
  const input = event.target.closest('input[data-action="input"]');
  if (!input) return;
  if (input.value === "") {
    const row = input.closest(".order-item");
    setQuantity(row.dataset.productId, 0);
  }
}, true);

/* ------------------------------------------------------------- validation */

function setFieldError(name, message) {
  const field = el.fields[name];
  const target = el.orderForm.querySelector(`[data-error-for="${name}"]`);
  if (target) target.textContent = message;
  if (field) {
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }
}

function clearErrors() {
  el.formAlert.hidden = true;
  el.formAlert.textContent = "";
  el.itemsError.textContent = "";
  for (const name of Object.keys(el.fields)) setFieldError(name, "");
}

function collectForm() {
  const values = {};
  for (const [name, field] of Object.entries(el.fields)) {
    values[name] = field.value.trim();
  }
  return values;
}

function validate(values) {
  const errors = {};
  const items = [...state.quantities.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  if (values.customerName.length < 2) {
    errors.customerName = "Nama minimal 2 karakter.";
  }
  if (!PHONE_PATTERN.test(values.customerPhone)) {
    errors.customerPhone = "Gunakan nomor WhatsApp format 08xx atau 628xx.";
  }
  if (!values.purpose) errors.purpose = "Pilih keperluan pesanan.";
  if (!values.orderType) errors.orderType = "Pilih jenis pesanan.";

  if (!values.deliveryDate) {
    errors.deliveryDate = "Pilih tanggal pengiriman.";
  } else if (state.config) {
    const today = state.config.today;
    if (values.deliveryDate < today) {
      errors.deliveryDate = "Tanggal tidak boleh sebelum hari ini.";
    } else if (values.deliveryDate > addDays(today, MAX_DAYS_AHEAD)) {
      errors.deliveryDate = `Tanggal maksimal ${MAX_DAYS_AHEAD} hari ke depan.`;
    }
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.deliveryTime)) {
    errors.deliveryTime = "Pilih jam pengiriman.";
  }
  if (values.deliveryLocation.length < 5) {
    errors.deliveryLocation = "Alamat minimal 5 karakter.";
  }
  if (values.notes.length > 500) {
    errors.notes = "Catatan maksimal 500 karakter.";
  }

  return { errors, items };
}

function applyServerErrors(details) {
  if (!Array.isArray(details)) return;
  for (const detail of details) {
    if (!detail || typeof detail.field !== "string") continue;
    const field = detail.field.split(".")[0];
    if (field === "items") {
      el.itemsError.textContent = detail.message;
    } else if (Object.prototype.hasOwnProperty.call(el.fields, field)) {
      setFieldError(field, detail.message);
    }
  }
}

/* ---------------------------------------------------------------- submit */

async function submitOrder(event) {
  event.preventDefault();
  if (state.submitting || !state.config) return;

  clearErrors();
  const values = collectForm();
  const { errors, items } = validate(values);

  if (Object.keys(errors).length > 0) {
    for (const [name, message] of Object.entries(errors)) setFieldError(name, message);
    const firstInvalid = el.orderForm.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus({ preventScroll: false });
    return;
  }

  if (items.length === 0) {
    el.itemsError.textContent = "Pilih minimal satu pastel.";
    el.orderItems.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
    return;
  }

  state.submitting = true;
  el.submit.setAttribute("aria-busy", "true");
  el.submit.disabled = true;
  const originalLabel = el.submit.textContent;
  el.submit.textContent = "Mengirim pesanan…";

  try {
    const { response, payload } = await getJson(API.orders, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        purpose: values.purpose,
        orderType: values.orderType,
        deliveryDate: values.deliveryDate,
        deliveryTime: values.deliveryTime,
        deliveryLocation: values.deliveryLocation,
        notes: values.notes,
        items,
        idempotencyKey: state.idempotencyKey,
      }),
    });

    if (response.ok && payload && payload.order) {
      showSuccess(payload);
      return;
    }

    if (response.status === 429) {
      const retryAfter = Number(payload && payload.error && payload.error.details
        ? payload.error.details.retryAfter
        : NaN);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? ` Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`
        : "";
      el.formAlert.textContent = `${errorMessage(payload, "Terlalu banyak pesanan dari perangkat ini.")}${wait}`;
      el.formAlert.hidden = false;
      return;
    }

    if (response.status === 400 && payload && payload.error) {
      applyServerErrors(payload.error.details);
      const hasFieldError = el.orderForm.querySelector('[aria-invalid="true"]');
      el.formAlert.textContent = errorMessage(payload, "Periksa kembali data pesanan.");
      el.formAlert.hidden = false;
      if (hasFieldError) hasFieldError.focus();
      return;
    }

    el.formAlert.textContent = errorMessage(
      payload,
      "Pesanan belum terkirim. Periksa koneksi lalu coba lagi.",
    );
    el.formAlert.hidden = false;
  } catch (error) {
    el.formAlert.textContent =
      "Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.";
    el.formAlert.hidden = false;
  } finally {
    state.submitting = false;
    el.submit.removeAttribute("aria-busy");
    el.submit.disabled = false;
    el.submit.textContent = originalLabel;
  }
}

function showSuccess(payload) {
  const order = payload.order;
  const whatsapp = payload.whatsapp || {};

  el.successNumber.textContent = order.orderNumber;
  el.successTotal.textContent = formatRupiah(order.totalPrice);
  el.successWhatsapp.href = whatsapp.url || state.config.business.whatsappUrl;

  el.successWarning.hidden = !payload.capacityWarning;

  el.orderLayout.hidden = true;
  el.success.hidden = false;
  el.success.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });

  if (payload.duplicate) {
    showToast("Pesanan ini sudah tercatat sebelumnya.");
  }
}

function resetForNewOrder() {
  state.quantities.clear();
  state.idempotencyKey = newIdempotencyKey();

  el.orderForm.reset();
  clearErrors();

  if (state.config) {
    el.fields.deliveryDate.value = state.config.today;
    el.fields.deliveryDate.min = state.config.today;
    el.fields.deliveryDate.max = addDays(state.config.today, MAX_DAYS_AHEAD);
  }

  syncInputs();
  renderSummary();

  el.success.hidden = true;
  el.orderLayout.hidden = false;
  el.orderForm.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
  el.fields.customerName.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ init */

function populateSelect(select, options, placeholder) {
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.append(empty);

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    select.append(node);
  }
}

async function loadConfigAndProducts() {
  const [config, products] = await Promise.all([
    fetchJson(API.config),
    fetchJson(API.products),
  ]);

  state.config = config;
  state.products = Array.isArray(products.products) ? products.products : [];

  const { business, options, today, dailyCapacity } = state.config;

  populateSelect(el.fields.purpose, options.purposes || [], "Pilih keperluan");
  populateSelect(el.fields.orderType, options.orderTypes || [], "Pilih jenis pesanan");

  el.fields.deliveryDate.min = today;
  el.fields.deliveryDate.max = addDays(today, MAX_DAYS_AHEAD);
  el.fields.deliveryDate.value = today;

  const capacity = Number(dailyCapacity);
  if (Number.isFinite(capacity) && capacity > 0) {
    const formatted = capacity.toLocaleString("id-ID");
    el.summaryCapacity.textContent = `Kapasitas produksi harian: ${formatted} pcs.`;
    if (el.heroCapacity) el.heroCapacity.textContent = formatted;
  } else {
    el.summaryCapacity.textContent = "Kapasitas produksi harian belum diatur admin.";
    if (el.heroCapacity) el.heroCapacity.textContent = "—";
  }

  if (business && business.whatsappUrl) {
    el.footerWhatsapp.href = business.whatsappUrl;
    el.footerWhatsapp.textContent = formatPhone(business.whatsappNumber);
  }

  renderCatalog();
}

function setupNav() {
  if (!el.navToggle || !el.header) return;

  el.navToggle.addEventListener("click", () => {
    const open = el.navToggle.getAttribute("aria-expanded") === "true";
    el.navToggle.setAttribute("aria-expanded", String(!open));
    el.header.classList.toggle("nav-open", !open);
  });

  el.nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      el.navToggle.setAttribute("aria-expanded", "false");
      el.header.classList.remove("nav-open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.header.classList.contains("nav-open")) {
      el.navToggle.setAttribute("aria-expanded", "false");
      el.header.classList.remove("nav-open");
      el.navToggle.focus();
    }
  });
}

function init() {
  el.footerYear.textContent = String(new Date().getFullYear());
  setupNav();

  el.orderForm.addEventListener("submit", submitOrder);
  el.orderAgain.addEventListener("click", resetForNewOrder);

  startCatalog();
}

function startCatalog() {
  el.productGrid.setAttribute("aria-busy", "true");

  loadConfigAndProducts()
    .then(() => {
      el.productsNote.hidden = true;
      el.productsNote.textContent = "";
      el.formAlert.hidden = true;
      el.formAlert.textContent = "";
      el.submit.disabled = false;
    })
    .catch(showCatalogError);
}

/** Tampilkan penyebab kegagalan asli dari server + tombol coba lagi. */
function showCatalogError(error) {
  console.error(error);

  const detail = error && error.message ? error.message : "Katalog produk tidak tersedia.";

  const card = document.createElement("article");
  card.className = "product-card";

  const note = document.createElement("p");
  note.className = "product-desc";
  note.textContent = `Katalog belum bisa dimuat. ${detail}`;

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "btn btn-ghost";
  retry.textContent = "Coba lagi";
  retry.addEventListener("click", () => {
    retry.disabled = true;
    retry.textContent = "Memuat…";
    startCatalog();
  });

  card.append(note, retry);
  el.productGrid.replaceChildren(card);
  el.productGrid.setAttribute("aria-busy", "false");
  el.orderItems.setAttribute("aria-busy", "false");

  el.productsNote.hidden = false;
  el.productsNote.textContent =
    "Katalog produk sedang tidak bisa dimuat. Coba lagi, atau hubungi admin lewat WhatsApp.";

  el.formAlert.textContent =
    "Form pesanan belum siap karena data katalog belum termuat. Tekan “Coba lagi” pada bagian menu pastel.";
  el.formAlert.hidden = false;
  el.submit.disabled = true;
}

init();
