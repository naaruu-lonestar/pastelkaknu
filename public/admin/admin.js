"use strict";

const API_BASE = "/api/admin";
const JAKARTA_TZ = "Asia/Jakarta";

const STATUSES = [
  { value: "PENDING", label: "Baru" },
  { value: "CONFIRMED", label: "Dikonfirmasi" },
  { value: "PROCESSING", label: "Diproses" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((item) => [item.value, item.label]));
const STATUS_CLASS = {
  PENDING: "badge--pending",
  CONFIRMED: "badge--confirmed",
  PROCESSING: "badge--processing",
  COMPLETED: "badge--completed",
  CANCELLED: "badge--cancelled",
};
const CONDITION_CLASS = {
  AMAN: "badge--aman",
  HAMPIR_PENUH: "badge--hampir",
  MELEBIHI: "badge--lebih",
};
const CONDITION_BAR_CLASS = {
  AMAN: "",
  HAMPIR_PENUH: "is-hampir",
  MELEBIHI: "is-lebih",
};

const state = {
  admin: null,
  view: "dashboard",
  dashboardDate: todayJakarta(),
  orders: {
    page: 1,
    perPage: 20,
    q: "",
    status: "",
    date: "",
    totalPages: 1,
    total: 0,
  },
  products: [],
  production: null,
};

const el = {
  loginView: document.querySelector("#login-view"),
  appView: document.querySelector("#app-view"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  loginSubmit: document.querySelector("#login-submit"),
  adminName: document.querySelector("#admin-name"),
  adminRole: document.querySelector("#admin-role"),
  logout: document.querySelector("#logout-button"),

  dashboardDate: document.querySelector("#dashboard-date"),
  dashboardRefresh: document.querySelector("#dashboard-refresh"),
  statGrid: document.querySelector("#stat-grid"),
  capacityDate: document.querySelector("#capacity-date"),
  capacityBadge: document.querySelector("#capacity-badge"),
  capacityView: document.querySelector("#capacity-view"),
  recentOrders: document.querySelector("#recent-orders"),
  upcomingDays: document.querySelector("#upcoming-days"),

  ordersForm: document.querySelector("#orders-filter"),
  ordersSearch: document.querySelector("#orders-search"),
  ordersStatus: document.querySelector("#orders-status"),
  ordersDate: document.querySelector("#orders-date"),
  ordersReset: document.querySelector("#orders-reset"),
  ordersBody: document.querySelector("#orders-body"),
  ordersEmpty: document.querySelector("#orders-empty"),
  ordersTable: document.querySelector("#orders-table"),
  ordersPrev: document.querySelector("#orders-prev"),
  ordersNext: document.querySelector("#orders-next"),
  ordersInfo: document.querySelector("#orders-info"),

  productAdd: document.querySelector("#product-add"),
  productLocked: document.querySelector("#product-locked"),
  productsBody: document.querySelector("#products-body"),
  productsEmpty: document.querySelector("#products-empty"),
  productsTable: document.querySelector("#products-table"),
  productDialog: document.querySelector("#product-dialog"),
  productTitle: document.querySelector("#product-title"),
  productForm: document.querySelector("#product-form"),
  productClose: document.querySelector("#product-close"),
  productCancel: document.querySelector("#product-cancel"),
  productId: document.querySelector("#product-id"),
  productName: document.querySelector("#product-name"),
  productPrice: document.querySelector("#product-price"),
  productDescription: document.querySelector("#product-description"),
  productImage: document.querySelector("#product-image"),
  productSort: document.querySelector("#product-sort"),
  productActive: document.querySelector("#product-active"),
  productError: document.querySelector("#product-error"),
  productSubmit: document.querySelector("#product-submit"),

  capacityForm: document.querySelector("#capacity-form"),
  capacityInput: document.querySelector("#capacity-input"),
  capacitySubmit: document.querySelector("#capacity-submit"),
  capacityLocked: document.querySelector("#capacity-locked"),
  capacityUpdated: document.querySelector("#capacity-updated"),
  productionFilter: document.querySelector("#production-filter"),
  productionFrom: document.querySelector("#production-from"),
  productionTo: document.querySelector("#production-to"),
  productionBody: document.querySelector("#production-body"),
  productionEmpty: document.querySelector("#production-empty"),
  productionTable: document.querySelector("#production-table"),

  orderDialog: document.querySelector("#order-dialog"),
  orderTitle: document.querySelector("#order-title"),
  orderDetail: document.querySelector("#order-detail"),
  orderClose: document.querySelector("#order-close"),

  toast: document.querySelector("#toast"),
};

/* ------------------------------------------------------------- utilities */

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function formatDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDayName(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long" }).format(date);
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function badge(text, className) {
  return node("span", `badge ${className || ""}`.trim(), text);
}

function statusBadge(status) {
  return badge(STATUS_LABEL[status] || status, STATUS_CLASS[status] || "");
}

function conditionBadge(item) {
  return badge(item.label || item.condition, CONDITION_CLASS[item.condition] || "");
}

function progressBar(percent, condition) {
  const track = node("div", "progress");
  const bar = node("div", `progress-bar ${CONDITION_BAR_CLASS[condition] || ""}`.trim());
  bar.style.width = `${Math.min(100, Math.max(0, Number(percent) || 0))}%`;
  track.append(bar);
  return track;
}

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

let toastTimer = null;
function toast(message, kind) {
  el.toast.textContent = message;
  el.toast.className = `toast${kind ? ` is-${kind}` : ""}`;
  el.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.hidden = true;
  }, 4200);
}

async function api(path, options = {}) {
  const init = { ...options, headers: { ...(options.headers || {}) } };
  if (init.body && typeof init.body !== "string") {
    init.body = JSON.stringify(init.body);
    init.headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(API_BASE + path, init);
  } catch {
    throw new ApiError("Tidak dapat menghubungi server. Periksa koneksi.", 0, null);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 && path !== "/auth/login") {
    showLogin(path === "/auth/me" ? undefined : "Sesi berakhir. Silakan login kembali.");
    throw new ApiError("Sesi berakhir.", 401, null);
  }

  if (!response.ok) {
    throw new ApiError(
      (payload && payload.error && payload.error.message) || `Permintaan gagal (${response.status}).`,
      response.status,
      payload && payload.error ? payload.error.details : null,
    );
  }

  return payload || {};
}

/* ------------------------------------------------------------------ auth */

function showLogin(message) {
  state.admin = null;
  el.appView.hidden = true;
  el.loginView.hidden = false;
  el.loginPassword.value = "";
  if (message) {
    el.loginError.textContent = message;
    el.loginError.hidden = false;
  } else {
    el.loginError.hidden = true;
  }
  window.setTimeout(() => el.loginEmail.focus(), 40);
}

function isOwner() {
  return Boolean(state.admin && state.admin.role === "OWNER");
}

function startApp(admin) {
  state.admin = admin;
  el.adminName.textContent = admin.name;
  el.adminRole.textContent = admin.role;
  el.loginError.hidden = true;
  el.loginView.hidden = true;
  el.appView.hidden = false;

  const owner = admin.role === "OWNER";
  el.productAdd.hidden = !owner;
  el.productLocked.hidden = owner;
  el.capacityLocked.hidden = owner;
  el.capacityForm.querySelectorAll("input, button").forEach((input) => {
    input.disabled = !owner;
  });

  el.dashboardDate.value = state.dashboardDate;
  el.productionFrom.value = todayJakarta();
  el.productionTo.value = addDays(todayJakarta(), 13);

  setView("dashboard");
}

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = el.loginEmail.value.trim();
  const password = el.loginPassword.value;
  el.loginError.hidden = true;

  if (!email || !password) {
    el.loginError.textContent = "Email dan password wajib diisi.";
    el.loginError.hidden = false;
    return;
  }

  el.loginSubmit.disabled = true;
  el.loginSubmit.setAttribute("aria-busy", "true");
  const label = el.loginSubmit.textContent;
  el.loginSubmit.textContent = "Memeriksa…";

  try {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    startApp(data.admin);
  } catch (error) {
    el.loginError.textContent = error.message;
    el.loginError.hidden = false;
  } finally {
    el.loginSubmit.disabled = false;
    el.loginSubmit.removeAttribute("aria-busy");
    el.loginSubmit.textContent = label;
  }
});

