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
   `framework: null`, output `public/`, rewrite `/admin`, dan rewrite
   `/api/:path*` ke satu function `api/handler.ts`).
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
| `ADMIN_EMAIL` | `admin@pastelibu.id` | opsional, akun admin awal |
| `ADMIN_PASSWORD` | password minimal 10 karakter | opsional, dipakai hanya saat tabel admin kosong |

Jangan menaruh nilai ini di file mana pun di repo. Setelah env tersimpan, deploy.

### 5.3 Isi database produksi

Database Turso yang baru dibuat belum punya tabel. Aplikasi menyiapkannya sendiri
pada permintaan pertama: tabel dibuat, dua produk awal diisi, dan akun admin dibuat
dari `ADMIN_EMAIL` + `ADMIN_PASSWORD` bila tabel admin masih kosong. Jadi cukup buka
`https://<domain>/api/health` setelah deploy.

Langkah manual hanya perlu bila ingin menyiapkan database dari mesin lokal:

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:push
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  ADMIN_EMAIL=admin@pastelibu.id ADMIN_PASSWORD='password-panjang' \
  npm run admin:create
```

Setelah akun admin terbentuk, hapus `ADMIN_PASSWORD` dari Environment Variables
Vercel lalu redeploy. Skema tidak pernah ditimpa dan data admin tidak direset oleh
bootstrap.

### 5.4 Verifikasi

Satu perintah untuk memeriksa health, katalog, login admin, dan pembuatan pesanan uji:

```bash
ADMIN_EMAIL=admin@pastelibu.id ADMIN_PASSWORD='password-anda' \
  npm run smoke -- --url https://<domain>
```

Pesanan uji otomatis dibatalkan (`CANCELLED`) agar tidak memakan kapasitas
produksi; pakai `--keep` bila ingin dibiarkan berstatus `PENDING`. Tanpa
`ADMIN_EMAIL`/`ADMIN_PASSWORD`, pemeriksaan admin dilewati.

Pemeriksaan manual yang setara:

- `https://<domain>/api/health` → `{"status":"ok","database":{"connected":true,"schemaReady":true},"activeProducts":2,"adminConfigured":true}`.
- `https://<domain>/` menampilkan dua produk.
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
| Katalog kosong / "Katalog gagal dimuat" | API tidak terjangkau atau database kosong. Jalankan `npm run smoke -- --url <domain>`; pesan dari `/api/health` menunjukkan penyebabnya |
| `/api/health` 503 `DB_AUTH_FAILED` | `TURSO_AUTH_TOKEN` bukan token untuk `TURSO_DATABASE_URL` itu (token dari database lain atau sudah dirotasi). Salin ulang dari `turso db tokens create` |
| `/api/health` 503 `DB_UNAVAILABLE` | URL database salah atau tidak bisa dihubungi. Pastikan formatnya `libsql://...` tanpa garis miring di akhir |
| `/api/health` 503 `DB_SCHEMA_MISSING` | Bootstrap gagal membuat tabel (token read-only). Beri token baca-tulis, atau jalankan `npm run db:push` |
| Login 401 padahal password benar | `adminConfigured: false` di `/api/health` berarti belum ada akun admin: set `ADMIN_EMAIL` + `ADMIN_PASSWORD` di Vercel lalu redeploy, atau jalankan `npm run admin:create` |
| `/admin/` 404 | Pastikan `public/admin/index.html` ikut ter-deploy dan rewrite `/admin` aktif |
| `/api/health` 404 setelah deploy | Project belum memakai preset **Other** atau `vercel.json` tidak ikut ter-commit sehingga rewrite `/api/:path*` tidak aktif. Set `Framework Preset: Other` di Settings → Build & Development, lalu redeploy |
| `/api/health` 200 tapi katalog kosong | Database kosong: jalankan `npm run db:push` dengan env Turso produksi |
| API membalas 503 `Server belum dikonfigurasi` | `TURSO_DATABASE_URL` belum diisi di environment Vercel; isi lalu redeploy |
| Login selalu 401 | Akun belum dibuat / password salah; ulangi langkah 3 |
| 429 saat login | Rate limit 5/15 menit per email atau 10/15 menit per IP; tunggu atau hapus baris `rate_limits` |
| 403 saat menyimpan produk | Login sebagai `OWNER`, bukan `STAFF` |
| Perubahan kapasitas tidak terlihat | `GET /api/public/config` di-cache 60 detik oleh browser/CDN |
