# POS Backend API

Express.js + Prisma + PostgreSQL untuk POS single-bisnis.

## Prasyarat

- Node.js >= 18
- PostgreSQL >= 14

## Setup Dev

```bash
# 1. Install dependencies
npm install

# 2. Copy dan isi env
cp .env.example .env

# 3. Generate Prisma client
npm run db:generate

# 4. Migration
npm run db:migrate

# 5. Seed data awal
npm run db:seed

# 6. Jalankan server
npm run dev
```

Server default: `http://localhost:3000`

Jika sebelumnya memakai histori migration lama, jalankan reset sekali:

```bash
npm run db:reset
```

## Struktur Singkat

```text
src/
  app.js
  config/
  middleware/
  modules/
  utils/
prisma/
  schema.prisma
```

## Endpoint Utama

### Auth

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Orders

- `POST /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders/:id/cancel`

### Payments

- `POST /api/payments/intents`
- `GET /api/payments/:id/status`
- `POST /api/payments/:id/refund`
- `POST /api/payments/webhook/midtrans`

### Shift

- `POST /api/shifts/open`
- `GET /api/shifts/active`
- `POST /api/shifts/:id/cash`
- `GET /api/shifts/:id/summary`
- `POST /api/shifts/:id/close`

### Lainnya

- `GET/POST/PUT /api/products`
- `GET/POST /api/branches`
- `GET/POST /api/inventory`
- `GET /api/reports/daily_sales`
- `GET /api/downloads/android`

## Catatan

- Aplikasi memakai satu `DATABASE_URL`.
- Gateway online yang dipakai adalah Midtrans Core API untuk `QRIS` saja, tanpa Snap.
- Pastikan `MIDTRANS_SERVER_KEY` dan `MIDTRANS_NOTIFICATION_URL` sudah diisi sebelum create QRIS.
- Refund QRIS memakai endpoint Midtrans direct refund, dan fitur itu harus aktif di akun Midtrans merchant.
