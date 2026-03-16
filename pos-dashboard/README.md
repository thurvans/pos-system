# POS Dashboard

React + Vite dashboard untuk POS single-bisnis.

## Setup

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

Pastikan backend berjalan di `http://localhost:3000`.

Jika dashboard dijalankan terpisah dari backend, set env:

```bash
VITE_API_BASE_URL=https://your-domain.com/api
```

## Halaman

- `/login`
- `/` dashboard
- `/orders`
- `/reports`
- `/shifts`
- `/products`
- `/inventory`
- `/downloads`
- `/branches`
- `/users`

## Build Production

```bash
npm run build
npm run preview
```
