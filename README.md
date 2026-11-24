# Pastel Ibu

Sistem pemesanan pastel rumahan: situs publik untuk pelanggan, dashboard admin
untuk mengelola pesanan, produk, dan kapasitas produksi. Semua data lewat satu
backend; tidak ada akses database dari browser.

## Stack

| Bagian | Teknologi |
|---|---|
| Hosting | Vercel (satu project: aset statis + Vercel Functions) |
| Runtime API | Node.js 20 + Hono + TypeScript |
| Database | Turso (libSQL, dialek SQLite), migrasi SQL di `migrations/` |
| Validasi | zod |
| Frontend | HTML/CSS/JS statis di `public/`, dilayani CDN Vercel |
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
api/handler.ts             Satu Vercel Function untuk semua /api/* (dipanggil via rewrite)
vercel.json                Static public/, rewrite /api/* dan /admin, header keamanan
migrations/0001_init.sql   Skema database (8 tabel + index)
seeds/0001_products.sql    Seed produk + kapasitas default (idempoten)
src/index.ts               Aplikasi Hono, routing, security header
src/dev.ts                 Server pengembangan lokal (Node)
src/routes/public.ts       API publik: produk, config, buat pesanan
src/routes/admin.ts        API admin: auth, dashboard, pesanan, produk, produksi
src/lib/database.ts        Adapter database bergaya D1 di atas libSQL/Turso
src/lib/env.ts             Pembacaan variabel lingkungan runtime
src/lib/                   orders, session, password, rate-limit, time, http
src/middleware/auth.ts     requireAdmin / requireRole
public/                    Situs publik (index.html, styles.css, app.js)
public/admin/              Dashboard admin (index.html, admin.css, admin.js)
scripts/db-push.mjs        Terapkan migrasi + seed
scripts/create-admin.mjs   Satu-satunya cara membuat akun admin
```

## Mulai cepat (lokal)

```bash
npm install
cp .env.example .env      # isi TURSO_DATABASE_URL=file:.local/pastel-ibu.db
npm run db:push:local     # buat tabel + 2 produk + kapasitas 300
ADMIN_EMAIL=admin@pastelibu.id ADMIN_PASSWORD='password-panjang-anda' \
  npm run admin:create -- --url file:.local/pastel-ibu.db
npm run dev               # http://localhost:3000
```

Lalu buka `/` untuk situs publik dan `/admin/` untuk dashboard.
Panduan lengkap (termasuk deploy) ada di [SETUP.md](SETUP.md); daftar endpoint di
[API.md](API.md).

## Deploy ke Vercel

Ringkas (detail di [SETUP.md](SETUP.md#5-deploy-ke-vercel)):

1. Buat database Turso, ambil `libsql://…` URL dan token.
2. Import repo GitHub ini di Vercel, tambahkan environment variable
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BUSINESS_NAME`, `WHATSAPP_NUMBER`,
   `ADMIN_SESSION_TTL_HOURS`, lalu deploy.
3. Dari mesin lokal: `npm run db:push` dan `npm run admin:create` (dengan env
   database yang sama) untuk mengisi skema dan akun admin.
4. Verifikasi sekali jalan: `npm run smoke -- --url https://<domain>`
   (health, katalog, login admin, dan pesanan uji).

## Keamanan

- Password admin tidak pernah disimpan mentah: PBKDF2-SHA256 210.000 iterasi +
  salt acak, perbandingan timing-safe, dan kerja hash palsu untuk email tak dikenal.
- Token sesi disimpan sebagai hash SHA-256; cookie `httpOnly`, `SameSite=Strict`,
  `Secure` di https, TTL dibatasi 1–72 jam.
- Semua nilai SQL dikirim sebagai parameter binding (tidak ada string SQL yang
  dirangkai dari input pengguna).
- Semua data dari server dirender dengan `textContent` (tanpa `innerHTML`).
- Header: CSP, HSTS (https), nosniff, Referrer-Policy, X-Frame-Options,
  Permissions-Policy.
- Kredensial tidak pernah ada di repo: password admin dibuat lewat skrip dengan
  input dari environment, dan `.env` di-gitignore.

## Status

- Kode siap deploy ke Vercel + Turso; project Vercel dan database dibuat oleh pemilik akun.
- Nomor WhatsApp masih placeholder (`6281234567890`) — ganti di environment variable.