el.logout.addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* sesi mungkin sudah berakhir */
  }
  showLogin("Kamu sudah keluar.");
});

/* ----------------------------------------------------------------- views */

const loaders = {
  dashboard: loadDashboard,
  orders: loadOrders,
  products: loadProducts,
  production: loadProduction,
};

function setView(view) {
  state.view = view;
  for (const button of document.querySelectorAll(".nav-item[data-view]")) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== view;
  }
  if (loaders[view]) loaders[view]();
}

for (const button of document.querySelectorAll(".nav-item[data-view]")) {
  button.addEventListener("click", () => setView(button.dataset.view));
}

/* ------------------------------------------------------------- dashboard */

async function loadDashboard() {
  const date = el.dashboardDate.value || todayJakarta();
  state.dashboardDate = date;
  el.statGrid.setAttribute("aria-busy", "true");

  try {
    const data = await api(`/dashboard?date=${encodeURIComponent(date)}`);
    renderStats(data.stats);
    renderCapacity(data.capacity);
    renderRecentOrders(data.recentOrders || []);
    renderUpcoming(data.upcoming || []);
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  } finally {
    el.statGrid.setAttribute("aria-busy", "false");
  }
}

function renderStats(stats) {
  const cards = [
    ["Total pesanan", stats.totalOrders, ""],
    ["Perlu konfirmasi", stats.pendingOrders, "stat-card--attention"],
    ["Dikonfirmasi", stats.confirmedOrders, ""],
    ["Diproses", stats.processingOrders, ""],
    ["Selesai", stats.completedOrders, ""],
    ["Produk terjual", formatNumber(stats.totalProducts), ""],
  ];

  el.statGrid.replaceChildren();
  for (const [label, value, modifier] of cards) {
    const card = node("dl", `stat-card ${modifier}`.trim());
    card.append(node("dt", null, label));
    const dd = node("dd", null, typeof value === "number" ? formatNumber(value) : value);
    card.append(dd);
    el.statGrid.append(card);
  }
}

