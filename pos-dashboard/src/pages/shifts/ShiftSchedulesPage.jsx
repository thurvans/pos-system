import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui'
import { formatDateTime, formatDateRange, today } from '@/lib/utils'

const STATUS_BADGE = {
  PLANNED: ['amber', 'Planned'],
  CONFIRMED: ['green', 'Confirmed'],
  CANCELLED: ['muted', 'Cancelled'],
}

function ScheduleModal({ open, onClose, users, branches, defaultBranchId }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    userId: '',
    branchId: defaultBranchId || '',
    startAt: '',
    endAt: '',
    status: 'PLANNED',
    note: '',
  })
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => api.post('/shift-schedules', {
      userId: form.userId,
      branchId: form.branchId || undefined,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      status: form.status,
      note: form.note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['shift-schedules'])
      onClose()
      setForm({
        userId: '',
        branchId: defaultBranchId || '',
        startAt: '',
        endAt: '',
        status: 'PLANNED',
        note: '',
      })
      setError('')
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="Tambah Jadwal Shift">
      <div className="space-y-4">
        <Select
          label="Karyawan"
          value={form.userId}
          onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
        >
          <option value="">Pilih karyawan...</option>
          {(users || []).map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </Select>
        <Select
          label="Cabang"
          value={form.branchId}
          onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}
        >
          <option value="">Pilih cabang...</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        <Input
          label="Mulai"
          type="datetime-local"
          value={form.startAt}
          onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
        />
        <Input
          label="Selesai"
          type="datetime-local"
          value={form.endAt}
          onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}
        />
        <Select
          label="Status"
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
        >
          <option value="PLANNED">Planned</option>
          <option value="CONFIRMED">Confirmed</option>
        </Select>
        <Input
          label="Catatan"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          placeholder="Opsional"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button
            className="flex-1"
            loading={createMutation.isPending}
            disabled={!form.userId || !form.branchId || !form.startAt || !form.endAt}
            onClick={() => createMutation.mutate()}
          >
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function ShiftSchedulesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const defaultBranchId = user?.role === 'SUPER_ADMIN' ? '' : (user?.branch?.id || '')

  const [branchId, setBranchId] = useState(defaultBranchId)
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [showModal, setShowModal] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      ...(branchId && { branch_id: branchId }),
      ...(userId && { user_id: userId }),
      ...(status && { status }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo && { date_to: dateTo }),
    })
    return params.toString()
  }, [branchId, userId, status, dateFrom, dateTo])

  const { data: schedules, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['shift-schedules', queryString],
    queryFn: () => api.get(`/shift-schedules${queryString ? `?${queryString}` : ''}`),
  })

  const { data: users } = useQuery({
    queryKey: ['shift-schedule-users'],
    queryFn: () => api.get('/users'),
  })

  const { data: branches } = useQuery({
    queryKey: ['shift-schedule-branches'],
    queryFn: () => api.get('/branches'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => api.delete(`/shift-schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['shift-schedules'])
    },
  })

  const rows = schedules || []
  const rangeLabel = formatDateRange(dateFrom, dateTo)

  return (
    <div>
      <PageHeader
        title="Jadwal Shift"
        subtitle={`${rangeLabel} - Pengaturan jadwal kerja kasir/waiter/kitchen`}
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={() => refetch()}>
              {isFetching ? 'Memuat...' : 'Refresh'}
            </Button>
            <Button className="w-full justify-center sm:w-auto" onClick={() => setShowModal(true)}>Tambah Jadwal</Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
        <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Semua Cabang</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
          <option value="">Semua Karyawan</option>
          {(users || []).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Semua Status</option>
          <option value="PLANNED">Planned</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

      <Card>
        {isLoading ? <Spinner /> : rows.length === 0 ? (
          <Empty message="Belum ada jadwal shift pada filter ini" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Karyawan</Th>
                <Th>Cabang</Th>
                <Th>Mulai</Th>
                <Th>Selesai</Th>
                <Th>Status</Th>
                <Th>Catatan</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const [variant, label] = STATUS_BADGE[row.status] || ['muted', row.status]
                return (
                  <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                    <Td>
                      <div>
                        <p className="text-sm font-medium">{row.user?.name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{row.user?.role || '-'}</p>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">{row.branch?.name || '-'}</span>
                    </Td>
                    <Td>
                      <span className="text-xs">{formatDateTime(row.start_at || row.startAt)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs">{formatDateTime(row.end_at || row.endAt)}</span>
                    </Td>
                    <Td>
                      <Badge variant={variant}>{label}</Badge>
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">{row.note || '-'}</span>
                    </Td>
                    <Td className="text-right">
                      {row.status !== 'CANCELLED' && (
                        <Button
                          variant="secondary"
                          className="h-7 px-2 text-xs !min-w-0"
                          loading={cancelMutation.isPending && cancelMutation.variables === row.id}
                          onClick={() => cancelMutation.mutate(row.id)}
                        >
                          Batalkan
                        </Button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ScheduleModal
        open={showModal}
        onClose={() => setShowModal(false)}
        users={users || []}
        branches={branches || []}
        defaultBranchId={defaultBranchId}
      />
    </div>
  )
}
