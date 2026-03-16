import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui'
import { PERMISSIONS } from '@/lib/permissions'
import { formatDateTime, formatNumber, formatRupiah, today } from '@/lib/utils'

export default function ReportsPage() {
  const { user, hasPermission } = useAuth()
  const canExport = hasPermission(PERMISSIONS.FINANCE_EXPORT_PDF)
  const defaultBranchId = user?.role === 'SUPER_ADMIN' ? '' : (user?.branch?.id || '')

  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [isExporting, setIsExporting] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
      ...(branchId && { branch_id: branchId }),
    })
    return params.toString()
  }, [dateFrom, dateTo, branchId])

  const { data: branches } = useQuery({
    queryKey: ['report-branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: salesBreakdown, isLoading: loadingBreakdown } = useQuery({
    queryKey: ['report-sales-breakdown', queryString],
    queryFn: () => api.get(`/reports/sales_breakdown?${queryString}`),
  })

  const { data: grossProfit, isLoading: loadingGrossProfit } = useQuery({
    queryKey: ['report-gross-profit', queryString],
    queryFn: () => api.get(`/reports/gross_profit?${queryString}`),
  })

  const { data: taxService, isLoading: loadingTaxService } = useQuery({
    queryKey: ['report-tax-service', queryString],
    queryFn: () => api.get(`/reports/tax_service?${queryString}`),
  })

  const { data: voidDiscount, isLoading: loadingVoidDiscount } = useQuery({
    queryKey: ['report-void-discount', queryString],
    queryFn: () => api.get(`/reports/void_discount?${queryString}`),
  })

  const { data: shiftRecap, isLoading: loadingShiftRecap } = useQuery({
    queryKey: ['report-shift-recap', queryString],
    queryFn: () => api.get(`/reports/shift_recap?${queryString}`),
  })

  const handleExport = async () => {
    if (!canExport) return
    setIsExporting(true)
    try {
      await api.download(
        `/reports/export_pdf?report=finance_overview&${queryString}`,
        { filename: `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.pdf` }
      )
    } catch (err) {
      alert(err.message || 'Gagal export laporan')
    } finally {
      setIsExporting(false)
    }
  }

  const summary = salesBreakdown?.summary || {}
  const byCashier = salesBreakdown?.byCashier || []
  const byCategory = salesBreakdown?.byCategory || []
  const voidRows = voidDiscount?.rows || []
  const shiftRows = shiftRecap?.rows || []

  return (
    <div>
      <PageHeader
        title="Laporan Keuangan"
        subtitle="Penjualan, laba kotor, pajak, void, diskon, dan rekap shift"
        action={(
          <Button
            variant="secondary"
            loading={isExporting}
            disabled={!canExport}
            onClick={handleExport}
          >
            {isExporting ? 'Export...' : 'Export PDF'}
          </Button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Semua Cabang</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        <div className="h-10 rounded-lg border border-border bg-secondary px-3 flex items-center text-xs text-muted-foreground">
          Filter tanggal dan cabang aktif
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Penjualan</p>
          <p className="text-lg font-semibold mt-1">{formatRupiah(summary.totalRevenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Transaksi</p>
          <p className="text-lg font-semibold mt-1">{formatNumber(summary.totalOrders)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Diskon</p>
          <p className="text-lg font-semibold mt-1">{formatRupiah(summary.totalDiscount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Laba Kotor</p>
          {loadingGrossProfit ? (
            <p className="text-sm text-muted-foreground mt-2">Memuat...</p>
          ) : (
            <p className="text-lg font-semibold mt-1">{formatRupiah(grossProfit?.grossProfit || 0)}</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Breakdown Penjualan per Kasir</p>
          {loadingBreakdown ? <Spinner /> : byCashier.length === 0 ? (
            <Empty message="Belum ada data kasir" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Kasir</Th>
                  <Th className="text-right">Order</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Diskon</Th>
                </tr>
              </thead>
              <tbody>
                {byCashier.map((item) => (
                  <tr key={item.cashier?.id || item.cashier?.name} className="border-b border-border/50 last:border-0">
                    <Td>{item.cashier?.name || '-'}</Td>
                    <Td className="text-right">{formatNumber(item.totalOrders)}</Td>
                    <Td className="text-right">{formatRupiah(item.totalRevenue)}</Td>
                    <Td className="text-right">{formatRupiah(item.totalDiscount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Breakdown per Kategori</p>
          {loadingBreakdown ? <Spinner /> : byCategory.length === 0 ? (
            <Empty message="Belum ada data kategori" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Kategori</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((item) => (
                  <tr key={item.category?.id || item.category?.name} className="border-b border-border/50 last:border-0">
                    <Td>{item.category?.name || '-'}</Td>
                    <Td className="text-right">{formatNumber(item.totalQty)}</Td>
                    <Td className="text-right">{formatRupiah(item.totalRevenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Laba Kotor (Revenue - HPP)</p>
          {loadingGrossProfit ? <Spinner /> : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span>{formatRupiah(grossProfit?.revenue || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">HPP</span><span>{formatRupiah(grossProfit?.hpp || 0)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span>Laba Kotor</span>
                <span>{formatRupiah(grossProfit?.grossProfit || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Margin</span>
                <Badge variant="blue">{grossProfit?.grossMarginPct || 0}%</Badge>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Pajak & Service Charge</p>
          {loadingTaxService ? <Spinner /> : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Gross Sales</span><span>{formatRupiah(taxService?.grossSales || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Pajak</span><span>{formatRupiah(taxService?.totalTax || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Service Charge</span><span>{formatRupiah(taxService?.totalServiceCharge || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Order</span><span>{formatNumber(taxService?.totalOrders || 0)}</span></div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Void & Diskon</p>
          {loadingVoidDiscount ? <Spinner /> : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Diskon di order paid</p>
                  <p className="font-semibold">{formatRupiah(voidDiscount?.totalDiscountOnPaidOrders || 0)}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Order void/cancelled</p>
                  <p className="font-semibold">{formatNumber(voidDiscount?.totalVoidOrCancelledOrders || 0)}</p>
                </div>
              </div>

              {voidRows.length === 0 ? (
                <Empty message="Tidak ada order void/cancelled" />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {voidRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium">{row.id}</span>
                        <Badge variant={row.status === 'VOID' ? 'rose' : 'muted'}>{row.status}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-1">{row.cancel_reason || 'Tanpa alasan'}</p>
                      <p className="text-muted-foreground mt-1">
                        {formatDateTime(row.created_at)} | {formatRupiah(row.total_amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Rekap Shift Kasir</p>
          {loadingShiftRecap ? <Spinner /> : shiftRows.length === 0 ? (
            <Empty message="Belum ada data shift" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Kasir</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Opening</Th>
                  <Th className="text-right">Closing</Th>
                  <Th className="text-right">Order</Th>
                </tr>
              </thead>
              <tbody>
                {shiftRows.map((shift) => (
                  <tr key={shift.id} className="border-b border-border/50 last:border-0">
                    <Td>{shift.user?.name || '-'}</Td>
                    <Td>
                      <Badge variant={shift.status === 'OPEN' ? 'green' : 'muted'}>
                        {shift.status}
                      </Badge>
                    </Td>
                    <Td className="text-right">{formatRupiah(shift.opening_cash || 0)}</Td>
                    <Td className="text-right">{shift.closing_cash == null ? '-' : formatRupiah(shift.closing_cash)}</Td>
                    <Td className="text-right">{formatNumber(shift.order_count || 0)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  )
}
