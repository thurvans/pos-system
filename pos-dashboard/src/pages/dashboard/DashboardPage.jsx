import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building,
  Clock3,
  Hash,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Card, Empty, PageHeader, Spinner, StatCard } from '@/components/ui'
import { formatDate, formatNumber, formatRupiah, today } from '@/lib/utils'

const ACTIVE_ORDER_STATUSES = ['DRAFT', 'PENDING_PAYMENT', 'PAID']

const getQueueNumber = (order) => (
  order?.queue_number
  || order?.queueNumber
  || order?.table_number
  || order?.tableNumber
  || null
)

const toDateInput = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const parseOrder = (order) => ({
  id: order.id,
  totalAmount: Number(order.total_amount ?? order.totalAmount ?? 0),
})

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const revenue = payload.find((item) => item.dataKey === 'revenue')?.value || 0
  const orders = payload.find((item) => item.dataKey === 'orders')?.value || 0
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg min-w-[160px]">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-mono font-medium text-emerald-400">{formatRupiah(revenue)}</p>
      <p className="text-muted-foreground">{formatNumber(orders)} transaksi</p>
    </div>
  )
}

function ProductList({ title, data, loading, emptyText, trend = 'up' }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        {trend === 'up'
          ? <ArrowUpRight size={14} className="text-emerald-400" />
          : <ArrowDownRight size={14} className="text-amber-400" />}
      </div>
      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty message={emptyText} />
      ) : (
        <div className="space-y-2.5">
          {data.map((item, index) => (
            <div key={item.product?.id || `${item.product?.name}-${index}`} className="px-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product?.name || '-'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.product?.sku || '-'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatNumber(item.totalQty)}x</p>
                  <p className="text-xs text-muted-foreground money">{formatRupiah(item.totalRevenue)}</p>
                </div>
              </div>
              {index < data.length - 1 && <div className="h-px bg-border/50 mt-2.5" />}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const todayStr = today()
  const now = new Date()
  const monthStart = toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const defaultBranchId = user?.role === 'SUPER_ADMIN' ? '' : (user?.branch?.id || '')
  const [branchId, setBranchId] = useState(defaultBranchId)

  useEffect(() => {
    setBranchId(defaultBranchId)
  }, [defaultBranchId])

  const effectiveBranchId = user?.role === 'SUPER_ADMIN' ? branchId : defaultBranchId
  const branchQuery = effectiveBranchId ? `&branch_id=${effectiveBranchId}` : ''

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: daily, isLoading: dailyLoading } = useQuery({
    queryKey: ['dashboard-daily', todayStr, effectiveBranchId],
    queryFn: () => api.get(`/reports/daily_sales?date=${todayStr}${branchQuery}`),
    refetchInterval: 60_000,
  })

  const { data: weekly, isLoading: weeklyLoading } = useQuery({
    queryKey: ['dashboard-weekly', effectiveBranchId],
    queryFn: () => api.get(`/reports/weekly_sales?days=7${branchQuery}`),
    refetchInterval: 5 * 60_000,
  })

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ['dashboard-monthly', year, month, effectiveBranchId],
    queryFn: () => api.get(`/reports/monthly?year=${year}&month=${month}${branchQuery}`),
    refetchInterval: 5 * 60_000,
  })

  const { data: trend30, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard-trend-30', effectiveBranchId],
    queryFn: () => api.get(`/reports/weekly_sales?days=30${branchQuery}`),
    refetchInterval: 5 * 60_000,
  })

  const { data: topProductData, isLoading: topProductsLoading } = useQuery({
    queryKey: ['dashboard-best-sellers', monthStart, todayStr, effectiveBranchId],
    queryFn: () => api.get(`/orders/best-sellers?date_from=${monthStart}&date_to=${todayStr}&limit=100${branchQuery}`),
    refetchInterval: 5 * 60_000,
  })

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['dashboard-products-all', effectiveBranchId],
    queryFn: () => api.get(`/products?limit=500${effectiveBranchId ? `&branch_id=${effectiveBranchId}` : ''}`),
    refetchInterval: 10 * 60_000,
  })

  const { data: activeOrdersData, isLoading: activeOrdersLoading } = useQuery({
    queryKey: ['dashboard-active-orders', effectiveBranchId],
    queryFn: async () => {
      const responses = await Promise.all(
        ACTIVE_ORDER_STATUSES.map((status) => (
          api.get(`/orders?status=${status}&limit=100${branchQuery}`)
        )),
      )
      const orders = responses
        .flatMap((response) => response?.data || [])
        .map(parseOrder)

      return {
        orders,
      }
    },
    refetchInterval: 15_000,
  })

  const { data: queueSummaryData } = useQuery({
    queryKey: ['dashboard-queue-summary', todayStr, effectiveBranchId],
    queryFn: async () => {
      const queueRows = []
      let page = 1
      let totalPages = 1
      do {
        const params = new URLSearchParams({
          page: String(page),
          limit: '100',
          date_from: todayStr,
          date_to: todayStr,
        })
        if (effectiveBranchId) params.set('branch_id', effectiveBranchId)
        const response = await api.get(`/orders?${params.toString()}`)
        const list = response?.data || []
        list.forEach((order) => {
          const queueNumber = getQueueNumber(order)
          if (queueNumber) {
            queueRows.push({
              queueNumber: String(queueNumber).trim(),
              createdAt: order.created_at || order.createdAt || null,
            })
          }
        })
        totalPages = Number(response?.meta?.totalPages || 1)
        page += 1
      } while (page <= totalPages && page <= 20)
      queueRows.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      return {
        issued: queueRows.length,
        latestQueueNumber: queueRows[0]?.queueNumber || null,
      }
    },
    enabled: true,
    refetchInterval: 10 * 60_000,
  })

  const trendData = useMemo(() => (
    (trend30?.data || []).map((item) => ({
      label: new Date(`${item.date}T00:00:00`).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
      }),
      revenue: Number(item.revenue || 0),
      orders: Number(item.orders || 0),
    }))
  ), [trend30?.data])

  const bestSellers = useMemo(() => topProductData?.data || [], [topProductData?.data])
  const topProducts = useMemo(() => bestSellers.slice(0, 5), [bestSellers])

  const slowMovingProducts = useMemo(() => {
    const products = productsData?.data || []
    const soldMap = new Map(
      bestSellers
        .filter((item) => item?.product?.id)
        .map((item) => [item.product.id, item]),
    )

    return products
      .filter((product) => (product.is_active ?? product.isActive ?? true))
      .map((product) => {
        const sold = soldMap.get(product.id)
        return {
          product,
          totalQty: Number(sold?.totalQty || 0),
          totalRevenue: Number(sold?.totalRevenue || 0),
        }
      })
      .sort((a, b) => (
        a.totalQty - b.totalQty
        || a.totalRevenue - b.totalRevenue
        || String(a.product?.name || '').localeCompare(String(b.product?.name || ''))
      ))
      .slice(0, 5)
  }, [bestSellers, productsData?.data])

  const activeOrders = activeOrdersData?.orders || []
  const queueSummary = useMemo(() => ({
    issued: Number(queueSummaryData?.issued || 0),
    latestQueueNumber: queueSummaryData?.latestQueueNumber || null,
  }), [queueSummaryData])

  const dailySummary = daily?.summary || {}
  const weeklySummary = weekly?.summary || {}
  const monthlySummary = monthly?.summary || {}
  const atvMonthly = monthlySummary.totalOrders
    ? Number(monthlySummary.totalRevenue || 0) / Number(monthlySummary.totalOrders)
    : 0

  const scopeLabel = effectiveBranchId
    ? (branches || []).find((branch) => branch.id === effectiveBranchId)?.name || 'Cabang dipilih'
    : 'Semua cabang'

  const activeOrdersRevenue = activeOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Update ${formatDate(new Date(), 'datetime')}`}
        action={(
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground sm:w-auto">
              <Building size={13} />
              <span className="truncate">{scopeLabel}</span>
            </div>
            {user?.role === 'SUPER_ADMIN' && (
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
              >
                <option value="">Semua Cabang</option>
                {(branches || []).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            )}
            <Badge variant="blue" className="self-start sm:self-auto">Realtime 15s</Badge>
          </div>
        )}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Penjualan Harian"
          value={formatRupiah(dailySummary.totalRevenue)}
          sub={`${formatNumber(dailySummary.totalOrders)} transaksi`}
          icon={Wallet}
          color="green"
          loading={dailyLoading}
        />
        <StatCard
          label="Penjualan Mingguan"
          value={formatRupiah(weeklySummary.totalRevenue)}
          sub={`${formatNumber(weeklySummary.totalOrders)} transaksi / 7 hari`}
          icon={TrendingUp}
          color="blue"
          loading={weeklyLoading}
        />
        <StatCard
          label="Penjualan Bulanan"
          value={formatRupiah(monthlySummary.totalRevenue)}
          sub={`${formatNumber(monthlySummary.totalOrders)} transaksi bulan ini`}
          icon={ShoppingCart}
          color="amber"
          loading={monthlyLoading}
        />
        <StatCard
          label="Average Transaction Value"
          value={formatRupiah(atvMonthly)}
          sub="Rata-rata nilai transaksi bulan ini"
          icon={Activity}
          color="rose"
          loading={monthlyLoading}
        />
        <StatCard
          label="Antrian Hari Ini"
          value={queueSummary.latestQueueNumber || '-'}
          sub={queueSummary.issued > 0
            ? `${formatNumber(queueSummary.issued)} nomor keluar hari ini`
            : 'Belum ada nomor antrian'}
          icon={Hash}
          color="blue"
          loading={activeOrdersLoading}
        />
        <StatCard
          label="Pesanan Aktif"
          value={formatNumber(activeOrders.length)}
          sub={formatRupiah(activeOrdersRevenue)}
          icon={Clock3}
          color="green"
          loading={activeOrdersLoading}
        />
      </div>

      <div className="mb-4">
        <Card className="p-5">
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tren Pendapatan dan Transaksi (30 Hari)
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total {formatRupiah(trend30?.summary?.totalRevenue)} dari {formatNumber(trend30?.summary?.totalOrders)} transaksi
            </p>
          </div>
          {trendLoading ? (
            <div className="h-64 flex items-center justify-center"><Spinner /></div>
          ) : trendData.length === 0 ? (
            <Empty message="Belum ada transaksi untuk periode ini" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E3147" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" hide />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#34d399"
                    fill="#34d39922"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ProductList
          title="Top Produk Terlaris"
          data={topProducts}
          loading={topProductsLoading}
          emptyText="Belum ada penjualan produk"
          trend="up"
        />
        <ProductList
          title="Produk Slow-moving"
          data={slowMovingProducts}
          loading={topProductsLoading || productsLoading}
          emptyText="Belum ada data produk"
          trend="down"
        />
      </div>
    </div>
  )
}
