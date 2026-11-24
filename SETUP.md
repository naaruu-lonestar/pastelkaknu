# Setup Pastel Ibu

Panduan menjalankan proyek secara lokal dan menyiapkannya untuk produksi.

## Prasyarat

- Node.js 20+ dan npm
- Akun Cloudflare (untuk deploy) atau hosting Worker lain yang kompatibel
- Tidak perlu Docker; D1 berjalan lokal lewat Wrangler

## 1. Pasang dependency

```bash
npm install
```

Versi Wrangler 4.x membutuhkan `@cloudflare/workers-types` 5.x. Jangan menurunkan
versi types tersebut tanpa menguji ulang `npm run typecheck`.

## 2. Siapkan database lokal

`wrangler dev` menyimpan data di `.wrangler/state` (gitignored).

```bash
npm run db:migrate     # migrations/0001_init.sql
npm run db:seed        # 2 produk + production_settings default 300 pcs
```

Cek isinya:

```bash
npx wrangler d1 execute pastel-ibu-db --local \
  --command "SELECT id, name, price, is_active FROM products"
```

## 3. Buat akun admin

Tidak ada registrasi publik; akun hanya lahir dari skrip ini (atau SQL manual).
Password minimal 10 karakter, role `OWNER` atau `STAFF`.

```bash
ADMIN_EMAIL=admin@pastelibu.id \
ADMIN_PASSWORD='ganti-password-ini' \
ADMIN_NAME='Ibu Pastel' \
ADMIN_ROLE=OWNER \
npm run admin:create
```

Skrip bersifat idempoten: email yang sama akan direset (password, nama, role) dan
sesi lamanya dihapus. Role `STAFF` bisa melihat dashboard dan mengubah status
pesanan, tetapi tidak bisa mengubah produk atau kapasitas produksi.

## 4. Jalankan

```bash
npm run dev            # wrangler dev --local --port 8787
```

- Situs publik: <http://localhost:8787/>
- Dashboard admin: <http://localhost:8787/admin>
- Health check: <http://localhost:8787/api/health>

Perintah lain:

```bash
npm run typecheck      # tsc --noEmit
node --check public/app.js public/admin/admin.js
```

## 5. Konfigurasi yang perlu diganti

| Nilai | Lokasi | Keterangan |
|---|---|---|
| `WHATSAPP_NUMBER` | `wrangler.jsonc` → `vars` | masih placeholder `6281234567890` |
| `BUSINESS_NAME` | `wrangler.jsonc` → `vars` | nama usaha di situs & pesan WhatsApp |
| `ADMIN_SESSION_TTL_HOURS` | `wrangler.jsonc` → `vars` | default 8 (dibatasi 1–72) |
| Kapasitas harian | Dashboard admin → Produksi | tabel `production_settings` |
| `database_id` | `wrangler.jsonc` → `d1_databases` | masih placeholder, isi setelah `wrangler d1 create` |

File `.env` **tidak** dibaca Worker saat berjalan; nilainya ada di `wrangler.jsonc`
(atau secret/variable di dashboard hosting). `.env.example` hanya dokumentasi dan
input untuk skrip pembuatan admin.

## 6. Deploy

### A. Cloudflare langsung

```bash
npx wrangler login
npx wrangler d1 create pastel-ibu-db        # salin database_id ke wrangler.jsonc
npm run db:migrate:remote
npm run db:seed:remote
node scripts/create-admin.mjs --remote \
  --email admin@domainmu.id --password 'password-panjang' --role OWNER
npx wrangler deploy
```

`wrangler.jsonc` sudah memuat binding `DB` dan folder aset `./public`, jadi situs
publik dan `/admin` ikut ter-deploy dalam satu Worker.

### B. Freebuff Sites

1. Buat proyek Sites, lalu tambahkan penyimpanan `d1` dengan nama binding `DB`
   untuk environment yang dituju.
2. Deploy memakai manifest Worker: `entrypoint` hasil bundle `src/index.ts`,
   `compatibilityDate` sesuai `wrangler.jsonc`, dan `assetsDirectory: "./public"`.
3. Jalankan migrasi + seed + pembuatan admin ke database remote (lihat langkah A,
   memakai `--remote`).
4. Deploy dulu, baru atur variabel (`WHATSAPP_NUMBER`, dll.) di panel hosting, lalu
   deploy ulang bila perlu.

Situs ini belum pernah di-deploy; `database_id` masih placeholder, jadi jangan
menganggap konfigurasi remote sudah aktif.

## 7. Reset data lokal

```bash
rm -rf .wrangler/state
npm run db:migrate && npm run db:seed
```

Atau bersihkan sebagian:

```bash
npx wrangler d1 execute pastel-ibu-db --local --command "DELETE FROM orders; DELETE FROM admin_sessions;"
```

(`order_items` dan `order_status_history` ikut terhapus lewat `ON DELETE CASCADE`.)

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `/admin` menampilkan JSON 404 | Worker tidak menyajikan aset; pastikan `assets.directory` ada di `wrangler.jsonc` |
| Login selalu 401 | Akun belum dibuat / password salah; ulangi langkah 3 |
| 429 saat login | Rate limit 5/15 menit per email atau 10/15 menit per IP; tunggu atau hapus baris `rate_limits` |
| 403 saat menyimpan produk | Login sebagai `OWNER`, bukan `STAFF` |
| `ERESOLVE` saat `npm install` | Versi `@cloudflare/workers-types` harus 5.x untuk Wrangler 4.x |
| Harga di situs berbeda dengan database | Cache `GET /api/public/*` 60 detik; tunggu atau muat ulang |