function renderCapacity(capacity) {
  el.capacityDate.textContent = `· ${formatDate(capacity.date)}`;
  el.capacityBadge.textContent = capacity.label || capacity.condition;
  el.capacityBadge.className = `badge ${CONDITION_CLASS[capacity.condition] || ""}`.trim();

  const view = document.createDocumentFragment();
  const line = node("p", "capacity-line");
  line.append(node("strong", null, formatNumber(capacity.totalQuantity)));
  line.append(node("span", null, ` pcs terpesan dari ${formatNumber(capacity.dailyCapacity)} pcs`));
  view.append(line, progressBar(capacity.usagePercent, capacity.condition));

  const meta = node("div", "capacity-meta");
  const remaining = node("span");
  remaining.append(document.createTextNode("Sisa "));
  remaining.append(node("strong", null, `${formatNumber(capacity.remaining)} pcs`));
  const orderCount = node("span");
  orderCount.append(document.createTextNode("Pesanan "));
  orderCount.append(node("strong", null, formatNumber(capacity.orderCount)));
  const usage = node("span");
  usage.append(document.createTextNode("Pemakaian "));
  usage.append(node("strong", null, `${formatNumber(capacity.usagePercent)}%`));
  meta.append(remaining, orderCount, usage);
  view.append(meta);

  el.capacityView.replaceChildren(view);
}

function renderRecentOrders(orders) {
  el.recentOrders.replaceChildren();

  if (orders.length === 0) {
    el.recentOrders.append(node("p", "empty-state", "Belum ada pesanan masuk."));
    return;
  }

  const list = node("ul", "recent-list");
  for (const order of orders) {
    const item = node("li");
    const button = node("button", "recent-item");
    button.type = "button";
    button.dataset.id = order.id;

    const main = node("span", "recent-main");
    main.append(node("strong", null, order.orderNumber));
    main.append(
      node("small", null, `${order.customerName} · ${formatNumber(order.totalQuantity)} pcs`),
    );

    const side = node("span", "recent-side");
    side.append(statusBadge(order.status));
    side.append(node("small", null, formatRupiah(order.totalPrice)));

    button.append(main, side);
    button.addEventListener("click", () => openOrder(order.id));
    item.append(button);
    list.append(item);
  }

  el.recentOrders.append(list);
}

