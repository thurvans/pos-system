# Shift & Cash Drawer

## Konsep

Setiap kasir wajib membuka shift sebelum bisa membuat transaksi.
Satu kasir hanya boleh punya **satu shift aktif** per cabang pada satu waktu.

```
Kasir datang
    ↓
POST /api/shifts/open  (input modal awal)
    ↓
Transaksi berjalan (order, payment)
    ↓
Cash In/Out manual jika ada (titipan, pengeluaran)
    ↓
POST /api/shifts/:id/close  (input kas aktual)
    ↓
System hitung: selisih kas = kas aktual - kas yang diharapkan
    ↓
Laporan shift tersimpan
```

---

## API Endpoints

### Buka Shift
```
POST /api/shifts/open
Authorization: Bearer {token}

{
  "branchId": "uuid-cabang",
  "openingCash": 500000
}
```
Response:
```json
{
  "id": "shift-uuid",
  "status": "OPEN",
  "openingCash": 500000,
  "openedAt": "2024-01-15T08:00:00Z",
  "user": { "id": "...", "name": "Kasir Satu" },
  "branch": { "id": "...", "name": "Cabang Utama" }
}
```

### Cek Shift Aktif
```
GET /api/shifts/active?branch_id=uuid-cabang
```
Return `null` jika tidak ada shift aktif.

### Cash In / Out Manual
```
POST /api/shifts/:id/cash
{
  "type": "CASH_OUT",
  "amount": 50000,
  "note": "Beli plastik kresek"
}
```
`type` bisa: `CASH_IN` atau `CASH_OUT`.
`note` wajib diisi.

### Lihat Summary Shift (sebelum tutup)
```
GET /api/shifts/:id/summary
```
Response:
```json
{
  "shift": { "id": "...", "status": "OPEN", ... },
  "summary": {
    "totalOrders": 15,
    "totalSales": 850000,
    "paymentBreakdown": {
      "CASH": 400000,
      "QRIS": 350000,
      "CARD": 100000
    },
    "cashSales": 400000,
    "cashIn": 0,
    "cashOut": 50000,
    "cashMovements": [
      { "type": "CASH_OUT", "amount": 50000, "note": "Beli plastik kresek" }
    ]
  }
}
```

### Tutup Shift
```
POST /api/shifts/:id/close
{
  "closingCash": 850000
}
```
Response:
```json
{
  "shift": { "id": "...", "status": "CLOSED", "closingCash": 850000 },
  "summary": {
    "totalOrders": 15,
    "totalSales": 850000,
    "cashSales": 400000,
    "cashIn": 0,
    "cashOut": 50000,
    "expectedCash": 850000,
    "actualCash": 850000,
    "cashDifference": 0
  }
}
```

`cashDifference = actualCash - expectedCash`
- Positif (+) → lebih
- Negatif (-) → kurang

### Daftar Shift (Manager+)
```
GET /api/shifts?branch_id=&date=2024-01-15&status=CLOSED
```

---

## Kalkulasi Kas

```
Expected Cash = openingCash + cashIn - cashOut + cashSales(penjualan tunai)
Cash Difference = closingCash - expectedCash
```

Contoh:
| Item | Amount |
|------|--------|
| Modal awal | 500.000 |
| Penjualan cash | 400.000 |
| Cash out (plastik) | -50.000 |
| **Expected total** | **850.000** |
| Kasir setor | 850.000 |
| **Selisih** | **0** |

---

## Flutter Integration Flow

```dart
// 1. Cek ada shift aktif tidak
final shift = await api.get('/shifts/active?branch_id=$branchId');

if (shift == null) {
  // Tampilkan dialog buka shift
  final result = await showOpenShiftDialog();
  await api.post('/shifts/open', { branchId, openingCash: result.cash });
}

// 2. Saat buat order, sertakan shiftId
await api.post('/orders', {
  ...orderData,
  shiftId: activeShift.id,
});

// 3. Saat tutup toko
final summary = await api.get('/shifts/${shift.id}/summary');
// Tampilkan summary, minta input kas aktual
await api.post('/shifts/${shift.id}/close', { closingCash: inputCash });
```

---

## Setup Migration

Setelah pull update ini, jalankan:

```bash
npm run db:migrate       # jalankan migration CashMovement
npm run db:seed:shift    # tambah data shift contoh
```
