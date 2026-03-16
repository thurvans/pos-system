import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 → redirect ke login
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pos_token')
      localStorage.removeItem('pos_user')
      window.location.href = '/login'
    }
    return Promise.reject(err.response?.data || err)
  }
)

// ─── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (body) => api.post('/auth/login', body),
  me: () => api.get('/auth/me'),
}

// ─── Dashboard ───────────────────────────────────────────────
export const reportApi = {
  dailySales: (params) => api.get('/reports/daily_sales', { params }),
  shiftSummary: (shiftId) => api.get(`/reports/shift_summary?shift_id=${shiftId}`),
}

// ─── Branches ────────────────────────────────────────────────
export const branchApi = {
  list: () => api.get('/branches'),
  create: (body) => api.post('/branches', body),
  update: (id, body) => api.put(`/branches/${id}`, body),
}

// ─── Products ────────────────────────────────────────────────
export const productApi = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  create: (body) => api.post('/products', body),
  update: (id, body) => api.put(`/products/${id}`, body),
  setPrice: (id, body) => api.put(`/products/${id}/price`, body),
}

// ─── Orders ──────────────────────────────────────────────────
export const orderApi = {
  list: (params) => api.get('/orders', { params }),
  get: (id) => api.get(`/orders/${id}`),
  cancel: (id) => api.post(`/orders/${id}/cancel`),
}

// ─── Inventory ───────────────────────────────────────────────
// ─── Shifts ──────────────────────────────────────────────────
export const shiftApi = {
  list: (params) => api.get('/shifts', { params }),
  getActive: (params) => api.get('/shifts/active', { params }),
  open: (body) => api.post('/shifts/open', body),
  close: (id, body) => api.post(`/shifts/${id}/close`, body),
  summary: (id) => api.get(`/shifts/${id}/summary`),
  cashInOut: (id, body) => api.post(`/shifts/${id}/cash`, body),
}

export default api

// ─── Users ────────────────────────────────────────────────────
export const userApi = {
  list: (params) => api.get('/auth/users', { params }),
  create: (body) => api.post('/auth/users', body),
  update: (id, body) => api.put(`/auth/users/${id}`, body),
}
