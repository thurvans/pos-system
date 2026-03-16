import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, AlertTriangle, CheckCircle2, LayoutGrid, List, Users } from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Td, Th } from '@/components/ui'

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE']
const STATUS_BADGE = {
  AVAILABLE: ['green', 'Tersedia'],
  OCCUPIED: ['blue', 'Terisi'],
  RESERVED: ['amber', 'Reservasi'],
  OUT_OF_SERVICE: ['rose', 'Out Of Service'],
}

const buildTablesQuery = ({ branchId, status, includeInactive, q }) => {
  const params = new URLSearchParams()
  if (branchId) params.set('branch_id', branchId)
  if (status) params.set('status', status)
  if (includeInactive) params.set('include_inactive', 'true')
  if (q?.trim()) params.set('q', q.trim())
  return params.toString()
}

const parseError = (err) => err?.message || err?.error || 'Terjadi kesalahan'

const effectiveStatus = (row) => {
  const occupied = row.occupied === true || row.occupiedByActiveOrder === true || row.occupied_by_active_order === true
  const baseStatus = row.baseStatus || row.base_status || row.status
  if (baseStatus === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE'
  if (occupied || baseStatus === 'OCCUPIED') return 'OCCUPIED'
  if (baseStatus === 'RESERVED') return 'RESERVED'
  return 'AVAILABLE'
}

const statusTone = (row) => {
  const isActive = row.isActive ?? row.is_active
  const status = effectiveStatus(row)
  const occupied = row.occupied === true || row.occupiedByActiveOrder === true || row.occupied_by_active_order === true
  if (!isActive) return 'border-border bg-secondary/30'
  if (status === 'OUT_OF_SERVICE') return 'border-rose-500/30 bg-rose-500/10'
  if (occupied || status === 'OCCUPIED') return 'border-blue-500/30 bg-blue-500/10'
  if (status === 'RESERVED') return 'border-amber-500/30 bg-amber-500/10'
  return 'border-emerald-500/30 bg-emerald-500/10'
}

const statusLabel = (status) => STATUS_BADGE[status]?.[1] || status

function TableLayoutBoard({
  rows,
  onEdit,
  onSetStatus,
  onToggleActive,
  statusMutation,
  activeMutation,
}) {
  if (!rows.length) {
    return <Empty message="Belum ada meja untuk ditampilkan di layout" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Tersedia
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          Terisi
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Reservasi
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          Out of service
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {rows.map((row) => {
          const isActive = row.isActive ?? row.is_active
          const occupied = row.occupied === true || row.occupiedByActiveOrder === true || row.occupied_by_active_order === true
          const tone = statusTone(row)
          const displayStatus = effectiveStatus(row)
          const [badgeVariant] = STATUS_BADGE[displayStatus] || ['muted']

          return (
            <div key={row.id} className={`rounded-xl border p-3 ${tone}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.capacity || 0} kursi</p>
                </div>
                <Badge variant={badgeVariant}>{statusLabel(displayStatus)}</Badge>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                <Badge variant={occupied ? 'amber' : 'green'}>
                  {occupied ? 'Dipakai' : 'Kosong'}
                </Badge>
                <Badge variant={isActive ? 'green' : 'muted'}>
                  {isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Select
                  className="h-8 text-xs"
                  value={row.baseStatus || row.base_status || row.status}
                  onChange={(event) => onSetStatus(row.id, event.target.value)}
                >
                  {TABLE_STATUSES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  className="h-8 px-2 text-xs !min-w-0 justify-center"
                  loading={activeMutation.isPending && activeMutation.variables?.id === row.id}
                  onClick={() => onToggleActive(row.id, !isActive)}
                >
                  {isActive ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 px-2 text-xs !min-w-0 col-span-2 justify-center"
                  loading={statusMutation.isPending && statusMutation.variables?.id === row.id}
                  onClick={() => onEdit(row)}
                >
                  Edit Detail Meja
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TableFormModal({
  open,
  onClose,
  title,
  submitLabel,
  loading,
  branches,
  isSuperAdmin,
  form,
  setForm,
  error,
  onSubmit,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {isSuperAdmin && (
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
        )}

        <Input
          label="Nama Meja"
          placeholder="Contoh: Meja A1"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />

        <Input
          label="Kapasitas"
          type="number"
          min={1}
          max={50}
          value={form.capacity}
          onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
        />

        <Select
          label="Status"
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
        >
          {TABLE_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>

        <Select
          label="Aktif"
          value={form.isActive ? 'true' : 'false'}
          onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.value === 'true' }))}
        >
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </Select>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            className="flex-1"
            loading={loading}
            disabled={!form.name.trim() || !form.capacity || (isSuperAdmin && !form.branchId)}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function TablesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const defaultBranchId = isSuperAdmin ? '' : (user?.branch?.id || '')

  const [branchId, setBranchId] = useState(defaultBranchId)
  const [status, setStatus] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [q, setQ] = useState('')
  const [modalError, setModalError] = useState('')
  const [viewMode, setViewMode] = useState('layout')

  const emptyForm = useMemo(
    () => ({
      branchId: defaultBranchId,
      name: '',
      capacity: '4',
      status: 'AVAILABLE',
      isActive: true,
    }),
    [defaultBranchId]
  )

  const [form, setForm] = useState(emptyForm)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTable, setEditingTable] = useState(null)
  const selectedBranchId = branchId || defaultBranchId
  const hasBranchContext = Boolean(selectedBranchId)

  const queryString = useMemo(
    () => buildTablesQuery({ branchId: selectedBranchId, status, includeInactive, q }),
    [selectedBranchId, status, includeInactive, q]
  )

  const { data: branches } = useQuery({
    queryKey: ['tables-branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: rows, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['tables-list', queryString],
    queryFn: () => api.get(`/tables${queryString ? `?${queryString}` : ''}`),
    enabled: hasBranchContext,
    refetchInterval: 5000,
  })

  const { data: occupancy } = useQuery({
    queryKey: ['tables-occupancy', selectedBranchId],
    queryFn: () => api.get(`/tables/occupancy${selectedBranchId ? `?branch_id=${selectedBranchId}` : ''}`),
    enabled: hasBranchContext,
    refetchInterval: 5000,
  })

  const invalidateTables = () => {
    qc.invalidateQueries(['tables-list'])
    qc.invalidateQueries(['tables-occupancy'])
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/tables', payload),
    onSuccess: () => {
      invalidateTables()
      setShowCreateModal(false)
      setForm(emptyForm)
      setModalError('')
    },
    onError: (err) => setModalError(parseError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/tables/${id}`, payload),
    onSuccess: () => {
      invalidateTables()
      setEditingTable(null)
      setForm(emptyForm)
      setModalError('')
    },
    onError: (err) => setModalError(parseError(err)),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, statusValue }) => api.patch(`/tables/${id}/status`, { status: statusValue }),
    onSuccess: invalidateTables,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/tables/${id}/active`, { isActive }),
    onSuccess: invalidateTables,
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.delete(`/tables/${id}`),
    onSuccess: invalidateTables,
  })

  const openCreateModal = () => {
    setForm({
      ...emptyForm,
      branchId: branchId || emptyForm.branchId,
    })
    setModalError('')
    setShowCreateModal(true)
  }

  const openEditModal = (row) => {
    setEditingTable(row)
    setForm({
      branchId: row.branchId || row.branch_id || defaultBranchId,
      name: row.name || '',
      capacity: String(row.capacity || 4),
      status: row.status || 'AVAILABLE',
      isActive: Boolean(row.isActive ?? row.is_active),
    })
    setModalError('')
  }

  const submitCreate = () => {
    createMutation.mutate({
      branchId: isSuperAdmin ? form.branchId : undefined,
      name: form.name.trim(),
      capacity: Number(form.capacity),
      status: form.status,
      isActive: form.isActive,
    })
  }

  const submitEdit = () => {
    if (!editingTable) return
    updateMutation.mutate({
      id: editingTable.id,
      payload: {
        name: form.name.trim(),
        capacity: Number(form.capacity),
        status: form.status,
        isActive: form.isActive,
      },
    })
  }

  const listRows = rows || []
  const layoutRows = (occupancy?.rows || listRows).filter((row) => {
    if (!includeInactive && !(row.isActive ?? row.is_active ?? true)) return false
    if (status && row.status !== status) return false
    if (q.trim() && !String(row.name || '').toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  })

  const handleSetStatus = (id, statusValue) => {
    updateStatusMutation.mutate({ id, statusValue })
  }

  const handleToggleActive = (id, isActive) => {
    toggleActiveMutation.mutate({ id, isActive })
  }

  return (
    <div>
      <PageHeader
        title="Manajemen Meja"
        subtitle="Kelola master meja, status ketersediaan, dan occupancy cabang"
        action={(
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!hasBranchContext}
              onClick={() => {
                if (!hasBranchContext) return
                refetch()
              }}
            >
              {isFetching ? 'Memuat...' : 'Refresh'}
            </Button>
            <Button onClick={openCreateModal}>Tambah Meja</Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Occupancy"
          value={`${occupancy?.occupancyRate ?? 0}%`}
          sub={`${occupancy?.occupiedTables ?? 0}/${occupancy?.operationalTables ?? 0} meja operasional`}
          icon={Armchair}
          color="amber"
        />
        <StatCard
          label="Meja Tersedia"
          value={`${occupancy?.availableTables ?? 0}`}
          sub="Siap dipakai"
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="Reservasi"
          value={`${occupancy?.reservedTables ?? 0}`}
          sub="Status reserved"
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Out Of Service"
          value={`${occupancy?.outOfServiceTables ?? 0}`}
          sub="Perlu tindakan"
          icon={AlertTriangle}
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">{isSuperAdmin ? 'Pilih Cabang' : 'Cabang Aktif'}</option>
          {(branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Semua Status</option>
          {TABLE_STATUSES.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </Select>
        <Select
          value={includeInactive ? 'true' : 'false'}
          onChange={(event) => setIncludeInactive(event.target.value === 'true')}
        >
          <option value="false">Meja Aktif Saja</option>
          <option value="true">Termasuk Nonaktif</option>
        </Select>
        <Input
          placeholder="Cari nama meja..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      <Card>
        <div className="px-4 pt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Peta & Daftar Meja</p>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setViewMode('layout')}
              className={`h-8 px-3 text-xs rounded-md inline-flex items-center gap-1.5 ${viewMode === 'layout' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
            >
              <LayoutGrid size={14} />
              Layout
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-8 px-3 text-xs rounded-md inline-flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
            >
              <List size={14} />
              Tabel
            </button>
          </div>
        </div>

        <div className="p-4">
          {!hasBranchContext && isSuperAdmin ? (
            <Empty message="Pilih cabang untuk melihat manajemen meja dan occupancy." />
          ) : isLoading ? (
            <Spinner />
          ) : viewMode === 'layout' ? (
            <TableLayoutBoard
              rows={layoutRows}
              onEdit={openEditModal}
              onSetStatus={handleSetStatus}
              onToggleActive={handleToggleActive}
              statusMutation={updateStatusMutation}
              activeMutation={toggleActiveMutation}
            />
          ) : !listRows.length ? (
            <Empty message="Belum ada data meja pada filter ini" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Nama</Th>
                  <Th>Kapasitas</Th>
                  <Th>Status</Th>
                  <Th>Aktif</Th>
                  <Th>Order Aktif</Th>
                  <Th>Total Order</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row) => {
                  const displayStatus = effectiveStatus(row)
                  const [badgeVariant, badgeLabel] = STATUS_BADGE[displayStatus] || ['muted', displayStatus]
                  return (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                      <Td>
                        <p className="text-sm font-medium">{row.name}</p>
                      </Td>
                      <Td>{row.capacity}</Td>
                      <Td>
                        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                      </Td>
                      <Td>
                        <Badge variant={(row.isActive ?? row.is_active) ? 'green' : 'muted'}>
                          {(row.isActive ?? row.is_active) ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant={row.occupied ? 'amber' : 'muted'}>
                          {row.occupied ? 'Ya' : 'Tidak'}
                        </Badge>
                      </Td>
                      <Td>{row.order_count || row.orderCount || 0}</Td>
                      <Td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Select
                            className="h-8 min-w-[145px] text-xs"
                            value={row.baseStatus || row.base_status || row.status}
                            onChange={(event) => handleSetStatus(row.id, event.target.value)}
                          >
                            {TABLE_STATUSES.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </Select>
                          <Button
                            variant="secondary"
                            className="h-8 px-2 text-xs !min-w-0"
                            loading={toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === row.id}
                            onClick={() => handleToggleActive(row.id, !(row.isActive ?? row.is_active))}
                          >
                            {(row.isActive ?? row.is_active) ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                          <Button
                            variant="secondary"
                            className="h-8 px-2 text-xs !min-w-0"
                            onClick={() => openEditModal(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            className="h-8 px-2 text-xs !min-w-0"
                            loading={deactivateMutation.isPending && deactivateMutation.variables === row.id}
                            onClick={() => deactivateMutation.mutate(row.id)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <TableFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Tambah Meja"
        submitLabel="Simpan"
        loading={createMutation.isPending}
        branches={branches || []}
        isSuperAdmin={isSuperAdmin}
        form={form}
        setForm={setForm}
        error={modalError}
        onSubmit={submitCreate}
      />

      <TableFormModal
        open={Boolean(editingTable)}
        onClose={() => setEditingTable(null)}
        title={`Edit Meja ${editingTable?.name || ''}`}
        submitLabel="Update"
        loading={updateMutation.isPending}
        branches={branches || []}
        isSuperAdmin={false}
        form={form}
        setForm={setForm}
        error={modalError}
        onSubmit={submitEdit}
      />
    </div>
  )
}
