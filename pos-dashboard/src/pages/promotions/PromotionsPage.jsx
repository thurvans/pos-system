import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { formatDateTime } from '@/lib/utils'

const emptyForm = {
  name: '',
  type: 'PERCENTAGE',
  valueType: 'PERCENTAGE',
  value: '',
  buyQty: '',
  getQty: '',
  startAt: '',
  endAt: '',
  branchId: '',
}

const padDatePart = (value) => String(value).padStart(2, '0')

const toDateTimeLocalValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-') + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

const toDateTimeIso = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function PromotionModal({ open, onClose, promotion, branches }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const isEdit = Boolean(promotion)

  useEffect(() => {
    if (!open) return
    setForm({
      name: promotion?.name || '',
      type: promotion?.type || 'PERCENTAGE',
      valueType: promotion?.valueType || 'PERCENTAGE',
      value: promotion?.value != null ? String(promotion.value) : '',
      buyQty: promotion?.buyQty != null ? String(promotion.buyQty) : '',
      getQty: promotion?.getQty != null ? String(promotion.getQty) : '',
      startAt: toDateTimeLocalValue(promotion?.startAt),
      endAt: toDateTimeLocalValue(promotion?.endAt),
      branchId: promotion?.branchId || '',
    })
    setError('')
  }, [open, promotion])

  const saveMutation = useMutation({
    mutationFn: () => {
      const startAt = toDateTimeIso(form.startAt)
      const endAt = toDateTimeIso(form.endAt)

      if (!startAt || !endAt) {
        throw new Error('Tanggal promo tidak valid')
      }

      if (new Date(endAt) <= new Date(startAt)) {
        throw new Error('Waktu berakhir harus setelah waktu mulai')
      }

      const payload = {
        name: form.name,
        type: form.type,
        startAt,
        endAt,
        branchId: form.branchId || undefined,
      }

      if (form.type === 'BUY_ONE_GET_ONE') {
        payload.buyQty = Number(form.buyQty || 1)
        payload.getQty = Number(form.getQty || 1)
      } else if (form.type !== 'BUNDLE') {
        payload.valueType = form.valueType
        payload.value = form.value ? Number(form.value) : 0
      }

      return isEdit
        ? api.put(`/promotions/${promotion.id}`, payload)
        : api.post('/promotions', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  const requiresValue = !['BUNDLE', 'BUY_ONE_GET_ONE'].includes(form.type)
  const requiresBogo = form.type === 'BUY_ONE_GET_ONE'

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Promo - ${promotion?.name}` : 'Tambah Promo'} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nama Promo" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <Select label="Cabang" value={form.branchId} onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}>
            <option value="">Semua Cabang</option>
            {(branches || []).map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
          <Select label="Tipe Promo" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="NOMINAL">Nominal</option>
            <option value="HAPPY_HOUR">Happy Hour</option>
            <option value="BUNDLE">Bundle</option>
            <option value="BUY_ONE_GET_ONE">Buy 1 Get 1</option>
          </Select>
          {requiresValue && (
            <Select label="Value Type" value={form.valueType} onChange={(event) => setForm((prev) => ({ ...prev, valueType: event.target.value }))}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="NOMINAL">Nominal</option>
            </Select>
          )}
          {requiresValue && (
            <Input label="Nilai Promo" type="number" value={form.value} onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))} />
          )}
          {requiresBogo && (
            <Input label="Buy Qty" type="number" value={form.buyQty} onChange={(event) => setForm((prev) => ({ ...prev, buyQty: event.target.value }))} />
          )}
          {requiresBogo && (
            <Input label="Get Qty" type="number" value={form.getQty} onChange={(event) => setForm((prev) => ({ ...prev, getQty: event.target.value }))} />
          )}
          <Input label="Mulai" type="datetime-local" value={form.startAt} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))} />
          <Input label="Berakhir" type="datetime-local" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} />
        </div>

        {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button
            loading={saveMutation.isPending}
            disabled={!form.name.trim() || !form.startAt || !form.endAt || (requiresValue && form.value === '') || (requiresBogo && (!form.buyQty || !form.getQty))}
            onClick={() => saveMutation.mutate()}
          >
            {isEdit ? 'Simpan Perubahan' : 'Simpan Promo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PromotionsPage() {
  const qc = useQueryClient()
  const [branchId, setBranchId] = useState('')
  const [modal, setModal] = useState(null)

  const { data: branches } = useQuery({
    queryKey: ['promo-branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: promotions, isLoading } = useQuery({
    queryKey: ['promotions', branchId],
    queryFn: () => api.get(`/promotions${branchId ? `?branch_id=${branchId}` : ''}`),
  })

  const togglePromotion = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/promotions/${id}/active`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })

  const deletePromotion = useMutation({
    mutationFn: (id) => api.delete(`/promotions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })

  const rows = useMemo(() => promotions || [], [promotions])

  return (
    <div>
      <PageHeader
        title="Promo & Diskon"
        subtitle="Kelola promo aktif, edit pengaturan, dan hapus promo yang sudah tidak dipakai."
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select className="w-full sm:w-[220px]" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Semua Cabang</option>
              {(branches || []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
            <Button className="w-full justify-center sm:w-auto" onClick={() => setModal('add')}>
              <Plus size={14} /> Tambah Promo
            </Button>
          </div>
        )}
      />

      <Card className="p-5">
        {isLoading ? <Spinner /> : rows.length === 0 ? <Empty message="Belum ada promo" /> : (
          <div className="space-y-3">
            {rows.map((promotion) => (
              <div key={promotion.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{promotion.name}</p>
                      <Badge variant={promotion.isActive ? 'green' : 'muted'}>
                        {promotion.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <Badge variant="blue">{promotion.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {promotion.branch?.name || 'Semua Cabang'} · {formatDateTime(promotion.startAt)} sampai {formatDateTime(promotion.endAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {promotion.type === 'BUY_ONE_GET_ONE'
                        ? `Buy ${promotion.buyQty || 1} Get ${promotion.getQty || 1}`
                        : promotion.type === 'BUNDLE'
                          ? 'Promo bundle'
                          : `${promotion.valueType || '-'} ${promotion.value != null ? promotion.value : 0}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs !min-w-0"
                      loading={togglePromotion.isPending && togglePromotion.variables?.id === promotion.id}
                      onClick={() => togglePromotion.mutate({ id: promotion.id, isActive: !promotion.isActive })}
                    >
                      {promotion.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setModal(promotion)}>
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button
                      variant="danger"
                      className="h-8 px-3 text-xs !min-w-0"
                      loading={deletePromotion.isPending && deletePromotion.variables === promotion.id}
                      onClick={() => {
                        if (window.confirm(`Hapus promo "${promotion.name}"?`)) {
                          deletePromotion.mutate(promotion.id)
                        }
                      }}
                    >
                      <Trash2 size={12} /> Hapus
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PromotionModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        promotion={modal === 'add' ? null : modal}
        branches={branches || []}
      />
    </div>
  )
}
