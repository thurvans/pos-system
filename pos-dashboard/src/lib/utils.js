import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...inputs) => twMerge(clsx(inputs))
export const formatRupiah = (n) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
export const formatDate = (d, fmt = 'short') => {
  if (!d) return '-'
  const dt = new Date(d)
  if (fmt === 'datetime') return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const formatNumber = (n) => n == null ? '0' : new Intl.NumberFormat('id-ID').format(n)
export const today = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export const formatDateTime = (d) => {
  if (!d) return '-'
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const formatDateRange = (from, to, options = {}) => {
  const {
    includeTime = false,
    separator = ' - ',
  } = options

  const formatValue = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString(
      'id-ID',
      includeTime
        ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric' },
    )
  }

  if (!from && !to) return '-'
  if (!from) return formatValue(to)
  if (!to) return formatValue(from)

  return `${formatValue(from)}${separator}${formatValue(to)}`
}
