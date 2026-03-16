import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Calendar, Eye, XCircle, ShoppingBag } from 'lucide-react'
import { orderApi, branchApi } from '@/api'
import { formatRupiah, formatDateTime, toISODate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/shared'
import { toast } from '@/components/ui/toast'

const STATUS_VARIANT = {
  DRAFT: 'secondary', PENDING_PAYMENT: 'warning', PAID: 'success',
  FULFILLED: 'success', CANCELLED: 'secondary', VOID: 'destructive',
}
const STATUS_LABEL = {
  DRAFT: 'Draft', PENDING_PAYMENT: 'Menunggu Bayar', PAID: 'Lunas',
  FULFILLED: 'Lunas', CANCELLED: 'Dibatalkan', VOID: 'Void',
}
const METHOD_LABEL = { CASH: 'Tunai', QRIS: 'QRIS', VIRTUAL_ACCOUNT: 'Virtual Account', EWALLET: 'E-Wallet' }

function OrderDetailDialog({ orderId, onClose }) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => orderApi.get(orderId),
    enabled: !!orderId,
  })
  const qc = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: () => orderApi.cancel(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order', orderId] })
      toast({ title: 'Order dibatalkan', variant: 'success' })
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Detail Order</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} />)}</div>
      ) : order ? (
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">No. Struk</span>
            <span className="font-mono font-medium">{order.receiptNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Kasir</span>
            <span>{order.cashier?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cabang</span>
            <span>{order.branch?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Waktu</span>
            <span>{formatDateTime(order.createdAt)}</span>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2">
            {order.items?.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.product?.name} <span className="text-muted-foreground">×{item.quantity}</span></span>
                <span className="tabular font-medium">{formatRupiah(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-border" />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span className="tabular">{formatRupiah(order.subtotal)}</span>
            </div>
            {Number(order.discountAmount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Diskon</span><span className="tabular">-{formatRupiah(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base">
              <span>Total</span><span className="tabular text-primary">{formatRupiah(order.totalAmount)}</span>
            </div>
          </div>

          {order.payments?.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Pembayaran</p>
                {order.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{METHOD_LABEL[p.method] || p.method}</span>
                    <Badge variant={p.status === 'SUCCESS' ? 'success' : 'warning'}>{p.status}</Badge>
                  </div>
                ))}
              </div>
            </>
          )}

          {['DRAFT', 'PENDING_PAYMENT'].includes(order.status) && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="w-3.5 h-3.5" />
              {cancelMutation.isPending ? 'Membatalkan...' : 'Batalkan Order'}
            </Button>
          )}
        </div>
      ) : null}
    </DialogContent>
  )
}

export default function OrdersPage() {
  const [filters, setFilters] = useState({ date: toISODate(), status: '', branch_id: '' })
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const { data, isLoading } = useQuery({
    queryKey: ['orders', filters, page],
    queryFn: () => orderApi.list({ ...filters, page, limit: 20, status: filters.status || undefined, branch_id: filters.branch_id || undefined }),
    staleTime: 10000,
  })

  const orders = data?.data || []
  const meta = data?.meta || {}

  const setFilter = (key, val) => { setFilters(p => ({ ...p, [key]: val })); setPage(1) }

  return (
    <div>
      <PageHeader title="Transaksi" description="Riwayat semua order" />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="date" className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm" value={filters.date} onChange={e => setFilter('date', e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">Semua Status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.branch_id} onChange={e => setFilter('branch_id', e.target.value)}>
          <option value="">Semua Cabang</option>
          {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {meta.total != null && <span className="self-center text-xs text-muted-foreground ml-auto">{meta.total} order ditemukan</span>}
      </div>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : orders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Tidak ada transaksi" description="Coba ubah filter tanggal atau status" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Struk</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Kasir</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell><span className="font-mono text-xs">{o.receiptNumber}</span></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</TableCell>
                      <TableCell className="text-sm">{o.cashier?.name}</TableCell>
                      <TableCell>
                        {o.payments?.[0]
                          ? <Badge variant="info">{METHOD_LABEL[o.payments[0].method]}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell><span className="tabular font-medium">{formatRupiah(o.totalAmount)}</span></TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedId(o.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {meta.totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 text-sm">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
                  <span className="text-muted-foreground">Halaman {page} dari {meta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        {selectedId && <OrderDetailDialog orderId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>
    </div>
  )
}