function renderUpcoming(days) {
  el.upcomingDays.replaceChildren();

  if (days.length === 0) {
    el.upcomingDays.append(node("p", "empty-state", "Belum ada jadwal produksi."));
    return;
  }

  const wrap = node("div", "table-wrap");
  const table = node("table", "data-table data-table--compact");
  const thead = node("thead");
  const headRow = node("tr");
  for (const label of ["Tanggal", "Pesanan", "Jumlah", "Kondisi", "Pemakaian"]) {
    headRow.append(node("th", label === "Pesanan" || label === "Jumlah" ? "num" : null, label));
  }
  thead.append(headRow);

  const tbody = node("tbody");
  for (const day of days) {
    const row = node("tr");
    const dateCell = node("td");
    dateCell.append(node("span", "cell-strong", formatDate(day.date)));
    dateCell.append(node("span", "cell-sub", formatDayName(day.date)));
    row.append(dateCell);
    row.append(node("td", "num", formatNumber(day.orderCount)));
    row.append(node("td", "num", `${formatNumber(day.totalQuantity)} pcs`));
    const conditionCell = node("td");
    conditionCell.append(conditionBadge(day));
    row.append(conditionCell);
    const progressCell = node("td");
    progressCell.append(progressBar(day.usagePercent, day.condition));
    row.append(progressCell);
    tbody.append(row);
  }

  table.append(thead, tbody);
  wrap.append(table);
  el.upcomingDays.append(wrap);
}

el.dashboardRefresh.addEventListener("click", loadDashboard);
el.dashboardDate.addEventListener("change", loadDashboard);

/* ---------------------------------------------------------------- orders */

async function loadOrders() {
  const { page, perPage, q, status, date } = state.orders;
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (date) params.set("date", date);

  try {
    const data = await api(`/orders?${params.toString()}`);
    state.orders.total = data.pagination.total;
    state.orders.totalPages = data.pagination.totalPages;
    renderOrders(data.orders || []);
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  }
}

function renderOrders(orders) {
  el.ordersBody.replaceChildren();
  el.ordersEmpty.hidden = orders.length > 0;
  el.ordersTable.closest(".table-wrap").hidden = orders.length === 0;

  for (const order of orders) {
    const row = node("tr");

    const numberCell = node("td");
    numberCell.append(node("span", "cell-strong", order.orderNumber));
    numberCell.append(node("span", "cell-sub", `Dibuat ${formatDateTime(order.createdAt)}`));
    row.append(numberCell);

    const customerCell = node("td");
    customerCell.append(node("span", null, order.customerName));
    customerCell.append(node("span", "cell-sub", order.customerPhone));
    row.append(customerCell);

    const deliveryCell = node("td", "nowrap");
    deliveryCell.append(node("span", null, formatDate(order.deliveryDate)));
    deliveryCell.append(node("span", "cell-sub", `Pukul ${order.deliveryTime}`));
    row.append(deliveryCell);

    row.append(node("td", "num", `${formatNumber(order.totalQuantity)} pcs`));
    row.append(node("td", "num", formatRupiah(order.totalPrice)));

    const statusCell = node("td");
    statusCell.append(statusBadge(order.status));
    row.append(statusCell);

    const actionCell = node("td");
    const actions = node("div", "row-actions");
    const detailButton = node("button", "btn btn-quiet btn-sm", "Detail");
    detailButton.type = "button";
    detailButton.addEventListener("click", () => openOrder(order.id));
    actions.append(detailButton);
    actionCell.append(actions);
    row.append(actionCell);

    el.ordersBody.append(row);
  }

  const { page, totalPages, total } = state.orders;
  el.ordersInfo.textContent = `Halaman ${page} dari ${Math.max(1, totalPages)} · ${formatNumber(total)} pesanan`;
  el.ordersPrev.disabled = page <= 1;
  el.ordersNext.disabled = page >= totalPages;
}

el.ordersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.orders.q = el.ordersSearch.value.trim();
  state.orders.status = el.ordersStatus.value;
  state.orders.date = el.ordersDate.value;
  state.orders.page = 1;
  loadOrders();
});

el.ordersReset.addEventListener("click", () => {
  el.ordersSearch.value = "";
  el.ordersStatus.value = "";
  el.ordersDate.value = "";
  state.orders = { ...state.orders, q: "", status: "", date: "", page: 1 };
  loadOrders();
});

let searchTimer = null;
el.ordersSearch.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.orders.q = el.ordersSearch.value.trim();
    state.orders.page = 1;
    loadOrders();
  }, 380);
});

el.ordersPrev.addEventListener("click", () => {
  if (state.orders.page > 1) {
    state.orders.page -= 1;
    loadOrders();
  }
});

el.ordersNext.addEventListener("click", () => {
  if (state.orders.page < state.orders.totalPages) {
    state.orders.page += 1;
    loadOrders();
  }
});

/* ---------------------------------------------------------- order detail */

