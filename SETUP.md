# Setup Pastel Ibu

Panduan menjalankan proyek secara lokal dan men-deploy ke Vercel dengan database
Turso (libSQL).

## Prasyarat

- Node.js 20+ dan npm
- Akun [Vercel](https://vercel.com) (hosting)
- Akun [Turso](https://turso.tech) (database SQLite terkelola)

Tidak perlu Docker, tidak perlu Cloudflare.

## 1. Pasang dependency

```bash
npm install
```

## 2. Siapkan database

### Lokal (paling cepat)

Database lokal cukup berupa file SQLite, dibuat otomatis oleh libSQL.

```bash
cp .env.example .env
# ubah satu baris ini di .env:
#   TURSO_DATABASE_URL=file:.local/pastel-ibu.db
npm run db:push:local
```

Perintah itu membuat 8 tabel, 2 produk (`pastel-1000`, `pastel-2000`), dan
`production_settings` dengan kapasitas 300 pcs/hari. Idempoten — aman diulang.

### Turso (untuk deploy)

```bash
# sekali saja
turso db create pastel-ibu
turso db show pastel-ibu --url          # → libsql://pastel-ibu-xxxx.turso.io
turso db tokens create pastel-ibu       # → token (simpan di secret manager)
```

Lalu isi `.env`:

```bash
TURSO_DATABASE_URL=libsql://pastel-ibu-xxxx.turso.io
TURSO_AUTH_TOKEN=token-dari-perintah-di-atas
```

dan terapkan skema:

```bash
npm run db:push
```

Bisa juga tanpa CLI Turso: buat database di dashboard Turso, salin URL dan
buat token di menu yang sama.

## 3. Buat akun admin

Tidak ada registrasi publik; akun hanya lahir dari skrip ini. Password minimal
10 karakter, role `OWNER` atau `STAFF`.

```bash
ADMIN_EMAIL=admin@pastelibu.id \
ADMIN_PASSWORD='password-panjang-anda' \
ADMIN_NAME='Ibu Pastel' \
ADMIN_ROLE=OWNER \
npm run admin:create
```

Untuk database lokal tambahkan `-- --url file:.local/pastel-ibu.db`.
Skrip bersifat idempoten: email yang sama akan direset (password, nama, role) dan
sesi lamanya dihapus. Password dikirim lewat environment, bukan argumen, supaya
tidak tersimpan di riwayat shell.

Role `STAFF` bisa melihat dashboard dan mengubah status pesanan, tetapi tidak bisa
mengubah produk atau kapasitas produksi.

## 4. Jalankan

```bash
npm run dev            # http://localhost:3000
```

- Situs publik: <http://localhost:3000/>
- Dashboard admin: <http://localhost:3000/admin/>
- Health check: <http://localhost:3000/api/health>

Perintah lain:

```bash
npm run typecheck      # tsc --noEmit
```

## 5. Deploy ke Vercel

### 5.1 Import project

1. Buka <https://vercel.com/new>, pilih repo `pastelkaknu`.
2. Framework Preset: **Other** (dibiarkan apa adanya; `vercel.json` sudah mengatur
   `framework: null`, output `public/`, dan rewrite `/admin`).
3. Tidak perlu Build Command maupun Output Directory khusus.

### 5.2 Environment variables

Tambahkan untuk **Production** dan **Preview**:

| Nama | Contoh | Keterangan |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://pastel-ibu-xxxx.turso.io` | URL database |
| `TURSO_AUTH_TOKEN` | `eyJ…` | token database (rahasia) |
| `BUSINESS_NAME` | `Pastel Ibu` | nama usaha |
| `WHATSAPP_NUMBER` | `6281234567890` | ganti dengan nomor asli |
| `ADMIN_SESSION_TTL_HOURS` | `8` | 1–72 |

Jangan menaruh nilai ini di file mana pun di repo. Setelah env tersimpan, deploy.

### 5.3 Isi database produksi

Dari mesin lokal, dengan env database produksi:

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:push
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  ADMIN_EMAIL=admin@pastelibu.id ADMIN_PASSWORD='password-panjang' \
  npm run admin:create
```

### 5.4 Verifikasi

- `https://<domain>/` menampilkan dua produk (kalau kosong, cek `/api/public/products`).
- `https://<domain>/api/health` → `{"status":"ok"}`.
- `https://<domain>/admin/` bisa login dan menampilkan dashboard.

## 6. Konfigurasi yang perlu diganti

| Nilai | Lokasi | Keterangan |
|---|---|---|
| `WHATSAPP_NUMBER` | env Vercel / `.env` | masih placeholder `6281234567890` |
| `BUSINESS_NAME` | env Vercel / `.env` | nama usaha di situs & pesan WhatsApp |
| `ADMIN_SESSION_TTL_HOURS` | env Vercel / `.env` | default 8 (dibatasi 1–72) |
| Kapasitas harian | Dashboard admin → Produksi | tabel `production_settings` |
| Harga & ketersediaan produk | Dashboard admin → Produk | tabel `products` |

## 7. Reset data lokal

```bash
rm -rf .local
npm run db:push:local
```

Atau bersihkan sebagian (butuh `turso db shell` untuk database remote):

```sql
DELETE FROM orders;
DELETE FROM admin_sessions;
DELETE FROM rate_limits;
```

(`order_items` dan `order_status_history` ikut terhapus lewat `ON DELETE CASCADE`.)

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Katalog kosong / "Katalog gagal dimuat" | API tidak terjangkau atau database kosong. Cek `/api/health`, lalu jalankan `npm run db:push` |
| `/admin/` 404 | Pastikan `public/admin/index.html` ikut ter-deploy dan rewrite `/admin` aktif |
| `/api/health` 404 setelah deploy | Project belum memakai preset **Other**. Set `Framework Preset: Other` di Settings → Build & Development, pastikan `vercel.json` ikut ter-commit, lalu redeploy. Seluruh `/api/*` dilayani satu function `api/[...path].ts` |
| API membalas 503 `Server belum dikonfigurasi` | `TURSO_DATABASE_URL` belum diisi di environment Vercel; isi lalu redeploy |
| Login selalu 401 | Akun belum dibuat / password salah; ulangi langkah 3 |
| 429 saat login | Rate limit 5/15 menit per email atau 10/15 menit per IP; tunggu atau hapus baris `rate_limits` |
| 403 saat menyimpan produk | Login sebagai `OWNER`, bukan `STAFF` |
| Perubahan kapasitas tidak terlihat | `GET /api/public/config` di-cache 60 detik oleh browser/CDN |
