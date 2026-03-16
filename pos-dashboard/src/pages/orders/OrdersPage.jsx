import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/lib/permissions'
import {
  Card,
  Badge,
  PageHeader,
  Spinner,
  Empty,
  Table,
  Th,
  Td,
  Modal,
  Button,
} from '@/components/ui'
import { formatRupiah, formatDateTime, today } from '@/lib/utils'
import { Eye, XCircle, ShoppingBag, RefreshCw, Download } from 'lucide-react'

const STATUS_BADGE = {
  DRAFT: ['muted', 'Draft'],
  PENDING_PAYMENT: ['amber', 'Menunggu Bayar'],
  PAID: ['green', 'Lunas'],
  FULFILLED: ['green', 'Lunas'],
  CANCELLED: ['muted', 'Dibatalkan'],
  VOID: ['rose', 'Void'],
}

const PAYMENT_STATUS_BADGE = {
  INITIATED: ['muted', 'Initiated'],
  PENDING: ['amber', 'Pending'],
  SUCCESS: ['green', 'Berhasil'],
  FAILED: ['rose', 'Gagal'],
  EXPIRED: ['muted', 'Expired'],
  REFUNDED: ['blue', 'Refund'],
}

const ORDER_TYPE_LABEL = {
  DINE_IN: 'Dine In',
  TAKE_AWAY: 'Take Away',
  DELIVERY: 'Delivery',
}

const ORDER_TYPE_BADGE = {
  DINE_IN: 'blue',
  TAKE_AWAY: 'amber',
  DELIVERY: 'rose',
}

const PAYMENT_METHOD_LABEL = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  VIRTUAL_ACCOUNT: 'Virtual Account',
  CARD: 'Debit',
  EWALLET: 'eWallet',
}

const CASHLESS_METHODS = new Set(['QRIS', 'VIRTUAL_ACCOUNT', 'CARD', 'EWALLET'])

const PAYMENT_PRIORITY = {
  SUCCESS: 0,
  REFUNDED: 1,
  PENDING: 2,
  INITIATED: 3,
  FAILED: 4,
  EXPIRED: 5,
}

const getPaymentTimestamp = (payment) => {
  const value = payment?.paid_at || payment?.paidAt || payment?.created_at || payment?.createdAt
  const parsed = value ? new Date(value).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

const sortPayments = (payments = []) => [...payments].sort((left, right) => {
  const priorityDiff = (PAYMENT_PRIORITY[left?.status] ?? 99) - (PAYMENT_PRIORITY[right?.status] ?? 99)
  if (priorityDiff !== 0) return priorityDiff
  return getPaymentTimestamp(right) - getPaymentTimestamp(left)
})

const DISPLAYABLE_PAYMENT_STATUSES = new Set(['INITIATED', 'PENDING', 'SUCCESS', 'REFUNDED'])
const roundRupiah = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric)
}

const getPrimaryPayment = (order) => sortPayments(order.payments || [])[0] || null
const getDisplayOrderTotal = (order) => {
  const payment = getPrimaryPayment(order)
  if (payment && DISPLAYABLE_PAYMENT_STATUSES.has(payment.status)) {
    return roundRupiah(payment.amount)
  }

  return roundRupiah(order?.total_amount ?? order?.totalAmount ?? 0)
}

const getQueueNumber = (order) => (
  order?.queue_number
  || order?.queueNumber
  || order?.table_number
  || order?.tableNumber
  || ''
)

const filterOrdersByPaymentType = (orders, paymentType) => {
  if (!paymentType) return orders
  return orders.filter((order) => {
    const method = getPrimaryPayment(order)?.method
    if (!method) return false
    if (paymentType === 'cash') return method === 'CASH'
    if (paymentType === 'cashless') return CASHLESS_METHODS.has(method)
    return true
  })
}

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

