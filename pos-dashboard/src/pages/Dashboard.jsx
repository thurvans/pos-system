import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { ShoppingBag, TrendingUp, CreditCard, Package, Calendar, RefreshCw } from 'lucide-react'
import { reportApi, branchApi } from '@/api'
import { formatRupiah, toISODate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatCard, PageHeader, Skeleton } from '@/components/ui/shared'
import { Badge } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

const METHOD_LABEL = { CASH: 'Tunai', QRIS: 'QRIS', VIRTUAL_ACCOUNT: 'Virtual Account', EWALLET: 'E-Wallet' }
const METHOD_COLOR = { CASH: '#f59e0b', QRIS: '#3b82f6', VIRTUAL_ACCOUNT: '#8b5cf6', EWALLET: '#10b981' }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background border rounded-xl shadow-lg p-3 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatRupiah(p.value)}</p>
      ))}
    </div>
  )
}

// Generate last 7 days for demo
function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return toISODate(d)
  })
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(toISODate())
  const [selectedBranch, setSelectedBranch] = useState('')

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['daily-sales', selectedDate, selectedBranch],
    queryFn: () => reportApi.dailySales({ branch_id: selectedBranch || undefined, date: selectedDate }),
    refetchInterval: 60000,
  })

  // Mock weekly data for chart (replace with real API)
  const weeklyData = getLast7Days().map((date, i) => ({
    date: new Date(date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
    revenue: Math.floor(Math.random() * 3000000) + 500000,
    orders: Math.floor(Math.random() * 50) + 10,
  }))

  const paymentData = report?.paymentBreakdown?.map(p => ({
    name: METHOD_LABEL[p.method] || p.method,
    value: Number(p.amount),
    method: p.method,
  })) || []

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan penjualan hari ini"
        action={
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
            >
              <option value="">Semua Cabang</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Total Transaksi" value={report?.summary?.totalOrders || 0} icon={ShoppingBag} color="amber" sub="Order hari ini" />
            <StatCard title="Pendapatan" value={formatRupiah(report?.summary?.totalRevenue || 0)} icon={TrendingUp} color="green" sub="Setelah diskon" />
            <StatCard title="Total Diskon" value={formatRupiah(report?.summary?.totalDiscount || 0)} icon={CreditCard} color="blue" sub="Diskon diberikan" />
            <StatCard title="Metode Bayar" value={paymentData.length} icon={Package} color="purple" sub="Tipe pembayaran aktif" />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Revenue Chart */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Tren Pendapatan 7 Hari</CardTitle>
            <CardDescription>Total penjualan per hari</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${(v/1000000).toFixed(1)}jt`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Pendapatan" stroke="#f59e0b" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Metode Pembayaran</CardTitle>
            <CardDescription>Breakdown hari ini</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : paymentData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada transaksi</p>
            ) : (
              <div className="space-y-3">
                {paymentData.map(p => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: METHOD_COLOR[p.method] }} />
                      <span className="text-sm">{p.name}</span>
                    </div>
                    <span className="text-sm font-medium tabular">{formatRupiah(p.value)}</span>
                  </div>
                ))}
                <div className="h-px bg-border my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-bold tabular text-primary">
                    {formatRupiah(paymentData.reduce((s, p) => s + p.value, 0))}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris Hari Ini</CardTitle>
          <CardDescription>Top 10 berdasarkan kuantitas terjual</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : !report?.topItems?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Belum ada data produk</p>
          ) : (
            <div className="space-y-2">
              {report.topItems.map((item, i) => {
                const maxQty = report.topItems[0]?.totalQty || 1
                const pct = Math.round((item.totalQty / maxQty) * 100)
                return (
                  <div key={item.product?.id || i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 tabular">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm truncate">{item.product?.name || '-'}</span>
                        <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                          <Badge variant="secondary">{item.totalQty} pcs</Badge>
                          <span className="text-sm font-medium tabular text-primary">{formatRupiah(item.totalRevenue)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
