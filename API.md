# API Pastel Ibu

Base URL lokal: `http://localhost:3000`; di produksi `https://<domain-vercel>`.
Semua request dan respons JSON (`Content-Type: application/json`), kecuali aset statis.
Semua endpoint di bawah `/api/*` dilayani satu Vercel Function (`api/handler.ts`),
yang dipanggil lewat rewrite `/api/:path*` → `/api/handler?route=:path*`.

## Format error

```json
{ "error": { "message": "Pesan untuk pengguna", "details": [{ "field": "customerPhone", "message": "Nomor WhatsApp tidak valid." }] } }
```

`details` hanya ada untuk validasi zod atau limit. Status yang dipakai: `400`
validasi, `401` belum login/sesi habis, `403` role atau origin tidak diizinkan,
`404` tidak ditemukan, `429` kena rate limit (ada header `Retry-After`, detik),
`500` kesalahan server.

## Publik

### `GET /api/public/products`

Daftar produk aktif, urut `sort_order` lalu harga.

```json
{ "products": [{ "id": "pastel-1000", "name": "Pastel Rp1.000", "price": 1000, "description": "…", "imageUrl": null }] }
```

`Cache-Control: public, max-age=60`.

### `GET /api/public/config`

```json
{
  "business": { "name": "Pastel Ibu", "whatsappNumber": "6281234567890", "whatsappUrl": "https://wa.me/6281234567890" },
  "options": { "purposes": ["Pribadi", "Sekolah / Kampus", "Acara / Event", "Reseller / Mitra", "Lainnya"], "orderTypes": ["Reguler", "Partai besar / Event"] },
  "today": "2026-11-24",
  "dailyCapacity": 300
}
```

`today` dihitung di Asia/Jakarta; `dailyCapacity` dari tabel `production_settings`.

### `POST /api/public/orders`

Membuat pesanan. Harga dihitung dari database, bukan dari body.

```json
{
  "customerName": "Siti",
  "customerPhone": "081234567890",
  "purpose": "Acara / Event",
  "orderType": "Reguler",
  "deliveryDate": "2026-11-28",
  "deliveryTime": "10:00",
  "deliveryLocation": "Jl. Merdeka 10, Bandung",
  "notes": "Isi tanpa pedas",
  "items": [{ "productId": "pastel-1000", "quantity": 40 }],
  "idempotencyKey": "uuid-dari-browser"
}
```

Aturan: nama 2–100 karakter; telepon `^(?:\+62|62|0)8[1-9][0-9]{6,11}$`; tanggal
`YYYY-MM-DD` antara hari ini (Jakarta) dan +180 hari; waktu `HH:MM`; lokasi 5–500
karakter; 1–10 baris produk, tiap kuantitas 1–10.000 (baris 0 diabaikan, produk
sama digabung). `idempotencyKey` opsional 8–100 karakter.

Respons `201` (baru) atau `200` (duplikat, key sama):

```json
{
  "order": { "id": "…", "orderNumber": "PI-261128-AB12", "totalQuantity": 40, "totalPrice": 40000, "status": "PENDING", "items": [{ "name": "Pastel Rp1.000", "unitPrice": 1000, "quantity": 40, "subtotal": 40000 }], "history": [] },
  "duplicate": false,
  "whatsapp": { "number": "6281234567890", "message": "*PESANAN BARU — PASTEL IBU*…", "url": "https://wa.me/…" },
  "capacity": { "date": "2026-11-28", "orderCount": 3, "totalQuantity": 140, "dailyCapacity": 300, "remaining": 160, "usagePercent": 47, "condition": "AMAN", "label": "Aman" },
  "capacityWarning": false
}
```

Rate limit: 30 pesanan/jam per IP (`order:<ip>`).

## Admin

Semua endpoint di bawah wajib sesi cookie `pastel_admin_session` (kecuali login).
Request non-GET menolak `Origin` berbeda dengan host (403).

### `POST /api/admin/auth/login`

```json
{ "email": "admin@pastelibu.id", "password": "…" }
```

`200` → `{ "admin": { "id", "name", "email", "role" }, "expiresAt": "…" }` dan
`Set-Cookie` sesi. `401` untuk kredensial salah (pesan disamakan agar tidak
membocorkan email terdaftar). Rate limit: 10/15 menit per IP, 5/15 menit per email.

### `POST /api/admin/auth/logout`

Menghapus sesi di server dan cookie. `{ "ok": true }`.

### `GET /api/admin/auth/me`

