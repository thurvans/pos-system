# Midtrans QRIS Integration Guide

Dokumen ini untuk mode single-bisnis, memakai Midtrans Core API tanpa Snap.

## Environment

Isi variabel berikut di `.env`:

```bash
MIDTRANS_SERVER_KEY=YOUR_MIDTRANS_SERVER_KEY
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_NOTIFICATION_URL=https://api.yourapp.com/api/payments/webhook/midtrans
MIDTRANS_QRIS_ACQUIRER=gopay
MIDTRANS_QRIS_EXPIRY_MINUTES=15
MIDTRANS_HTTP_MAX_RETRIES=2
MIDTRANS_HTTP_RETRY_DELAY_MS=400
```

## Payment Intent

```http
POST /api/payments/intents
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "uuid-order",
  "method": "QRIS",
  "idempotencyKey": "order-20260227-001"
}
```

Metode gateway online aktif:

- `QRIS`

Metode offline yang tetap tersedia:

- `CASH`
- `CARD`

## Webhook

```http
POST /api/payments/webhook/midtrans
```

Flow:

- verifikasi `signature_key` Midtrans
- parsing status transaksi
- idempotency via `payment_events`
- update status payment dan order

## Refund

```http
POST /api/payments/:id/refund
Authorization: Bearer <manager_or_above_token>
Content-Type: application/json

{
  "amount": 10000,
  "reason": "Produk dibatalkan"
}
```

Catatan:

- `CASH` dan `CARD` diproses sebagai refund manual.
- `QRIS` memakai endpoint Midtrans direct refund.
- Fitur refund QRIS harus aktif di akun Midtrans merchant.

## Catatan

- Gunakan `idempotencyKey` unik per payment intent.
- `MIDTRANS_NOTIFICATION_URL` harus mengarah ke endpoint publik backend.
- QRIS sandbox Midtrans hanya untuk pengujian; pembayaran final tetap mengikuti status callback/polling gateway.