function OrderDetailModal({ orderId, open, onClose, canViewCancellationLogs }) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.get(`/orders/${orderId}`),
    enabled: open && !!orderId,
  })

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={`Detail Order ${order?.receipt_number || order?.receiptNumber || ''}`} width="max-w-2xl">
      {isLoading ? (
        <Spinner />
      ) : !order ? (
        <Empty message="Order tidak ditemukan" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="bg-secondary rounded-lg px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Badge variant={STATUS_BADGE[order.status]?.[0] || 'muted'}>
                {STATUS_BADGE[order.status]?.[1] || order.status}
              </Badge>
            </div>
            <div className="bg-secondary rounded-lg px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-1">Tipe Order</p>
              <Badge variant={ORDER_TYPE_BADGE[order.order_type || order.orderType] || 'muted'}>
                {ORDER_TYPE_LABEL[order.order_type || order.orderType] || order.order_type || order.orderType || '-'}
              </Badge>
              {getQueueNumber(order) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Antrian {getQueueNumber(order)}
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Item</p>
            <div className="bg-secondary rounded-lg divide-y divide-border/50">
              {(order.items || []).map((item, idx) => (
                <div key={item.id || idx} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium">{item.product?.name || `Produk ${item.product_id || item.productId}`}</span>
                    <span className="text-muted-foreground ml-2 text-xs">x{item.quantity}</span>
                  </div>
                  <span className="font-mono text-xs">{formatRupiah(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-sm">
            {Number(order.discount_amount || order.discountAmount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Diskon</span>
                <span className="font-mono text-rose-400">
                  -{formatRupiah(order.discount_amount || order.discountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
              <span>Total</span>
              <span className="font-mono text-primary">{formatRupiah(getDisplayOrderTotal(order))}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Pembayaran</p>
            {!order.payments?.length ? (
              <div className="text-xs text-muted-foreground">Belum ada data pembayaran</div>
            ) : (
              <div className="bg-secondary rounded-lg divide-y divide-border/50">
                {sortPayments(order.payments).map((payment) => (
                  <div key={payment.id} className="px-3 py-2.5 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[payment.method] || payment.method}</span>
                      <span className="font-mono">{formatRupiah(payment.amount)}</span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <Badge variant={PAYMENT_STATUS_BADGE[payment.status]?.[0] || 'muted'}>
                        {PAYMENT_STATUS_BADGE[payment.status]?.[1] || payment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Riwayat Status</p>
            {!order.status_histories?.length ? (
              <div className="text-xs text-muted-foreground">Belum ada riwayat status</div>
            ) : (
              <div className="bg-secondary rounded-lg divide-y divide-border/50">
                {order.status_histories.map((history) => (
                  <div key={history.id} className="px-3 py-2.5">
                    <p className="text-xs">
                      {(history.from_status || 'N/A')}
                      {' -> '}
                      <span className="font-medium">{history.to_status}</span>
                    </p>
                    {history.note && <p className="text-xs text-muted-foreground mt-0.5">{history.note}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {history.user?.name || 'System'} - {formatDateTime(history.changed_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canViewCancellationLogs && order.status === 'CANCELLED' && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Log Pembatalan</p>
              {!order.cancellation_logs?.length ? (
                <div className="text-xs text-muted-foreground">Belum ada log pembatalan</div>
              ) : (
                <div className="bg-secondary rounded-lg divide-y divide-border/50">
                  {order.cancellation_logs.map((log) => (
                    <div key={log.id} className="px-3 py-2.5">
                      <p className="text-xs text-foreground">{log.reason || '-'}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Status sebelumnya: {log.previous_status || '-'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {log.user?.name || 'System'} - {formatDateTime(log.cancelled_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-1">
            Dibuat: {formatDateTime(order.created_at || order.createdAt)}
          </div>

          <Button variant="secondary" className="w-full" onClick={onClose}>Tutup</Button>
        </div>
      )}
    </Modal>
  )
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const { user, hasPermission } = useAuth()

  const canViewHistory = hasPermission(PERMISSIONS.ORDER_HISTORY_VIEW)
  const canCancelOrder = hasPermission(PERMISSIONS.ORDER_CANCEL)
  const canExport = hasPermission(PERMISSIONS.FINANCE_EXPORT_PDF)
  const canViewCancellationLogs = ['MANAGER', 'SUPER_ADMIN'].includes(user?.role)
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('')
  const [orderType, setOrderType] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState(null)
  const [isExporting, setIsExporting] = useState(false)

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(branchId && { branch_id: branchId }),
    ...(status && { status }),
    ...(orderType && { order_type: orderType }),
    ...(tableNumber && { table_number: tableNumber }),
  }).toString()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.get(`/orders?${params}`),
    keepPreviousData: true,
    enabled: canViewHistory,
  })

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
    enabled: canViewHistory,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries(['orders'])
      setDetailId(null)
    },
  })

  const orders = data?.data || []
  const visibleOrders = filterOrdersByPaymentType(orders, paymentType)
  const meta = data?.meta || {}
  const totalPages = meta.totalPages || 1

  const handleSearch = () => {
    setPage(1)
    if (canViewHistory) refetch()
  }

  const buildParams = ({ currentPage, limit }) => new URLSearchParams({
    page: String(currentPage),
    limit: String(limit),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(branchId && { branch_id: branchId }),
    ...(status && { status }),
    ...(orderType && { order_type: orderType }),
    ...(tableNumber && { table_number: tableNumber }),
  }).toString()

  const exportToCsv = (rows) => {
      const header = [
      'No Struk',
      'Waktu',
      'Status Order',
      'Tipe Order',
      'No Antrian',
      'Metode Bayar',
      'Status Payment',
      'Total',
      'Order ID',
      'Payment ID',
    ]

    const lines = rows.map((order) => {
      const payment = getPrimaryPayment(order)
      return [
        order.receipt_number || order.receiptNumber || '',
        order.created_at || order.createdAt || '',
        order.status || '',
        order.order_type || order.orderType || '',
        getQueueNumber(order),
        payment ? (PAYMENT_METHOD_LABEL[payment.method] || payment.method) : '',
        payment?.status || '',
        getDisplayOrderTotal(order),
        order.id || '',
        payment?.id || '',
      ].map(csvEscape).join(',')
    })

    const content = `\uFEFF${[header.map(csvEscape).join(','), ...lines].join('\n')}`
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `transaksi-${stamp}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    if (!canExport) return
    setIsExporting(true)
    try {
      let currentPage = 1
      let maxPage = 1
      const allOrders = []

      do {
        const query = buildParams({ currentPage, limit: 100 })
        const response = await api.get(`/orders?${query}`)
        allOrders.push(...(response?.data || []))
        maxPage = Number(response?.meta?.totalPages || 1)
        currentPage += 1
      } while (currentPage <= maxPage)

      const filtered = filterOrdersByPaymentType(allOrders, paymentType)
      if (filtered.length === 0) {
        alert('Tidak ada transaksi untuk diexport.')
        return
      }

      exportToCsv(filtered)
    } catch (err) {
      alert(err.message || 'Gagal export transaksi')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle="Histori transaksi"
        action={canViewHistory ? (
          <button
            onClick={() => {
              if (canViewHistory) refetch()
            }}
            className="p-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        ) : null}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label className="text-xs text-muted-foreground">Dari:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label className="text-xs text-muted-foreground">Sampai:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
        >
          <option value="">Semua Cabang</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
        >
          <option value="">Semua Tipe</option>
          <option value="DINE_IN">Dine In</option>
          <option value="TAKE_AWAY">Take Away</option>
          <option value="DELIVERY">Delivery</option>
        </select>
        <input
          value={tableNumber}
          onChange={(e) => setTableNumber(e.target.value)}
          placeholder="No antrian (opsional)"
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto sm:min-w-[220px]"
        />
        <Button onClick={handleSearch} className="w-full px-5 !min-w-0 sm:w-auto">Cari</Button>
      </div>

      {!canViewHistory ? (
        <Card className="p-5">
          <Empty message="Role ini tidak punya akses histori transaksi." />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
            >
              <option value="">Semua Status</option>
              <option value="PAID">Lunas</option>
              <option value="PENDING_PAYMENT">Menunggu Bayar</option>
              <option value="CANCELLED">Dibatalkan</option>
              <option value="DRAFT">Draft</option>
            </select>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
            >
              <option value="">Semua Pembayaran</option>
              <option value="cash">Cash</option>
              <option value="cashless">Cashless</option>
            </select>
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={isExporting || !canExport}
              className="w-full px-4 !min-w-0 sm:w-auto"
              title={!canExport ? 'Tidak punya akses export laporan' : undefined}
            >
              <Download size={14} className="mr-1.5" />
              {isExporting ? 'Export...' : 'Export CSV'}
            </Button>
          </div>

          {meta.total != null && (
            <p className="text-xs text-muted-foreground mb-3">
              Menampilkan <span className="font-medium text-foreground">{visibleOrders.length}</span> dari{' '}
              <span className="font-medium text-foreground">{meta.total}</span> transaksi
            </p>
          )}

          <Card>
            {isLoading ? <Spinner /> : visibleOrders.length === 0 ? (
              <Empty message="Tidak ada transaksi untuk filter ini" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>No. Struk</Th>
                    <Th>Waktu</Th>
                    <Th>Tipe / Antrian</Th>
                    <Th>Status</Th>
                    <Th>Pembayaran</Th>
                    <Th className="text-right">Total</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const payment = getPrimaryPayment(order)
                    return (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                        <Td>
                          <div className="flex items-center gap-2">
                            <ShoppingBag size={14} className="text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs">{order.receipt_number || order.receiptNumber}</span>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-xs">{formatDateTime(order.created_at || order.createdAt)}</span>
                        </Td>
                        <Td>
                          <div className="flex flex-col">
                            <span className="text-xs">{ORDER_TYPE_LABEL[order.order_type || order.orderType] || order.order_type || order.orderType}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {getQueueNumber(order) ? `Antrian ${getQueueNumber(order)}` : '-'}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <Badge variant={STATUS_BADGE[order.status]?.[0] || 'muted'}>
                            {STATUS_BADGE[order.status]?.[1] || order.status}
                          </Badge>
                        </Td>
                        <Td>
                          {payment ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">
                                {PAYMENT_METHOD_LABEL[payment.method] || payment.method}
                              </span>
                              <Badge variant={PAYMENT_STATUS_BADGE[payment.status]?.[0] || 'muted'}>
                                {PAYMENT_STATUS_BADGE[payment.status]?.[1] || payment.status}
                              </Badge>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </Td>
                        <Td className="text-right">
                          <span className="font-mono text-sm font-medium">
                            {formatRupiah(getDisplayOrderTotal(order))}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => setDetailId(order.id)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                              title="Detail"
                            >
                              <Eye size={14} />
                            </button>
                            {canCancelOrder && ['DRAFT', 'PENDING_PAYMENT'].includes(order.status) && (
                              <button
                                onClick={() => {
                                  if (!confirm('Batalkan order ini?')) return
                                  const reason = prompt('Alasan pembatalan (opsional):', '') ?? null
                                  cancelMutation.mutate({ id: order.id, reason })
                                }}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Batalkan"
                              >
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}

            {totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Halaman {page} dari {totalPages}
                </p>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="secondary"
                    className="flex-1 !min-w-0 px-3 py-1.5 text-xs sm:flex-none"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 !min-w-0 px-3 py-1.5 text-xs sm:flex-none"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <OrderDetailModal
        orderId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        canViewCancellationLogs={canViewCancellationLogs}
      />
    </div>
  )
}
