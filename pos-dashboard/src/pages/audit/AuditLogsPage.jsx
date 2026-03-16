import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Badge, Card, Empty, Input, PageHeader, Spinner, Table, Td, Th } from '@/components/ui'
import { formatDateTime } from '@/lib/utils'

const MAX_PREVIEW_ITEMS = 3
const numberFormatter = new Intl.NumberFormat('id-ID')

const looksLikeDateValue = (value) => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?/.test(value)
)

const formatAuditLabel = (label) => {
  if (!label) return 'Data'

  return label
    .split('.')
    .map((part) => part
      .replace(/\[(\d+)\]/g, ' $1')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(' / ')
}

const formatAuditValue = (value) => {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (typeof value === 'number') return numberFormatter.format(value)
  if (typeof value === 'string') {
    return looksLikeDateValue(value) ? formatDateTime(value) : value
  }

  return String(value)
}

const collectAuditEntries = (value, parentKey = '') => {
  if (value == null || value === '') {
    return parentKey ? [{ label: parentKey, value: '-' }] : []
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return parentKey ? [{ label: parentKey, value: '-' }] : []
    }

    const hasComplexItems = value.some((item) => item && typeof item === 'object')
    if (!hasComplexItems) {
      return [{
        label: parentKey || 'data',
        value: value.map((item) => formatAuditValue(item)).join(', '),
      }]
    }

    return value.flatMap((item, index) => {
      const nextKey = parentKey ? `${parentKey}[${index + 1}]` : `item[${index + 1}]`
      return collectAuditEntries(item, nextKey)
    })
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return parentKey ? [{ label: parentKey, value: '-' }] : []
    }

    return entries.flatMap(([key, nestedValue]) => {
      const nextKey = parentKey ? `${parentKey}.${key}` : key
      return collectAuditEntries(nestedValue, nextKey)
    })
  }

  return [{
    label: parentKey || 'data',
    value: formatAuditValue(value),
  }]
}

function AuditDataPreview({ value }) {
  const entries = collectAuditEntries(value)

  if (entries.length === 0) {
    return <span className="text-[11px] text-muted-foreground">-</span>
  }

  const previewItems = entries.slice(0, MAX_PREVIEW_ITEMS)
  const remainingCount = entries.length - previewItems.length

  return (
    <div className="space-y-1.5">
      {previewItems.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="rounded-md bg-muted/40 px-2 py-1">
          <p className="text-[10px] font-medium text-muted-foreground">
            {formatAuditLabel(entry.label)}
          </p>
          <p className="text-[11px] text-foreground break-all">
            {entry.value}
          </p>
        </div>
      ))}
      {remainingCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          +{remainingCount} data lain
        </p>
      )}
    </div>
  )
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [userId, setUserId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: '25',
      ...(action && { action }),
      ...(entity && { entity }),
      ...(userId && { user_id: userId }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    })
    return params.toString()
  }, [action, entity, userId, dateFrom, dateTo, page])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit-logs', queryString],
    queryFn: () => api.get(`/audit-logs?${queryString}`),
    keepPreviousData: true,
  })

  const rows = data?.data || []
  const meta = data?.meta || {}
  const totalPages = meta.totalPages || 1

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Riwayat aktivitas user dan perubahan data"
      />

      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4">
        <Input
          placeholder="Aksi (ORDER_CANCEL)"
          value={action}
          onChange={(event) => {
            setAction(event.target.value)
            setPage(1)
          }}
        />
        <Input
          placeholder="Entitas (orders)"
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value)
            setPage(1)
          }}
        />
        <Input
          placeholder="User ID"
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value)
            setPage(1)
          }}
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value)
            setPage(1)
          }}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value)
            setPage(1)
          }}
        />
        <button
          onClick={() => refetch()}
          className="h-10 rounded-lg border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isFetching ? 'Memuat...' : 'Refresh'}
        </button>
      </div>

      <Card>
        {isLoading ? <Spinner /> : rows.length === 0 ? (
          <Empty message="Belum ada audit log untuk filter ini" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Aksi</Th>
                <Th>Entitas</Th>
                <Th>User</Th>
                <Th>Data Lama</Th>
                <Th>Data Baru</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                  <Td>
                    <span className="text-xs">{formatDateTime(row.created_at)}</span>
                  </Td>
                  <Td>
                    <Badge variant="blue">{row.action}</Badge>
                  </Td>
                  <Td>
                    <div className="text-xs">
                      <p className="font-medium">{row.entity}</p>
                      <p className="text-muted-foreground">{row.entity_id}</p>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs">
                      <p className="font-medium">{row.user?.name || '-'}</p>
                      <p className="text-muted-foreground">{row.user?.role || '-'}</p>
                    </div>
                  </Td>
                  <Td>
                    <AuditDataPreview value={row.old_data} />
                  </Td>
                  <Td>
                    <AuditDataPreview value={row.new_data} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
