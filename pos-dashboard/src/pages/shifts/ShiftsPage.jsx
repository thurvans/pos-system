import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, RefreshCw } from 'lucide-react'

import { api } from '@/api/client'
import { Badge, Card, Empty, PageHeader, Spinner, Table, Td, Th } from '@/components/ui'
import { formatDateRange, formatDateTime, formatRupiah, today } from '@/lib/utils'

const STATUS_BADGE = {
  OPEN: ['green', 'Buka'],
  CLOSED: ['muted', 'Tutup'],
}

export default function ShiftsPage() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [branchId, setBranchId] = useState('')

  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    limit: 50,
    ...(branchId && { branch_id: branchId }),
  }).toString()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['shifts', params],
    queryFn: () => api.get(`/shifts?${params}`),
  })

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  })

  const shifts = data?.data || []
  const meta = data?.meta || {}
  const rangeLabel = formatDateRange(dateFrom, dateTo)
  const openShifts = shifts.filter((shift) => shift.status === 'OPEN').length
  const closedShifts = shifts.filter((shift) => shift.status === 'CLOSED').length

  return (
    <div>
      <PageHeader
        title="Manajemen Shift"
        subtitle={`${rangeLabel} - ${shifts.length} shift ditemukan`}
        action={
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-border bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label className="shrink-0 text-xs text-muted-foreground">Dari:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label className="shrink-0 text-xs text-muted-foreground">Sampai:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>

        <select
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
        >
          <option value="">Semua Cabang</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </div>

      {shifts.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="flex items-center gap-2 rounded-lg border border-green-400/20 bg-green-400/10 px-3 py-2">
            <Clock size={13} className="text-green-400" />
            <span className="text-xs font-medium text-green-400">{openShifts} shift aktif</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
            <span className="text-xs text-muted-foreground">{closedShifts} shift selesai</span>
          </div>
          {meta.total && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
              <span className="text-xs text-muted-foreground">Total: {meta.total}</span>
            </div>
          )}
        </div>
      )}

      <Card>
        {isLoading ? <Spinner /> : shifts.length === 0 ? (
          <Empty message="Tidak ada shift pada rentang tanggal ini" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kasir</Th>
                <Th>Cabang</Th>
                <Th>Buka</Th>
                <Th>Tutup</Th>
                <Th className="text-right">Modal Awal</Th>
                <Th className="text-right">Kas Akhir</Th>
                <Th className="text-right">Order</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => {
                const [variant, label] = STATUS_BADGE[shift.status] || ['muted', shift.status]

                return (
                  <tr key={shift.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-accent/20">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {(shift.user?.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm">{shift.user?.name || '-'}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">{shift.branch?.name || '-'}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{formatDateTime(shift.openedAt || shift.opened_at)}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-muted-foreground">
                        {shift.closedAt || shift.closed_at ? formatDateTime(shift.closedAt || shift.closed_at) : '-'}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className="money text-sm">{formatRupiah(shift.openingCash || shift.opening_cash)}</span>
                    </Td>
                    <Td className="text-right">
                      <span className="money text-sm">
                        {shift.closingCash || shift.closing_cash ? formatRupiah(shift.closingCash || shift.closing_cash) : '-'}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className="font-mono text-sm">{shift.orderCount ?? 0}</span>
                    </Td>
                    <Td>
                      <Badge variant={variant}>{label}</Badge>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