`{ "admin": { "id", "name", "email", "role" } }`.

### `GET /api/admin/dashboard?date=YYYY-MM-DD`

`date` default hari ini (Jakarta).

```json
{
  "date": "2026-11-24",
  "stats": { "totalOrders": 12, "totalProducts": 640, "pendingOrders": 4, "confirmedOrders": 2, "processingOrders": 1, "completedOrders": 5, "cancelledOrders": 0 },
  "capacity": { "date": "…", "orderCount": 3, "totalQuantity": 140, "dailyCapacity": 300, "remaining": 160, "usagePercent": 47, "condition": "AMAN", "label": "Aman" },
  "upcoming": [{ "date": "2026-11-24", "orderCount": 3, "totalQuantity": 140, "condition": "AMAN", "usagePercent": 47, "remaining": 160, "dailyCapacity": 300, "label": "Aman" }],
  "recentOrders": [{ "id": "…", "orderNumber": "…", "customerName": "…", "deliveryDate": "…", "totalQuantity": 40, "totalPrice": 40000, "status": "PENDING", "createdAt": "…" }]
}
```

`upcoming` selalu 7 hari mulai `date`.

### `GET /api/admin/orders`

Query: `q` (nomor/nama/telepon), `status` (`PENDING|CONFIRMED|PROCESSING|COMPLETED|CANCELLED`),
`date` (`YYYY-MM-DD`, prioritas atas `from`/`to`), `from`, `to`, `page` (default 1),
`perPage` (default 20, maks 100).

```json
{ "orders": [{ "id": "…", "orderNumber": "…", "customerName": "…", "customerPhone": "…", "deliveryDate": "…", "deliveryTime": "10:00", "totalQuantity": 40, "totalPrice": 40000, "status": "PENDING", "createdAt": "…", "updatedAt": "…" }],
  "pagination": { "page": 1, "perPage": 20, "total": 1, "totalPages": 1 } }
```

### `GET /api/admin/orders/:id`

`:id` menerima UUID pesanan **atau** nomor pesanan. Mengembalikan `{ "order": { …,
"items": [...], "history": [{ "previousStatus", "newStatus", "changedBy", "note", "createdAt" }] } }`.

### `PATCH /api/admin/orders/:id/status`

```json
{ "status": "CONFIRMED", "note": "Sudah dikonfirmasi via WhatsApp" }
```

`note` opsional (maks 300). Respons: `{ "order", "changed": true, "capacity", "capacityWarning" }`.
Status sama dengan sebelumnya → `changed: false`. Setiap perubahan dicatat di
`order_status_history`.

### `GET /api/admin/products`

Semua produk, termasuk yang nonaktif:
`{ "products": [{ "id", "name", "price", "description", "imageUrl", "isActive": true, "sortOrder": 10, "createdAt", "updatedAt" }] }`.

### `POST /api/admin/products` — OWNER

`{ "name", "price", "description"?, "imageUrl"?, "isActive"?, "sortOrder"? }` →
`201 { "product": { "id", "name", "price" } }`.

### `PATCH /api/admin/products/:id` — OWNER

Body parsial dari field di atas (minimal satu). `200 { "ok": true }`, `404` bila
tidak ada. Produk tidak dihapus permanen; gunakan `isActive: false`.

### `GET /api/admin/production?from=YYYY-MM-DD&to=YYYY-MM-DD`

Default `from` = hari ini, `to` = +13 hari; rentang maksimal 92 hari.

```json
{ "from": "2026-11-24", "to": "2026-12-07", "dailyCapacity": 300,
  "days": [{ "date": "2026-11-24", "orderCount": 3, "totalQuantity": 140, "remaining": 160, "usagePercent": 47, "condition": "AMAN", "label": "Aman" }] }
```

### `PATCH /api/admin/production/settings` — OWNER

`{ "dailyCapacity": 350 }` (1–100.000) → `{ "dailyCapacity": 350, "updatedAt": "…" }`.
Nilai ini langsung dipakai perhitungan kapasitas dan `GET /api/public/config`.

## Lain-lain

- `GET /api/health` → `{ "status": "ok" }` (503 `degraded` bila database tidak terjangkau).
- Kondisi kapasitas: `<80%` `AMAN`, `<100%` `HAMPIR_PENUH`, `>=100%` `MELEBIHI`.
- Status pesanan: `PENDING`, `CONFIRMED`, `PROCESSING`, `COMPLETED`, `CANCELLED`.
