import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { BarChart3, TrendingUp, ShoppingBag, Percent } from 'lucide-react'
import { reportApi, branchApi } from '@/api'
import { formatRupiah, toISODate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/form'
import { PageHeader, StatCard, Skeleton, EmptyState } from '@/components/ui/shared'

const METHOD_LABEL = { CASH: 'Tunai', QRIS: 'QRIS', VIRTUAL_ACCOUNT: 'VA', EWALLET: 'E-Wallet' }
const COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background border rounded-xl shadow-lg p-3 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatRupiah(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// Last 30 days picker
function DateRangePicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Tanggal:</span>
      <input type="date" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

export default function ReportsPage() {
  const [date, setDate] = useState(toISODate())
  const [branch, setBranch] = useState('')

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', date, branch],
    queryFn: () => reportApi.dailySales({ date, branch_id: branch || undefined }),
    staleTime: 60000,
  })

  // Mock weekly trend (replace w/ real endpoint)
  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date)
    d.setDate(d.getDate() - (6 - i))
    return {
      day: d.toLocaleDateString('id-ID', { weekday: 'short' }),
      revenue: Math.floor(Math.random() * 2500000) + 300000,
      orders: Math.floor(Math.random() * 40) + 5,
    }
  })

  const pieData = (report?.paymentBreakdown || []).map(p => ({
    name: METHOD_LABEL[p.method] || p.method,
    value: Number(p.amount),
  }))

  const topItems = report?.topItems || []

  return (
    <div>
      <PageHeader
        title="Laporan"
        description="Analitik penjualan harian"
        action={
          <div className="flex items-center gap-2">
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={branch} onChange={e => setBranch(e.target.value)}>
              <option value="">Semua Cabang</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <DateRangePicker value={date} onChange={setDate} />
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Total Order" value={report?.summary?.totalOrders || 0} icon={ShoppingBag} color="amber" />
            <StatCard title="Pendapatan" value={formatRupiah(report?.summary?.totalRevenue || 0)} icon={TrendingUp} color="green" />
            <StatCard title="Total Diskon" value={formatRupiah(report?.summary?.totalDiscount || 0)} icon={Percent} color="blue" />
            <StatCard
              title="Avg. per Order"
              value={report?.summary?.totalOrders > 0
                ? formatRupiah(report.summary.totalRevenue / report.summary.totalOrders)
                : 'Rp 0'}
              icon={BarChart3}
              color="purple"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Weekly Revenue Bar */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Tren 7 Hari</CardTitle>
            <CardDescription>Pendapatan dan jumlah order per hari</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${(v/1000000).toFixed(1)}jt`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Pendapatan" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Metode Pembayaran</CardTitle>
            <CardDescription>Proporsi hari ini</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <EmptyState icon={BarChart3} title="Belum ada data" description="Tidak ada transaksi" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatRupiah(v)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris</CardTitle>
          <CardDescription>Berdasarkan kuantitas terjual hari ini</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : topItems.length === 0 ? (
            <EmptyState icon={BarChart3} title="Belum ada data produk" description="Tidak ada transaksi pada hari ini" />
          ) : (
            <div className="space-y-2">
              {topItems.map((item, i) => {
                const maxQty = topItems[0]?.totalQty || 1
                const pct = Math.round(((item.totalQty || 0) / maxQty) * 100)
                return (
                  <div key={item.product?.id || i} className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground w-5 text-right tabular">#{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">{item.product?.name || '—'}</span>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{item.totalQty} pcs</Badge>
                          <span className="text-sm font-semibold tabular text-primary w-28 text-right">{formatRupiah(item.totalRevenue)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
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
