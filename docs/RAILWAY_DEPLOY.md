# Railway Deploy

Target arsitektur:

- Satu project Railway untuk monorepo ini.
- Service `pos-backend` dari folder `pos-backend`.
- Service `pos-dashboard` dari folder `pos-dashboard`.
- Satu database PostgreSQL terkelola Railway.
- Satu volume untuk backend agar `uploads/` dan `backups/` persisten.

## Backend

Setelan service yang disarankan:

- `source.rootDirectory`: `/pos-backend`
- `build.buildCommand`: `npm run build`
- `deploy.startCommand`: `npm start`
- `deploy.preDeployCommand`: `npm run db:migrate`
- `deploy.healthcheckPath`: `/health`

Variable backend minimum:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `NODE_ENV=production`
- `JWT_SECRET=<ambil dari env production>`
- `JWT_EXPIRES_IN=<ambil dari env production>`
- `MIDTRANS_SERVER_KEY=<ambil dari env production>`
- `MIDTRANS_IS_PRODUCTION=true|false`
- `MIDTRANS_NOTIFICATION_URL=https://<backend-domain>/api/payments/webhook/midtrans`
- `MIDTRANS_QRIS_ACQUIRER=<ambil dari env production>`
- `MIDTRANS_QRIS_EXPIRY_MINUTES=<ambil dari env production>`
- `MIDTRANS_HTTP_MAX_RETRIES=<ambil dari env production>`
- `MIDTRANS_HTTP_RETRY_DELAY_MS=<ambil dari env production>`
- `APK_DOWNLOAD_URL=<ambil dari env production>`
- `APK_VERSION=<ambil dari env production>`
- `APK_BUILD=<ambil dari env production>`
- `APK_CHECKSUM=<ambil dari env production>`
- `APK_RELEASE_NOTES=<ambil dari env production>`
- `REDIS_URL=<opsional>`
- `ALLOWED_ORIGINS=https://<dashboard-domain>,http://localhost:5173`
- `BACKEND_PUBLIC_URL=https://<backend-domain>`
- `BUSINESS_TZ_OFFSET_MINUTES=420`
- `APP_DATA_DIR=/data/pos`

Catatan:

- `APP_DATA_DIR` dipakai backend untuk menyimpan `uploads` dan `backups` ke volume.
- Jangan jalankan seed destruktif di production kecuali benar-benar diperlukan.

## Dashboard

Setelan service yang disarankan:

- `source.rootDirectory`: `/pos-dashboard`
- `build.buildCommand`: `npm run build`
- `build.builder`: `RAILPACK`

Variable dashboard minimum:

- `VITE_API_BASE_URL=https://<backend-domain>/api`
- `RAILPACK_STATIC_FILE_ROOT=dist`

Catatan:

- Dashboard adalah static site terpisah, jadi `VITE_API_BASE_URL` wajib mengarah ke domain backend publik.
- Relative asset dari backend seperti `/uploads/...` sudah dipatch agar ikut memakai domain backend.

## Urutan Deploy

1. Buat/link Railway project.
2. Tambah service `pos-backend`, `pos-dashboard`, dan database PostgreSQL.
3. Pasang volume ke service backend, lalu set `APP_DATA_DIR=/data/pos`.
4. Deploy backend dulu.
5. Ambil domain backend, set `VITE_API_BASE_URL` di dashboard.
6. Deploy dashboard.
7. Ambil domain dashboard, update `ALLOWED_ORIGINS` di backend.
8. Redeploy backend dan verifikasi `GET /health`.