async function openOrder(id) {
  try {
    const { order } = await api(`/orders/${encodeURIComponent(id)}`);
    renderOrderDetail(order);
    if (!el.orderDialog.open) el.orderDialog.showModal();
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  }
}

function detailRow(label, value) {
  const wrapper = node("div");
  wrapper.append(node("dt", null, label));
  wrapper.append(node("dd", null, value));
  return wrapper;
}

function renderOrderDetail(order) {
  el.orderTitle.textContent = order.orderNumber;
  el.orderDetail.replaceChildren();

  const summary = node("section", "detail-section");
  const summaryHead = node("div", "card-head");
  summaryHead.append(node("h3", null, "Ringkasan"));
  summaryHead.append(statusBadge(order.status));
  summary.append(summaryHead);

  const summaryGrid = node("dl", "detail-grid");
  summaryGrid.append(detailRow("Nama", order.customerName));
  summaryGrid.append(detailRow("WhatsApp", order.customerPhone));
  summaryGrid.append(detailRow("Keperluan", order.purpose));
  summaryGrid.append(detailRow("Jenis pesanan", order.orderType));
  summaryGrid.append(detailRow("Tanggal kirim", formatDate(order.deliveryDate)));
  summaryGrid.append(detailRow("Jam kirim", order.deliveryTime));
  summaryGrid.append(detailRow("Lokasi", order.deliveryLocation));
  summaryGrid.append(detailRow("Catatan", order.notes || "—"));
  summary.append(summaryGrid);

  const total = node("p", "detail-total");
  total.append(node("span", null, `${formatNumber(order.totalQuantity)} pcs`));
  total.append(node("span", null, formatRupiah(order.totalPrice)));
  summary.append(total);
  el.orderDetail.append(summary);

  const items = node("section", "detail-section");
  items.append(node("h3", null, "Rincian produk"));
  const itemsTableWrap = node("div", "table-wrap");
  const itemsTable = node("table", "data-table data-table--compact");
  const itemsHead = node("thead");
  const itemsHeadRow = node("tr");
  for (const label of ["Produk", "Harga", "Jumlah", "Subtotal"]) {
    itemsHeadRow.append(node("th", label === "Produk" ? null : "num", label));
  }
  itemsHead.append(itemsHeadRow);
  const itemsBody = node("tbody");
  for (const item of order.items) {
    const row = node("tr");
    row.append(node("td", null, item.name));
    row.append(node("td", "num", formatRupiah(item.unitPrice)));
    row.append(node("td", "num", `${formatNumber(item.quantity)} pcs`));
    row.append(node("td", "num", formatRupiah(item.subtotal)));
    itemsBody.append(row);
  }
  itemsTable.append(itemsHead, itemsBody);
  itemsTableWrap.append(itemsTable);
  items.append(itemsTableWrap);
  el.orderDetail.append(items);

  const statusSection = node("section", "detail-section");
  statusSection.append(node("h3", null, "Ubah status"));
  const form = node("form", "status-form");

  const selectField = node("div", "field");
  const selectLabel = node("label", null, "Status baru");
  selectLabel.htmlFor = "detail-status";
  const select = node("select");
  select.id = "detail-status";
  for (const status of STATUSES) {
    const option = node("option", null, status.label);
    option.value = status.value;
    if (status.value === order.status) option.selected = true;
    select.append(option);
  }
  selectField.append(selectLabel, select);

  const noteField = node("div", "field");
  const noteLabel = node("label", null, "Catatan perubahan (opsional)");
  noteLabel.htmlFor = "detail-note";
  const noteInput = node("input");
  noteInput.id = "detail-note";
  noteInput.type = "text";
  noteInput.maxLength = 300;
  noteInput.placeholder = "Contoh: sudah dikonfirmasi via WhatsApp";
  noteField.append(noteLabel, noteInput);

  const submit = node("button", "btn btn-primary", "Simpan status");
  submit.type = "submit";

  form.append(selectField, noteField, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    try {
      const data = await api(`/orders/${encodeURIComponent(order.id)}/status`, {
        method: "PATCH",
        body: { status: select.value, note: noteInput.value.trim() },
      });
      toast(`Status ${order.orderNumber} diperbarui.`);
      if (data.capacityWarning) {
        toast(
          `Perhatian: kapasitas ${formatDate(data.capacity.date)} terlampaui (${formatNumber(
            data.capacity.totalQuantity,
          )} dari ${formatNumber(data.capacity.dailyCapacity)} pcs).`,
          "warning",
        );
      }
      renderOrderDetail(data.order);
      if (state.view === "orders") loadOrders();
      if (state.view === "dashboard") loadDashboard();
    } catch (error) {
      if (error.status !== 401) toast(error.message, "error");
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  });

  statusSection.append(form);
  el.orderDetail.append(statusSection);

  const historySection = node("section", "detail-section");
  historySection.append(node("h3", null, "Riwayat status"));
  const history = node("ul", "history-list");
  if (order.history.length === 0) {
    history.append(node("li", null, "Belum ada riwayat."));
  } else {
    for (const entry of order.history) {
      const item = node("li");
      const nextLabel = STATUS_LABEL[entry.newStatus] || entry.newStatus;
      item.append(
        node(
          "span",
          null,
          entry.previousStatus
            ? `${STATUS_LABEL[entry.previousStatus] || entry.previousStatus} → ${nextLabel}`
            : `Pesanan dibuat (${nextLabel})`,
        ),
      );
      if (entry.note) item.append(node("span", null, entry.note));
      item.append(node("span", "history-time", formatDateTime(entry.createdAt)));
      history.append(item);
    }
  }
  historySection.append(history);
  el.orderDetail.append(historySection);
}

