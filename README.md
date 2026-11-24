# Pastel Ibu

Sistem pemesanan pastel rumahan: situs publik untuk pelanggan, dashboard admin
untuk mengelola pesanan, produk, dan kapasitas produksi. Semua data lewat satu
backend Cloudflare Worker + D1; tidak ada akses database dari browser.

## Stack

| Bagian | Teknologi |
|---|---|
| Runtime | Cloudflare Workers (Hono + TypeScript) |
| Database | Cloudflare D1 (SQLite), migrasi SQL di `migrations/` |
| Validasi | zod |
| Frontend | HTML/CSS/JS statis di `public/`, dilayani Worker lewat binding `ASSETS` |
| Auth admin | Email + password (PBKDF2-SHA256 210.000 iterasi), sesi cookie httpOnly |
| Zona waktu | Asia/Jakarta (WIB) |

Satu origin, tiga area: `/` (publik), `/admin` (dashboard admin), `/api/*` (JSON).
Pemisahan dijaga di server, bukan di subdomain.

## Fitur

**Situs publik `/`**
- Katalog produk dari database, harga satuan, tombol jumlah +/− dan ringkasan harga live.
- Form pesanan dengan validasi klien dan server: nama, WhatsApp, keperluan, jenis
  pesanan, tanggal & jam kirim, lokasi, catatan.
- Setelah pesanan tersimpan: nomor pesanan, total, dan tombol lanjut ke WhatsApp
  berisi pesan yang sudah disusun server.
- Kapasitas produksi dan nomor WhatsApp dibaca dari API, bukan ditulis di HTML.

**Dashboard admin `/admin`**
- Login email + password (tanpa registrasi publik), sesi 8 jam, tombol keluar.
- Dashboard: statistik pesanan, kapasitas tanggal terpilih, pesanan terbaru,
  jadwal 7 hari ke depan.
- Pesanan: cari/filter/paginasi, detail lengkap, ubah status + catatan, riwayat status.
- Produk: tambah, edit, sembunyikan/tampilkan, atur urutan (khusus OWNER).
- Produksi: beban per tanggal dan pengaturan kapasitas harian (khusus OWNER).

## Aturan bisnis yang ditegakkan server

- Harga dan total **selalu dihitung ulang dari database**; harga dari browser diabaikan.
- `order_items` menyimpan snapshot nama dan harga saat transaksi.
- Nomor pesanan unik `PI-YYMMDD-XXXX`; status awal `PENDING`.
- Idempotency key mencegah pesanan ganda saat tombol dikirim dua kali.
- Pesanan `CANCELLED` tidak dihitung ke kapasitas (default 300 pcs/hari).
- Pesanan yang melebihi kapasitas **tetap diterima**, dengan peringatan untuk admin.
- Tanggal kirim dibatasi hari ini (Jakarta) sampai +180 hari.
- Rate limit: 30 pesanan/jam per IP, login 10/15 menit per IP dan 5/15 menit per email.
- Semua `/api/admin/*` wajib sesi; perubahan state menolak origin asing (403);
  aksi produk dan kapasitas hanya untuk role `OWNER`.

## Struktur

```
migrations/0001_init.sql   Skema D1 (8 tabel + index)
seeds/0001_products.sql    Seed produk + kapasitas default (idempoten)
src/index.ts               Aplikasi Hono, routing, security header
src/routes/public.ts       API publik: produk, config, buat pesanan
src/routes/admin.ts        API admin: auth, dashboard, pesanan, produk, produksi
src/lib/                   orders, session, password, rate-limit, time, http
src/middleware/auth.ts     requireAdmin / requireRole
public/                    Situs publik (index.html, styles.css, app.js)
public/admin/              Dashboard admin (index.html, admin.css, admin.js)
scripts/create-admin.mjs   Satu-satunya cara membuat akun admin
```

## Mulai cepat

```bash
npm install
npm run db:migrate      # buat tabel di D1 lokal
npm run db:seed         # 2 produk + kapasitas 300
ADMIN_EMAIL=admin@pastelibu.id ADMIN_PASSWORD='ganti-password-ini' \
  npm run admin:create
npm run dev             # http://localhost:8787
```

Lalu buka `/` untuk situs publik dan `/admin` untuk dashboard.
Panduan lengkap (termasuk deploy) ada di [SETUP.md](SETUP.md); daftar endpoint di
[API.md](API.md).

## Status

- Phase 1–3 selesai: backend, situs publik, dashboard admin.
- Belum di-deploy: `database_id` di `wrangler.jsonc` masih placeholder.
- Nomor WhatsApp masih placeholder (`6281234567890`) — ganti di `wrangler.jsonc`.