el.orderClose.addEventListener("click", () => el.orderDialog.close());
el.orderDialog.addEventListener("click", (event) => {
  if (event.target === el.orderDialog) el.orderDialog.close();
});

/* -------------------------------------------------------------- products */

async function loadProducts() {
  try {
    const data = await api("/products");
    state.products = data.products || [];
    renderProducts(state.products);
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  }
}

function renderProducts(products) {
  el.productsBody.replaceChildren();
  el.productsEmpty.hidden = products.length > 0;
  el.productsTable.closest(".table-wrap").hidden = products.length === 0;

  for (const product of products) {
    const row = node("tr");

    const nameCell = node("td");
    nameCell.append(node("span", "cell-strong", product.name));
    if (product.description) nameCell.append(node("span", "cell-sub", product.description));
    row.append(nameCell);

    row.append(node("td", "num", formatRupiah(product.price)));

    const statusCell = node("td");
    statusCell.append(
      badge(product.isActive ? "Tampil" : "Disembunyikan", product.isActive ? "badge--completed" : "badge--cancelled"),
    );
    row.append(statusCell);

    row.append(node("td", "num", formatNumber(product.sortOrder)));

    const actionCell = node("td");
    if (isOwner()) {
      const actions = node("div", "row-actions");

      const editButton = node("button", "btn btn-quiet btn-sm", "Edit");
      editButton.type = "button";
      editButton.addEventListener("click", () => openProductDialog(product));

      const toggleButton = node(
        "button",
        `btn btn-sm ${product.isActive ? "btn-danger" : "btn-quiet"}`,
        product.isActive ? "Sembunyikan" : "Tampilkan",
      );
      toggleButton.type = "button";
      toggleButton.addEventListener("click", () => toggleProduct(product));

      actions.append(editButton, toggleButton);
      actionCell.append(actions);
    }
    row.append(actionCell);

    el.productsBody.append(row);
  }
}

async function toggleProduct(product) {
  try {
    await api(`/products/${encodeURIComponent(product.id)}`, {
      method: "PATCH",
      body: { isActive: !product.isActive },
    });
    toast(`${product.name} ${product.isActive ? "disembunyikan dari" : "ditampilkan di"} situs.`);
    loadProducts();
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  }
}

function openProductDialog(product) {
  el.productForm.reset();
  el.productError.hidden = true;
  el.productId.value = product ? product.id : "";
  el.productTitle.textContent = product ? "Edit produk" : "Tambah produk";
  el.productName.value = product ? product.name : "";
  el.productPrice.value = product ? String(product.price) : "";
  el.productDescription.value = product ? product.description || "" : "";
  el.productImage.value = product && product.imageUrl ? product.imageUrl : "";
  el.productSort.value = product ? String(product.sortOrder) : "0";
  el.productActive.checked = product ? product.isActive : true;
  el.productDialog.showModal();
  window.setTimeout(() => el.productName.focus(), 40);
}

el.productAdd.addEventListener("click", () => openProductDialog(null));
el.productClose.addEventListener("click", () => el.productDialog.close());
el.productCancel.addEventListener("click", () => el.productDialog.close());
el.productDialog.addEventListener("click", (event) => {
  if (event.target === el.productDialog) el.productDialog.close();
});

el.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.productError.hidden = true;

  const name = el.productName.value.trim();
  const price = Number(el.productPrice.value);
  const id = el.productId.value;

  if (name.length < 2) {
    el.productError.textContent = "Nama produk minimal 2 karakter.";
    el.productError.hidden = false;
    return;
  }
  if (!Number.isInteger(price) || price < 1) {
    el.productError.textContent = "Harga harus bilangan bulat minimal Rp1.";
    el.productError.hidden = false;
    return;
  }

  const payload = {
    name,
    price,
    description: el.productDescription.value.trim(),
    imageUrl: el.productImage.value.trim() || null,
    sortOrder: Number(el.productSort.value) || 0,
    isActive: el.productActive.checked,
  };

  el.productSubmit.disabled = true;
  el.productSubmit.setAttribute("aria-busy", "true");

  try {
    if (id) {
      await api(`/products/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
      toast("Produk diperbarui.");
    } else {
      await api("/products", { method: "POST", body: payload });
      toast("Produk ditambahkan.");
    }
    el.productDialog.close();
    loadProducts();
  } catch (error) {
    if (error.status !== 401) {
      el.productError.textContent =
        error.details && error.details.length ? error.details[0].message : error.message;
      el.productError.hidden = false;
    }
  } finally {
    el.productSubmit.disabled = false;
    el.productSubmit.removeAttribute("aria-busy");
  }
});

/* ------------------------------------------------------------ production */

async function loadProduction() {
  const from = el.productionFrom.value || todayJakarta();
  const to = el.productionTo.value || addDays(from, 13);
  el.productionFrom.value = from;
  el.productionTo.value = to;

  try {
    const data = await api(
      `/production?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    state.production = data;
    if (!el.capacityForm.contains(document.activeElement)) {
      el.capacityInput.value = String(data.dailyCapacity);
    }
    el.capacityUpdated.textContent = `${formatNumber(data.dailyCapacity)} pcs per hari`;
    renderProductionDays(data.days || []);
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  }
}

function renderProductionDays(days) {
  el.productionBody.replaceChildren();
  el.productionEmpty.hidden = days.length > 0;
  el.productionTable.closest(".table-wrap").hidden = days.length === 0;

  for (const day of days) {
    const row = node("tr");

    const dateCell = node("td", "nowrap");
    dateCell.append(node("span", "cell-strong", formatDate(day.date)));
    dateCell.append(node("span", "cell-sub", formatDayName(day.date)));
    row.append(dateCell);

    row.append(node("td", "num", formatNumber(day.orderCount)));
    row.append(node("td", "num", `${formatNumber(day.totalQuantity)} pcs`));
    row.append(
      node(
        "td",
        "num",
        day.remaining < 0 ? `Lewat ${formatNumber(Math.abs(day.remaining))} pcs` : `${formatNumber(day.remaining)} pcs`,
      ),
    );

    const conditionCell = node("td");
    conditionCell.append(conditionBadge(day));
    row.append(conditionCell);

    const progressCell = node("td");
    progressCell.append(progressBar(day.usagePercent, day.condition));
    progressCell.append(node("span", "cell-sub", `${formatNumber(day.usagePercent)}%`));
    row.append(progressCell);

    el.productionBody.append(row);
  }
}

el.productionFilter.addEventListener("submit", (event) => {
  event.preventDefault();
  loadProduction();
});

el.capacityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isOwner()) return;

  const value = Number(el.capacityInput.value);
  if (!Number.isInteger(value) || value < 1) {
    toast("Kapasitas harus bilangan bulat minimal 1 pcs.", "error");
    return;
  }

  el.capacitySubmit.disabled = true;
  el.capacitySubmit.setAttribute("aria-busy", "true");

  try {
    await api("/production/settings", { method: "PATCH", body: { dailyCapacity: value } });
    toast(`Kapasitas harian disimpan: ${formatNumber(value)} pcs.`);
    loadProduction();
    if (state.view === "dashboard") loadDashboard();
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
  } finally {
    el.capacitySubmit.disabled = false;
    el.capacitySubmit.removeAttribute("aria-busy");
  }
});

/* ------------------------------------------------------------------ boot */

async function boot() {
  try {
    const data = await api("/auth/me");
    startApp(data.admin);
  } catch {
    /* showLogin sudah dipanggil oleh api() untuk 401 */
  }
}

boot();
