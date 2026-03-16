import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Card, Button, PageHeader, Spinner, Empty, Modal, Input, Badge } from '@/components/ui'
import { Plus, Building2, Pencil, MapPin, Phone } from 'lucide-react'

function BranchModal({ open, onClose, branch }) {
  const qc = useQueryClient()
  const isEdit = !!branch
  const [form, setForm] = useState({ name: branch?.name || '', address: branch?.address || '', phone: branch?.phone || '' })
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: (data) => isEdit ? api.put(`/branches/${branch.id}`, data) : api.post('/branches', data),
    onSuccess: () => { qc.invalidateQueries(['branches']); onClose() },
    onError: (e) => setError(e.message),
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Cabang' : 'Tambah Cabang'}>
      <div className="space-y-4">
        <Input label="Nama Cabang" value={form.name} onChange={set('name')} placeholder="Cabang Utama" />
        <Input label="Alamat" value={form.address} onChange={set('address')} placeholder="Jl. Sudirman No. 1..." />
        <Input label="Telepon" value={form.phone} onChange={set('phone')} placeholder="021-12345678" />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" loading={save.isPending} onClick={() => save.mutate(form)}>{isEdit ? 'Simpan' : 'Tambah'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function BranchesPage() {
  const [modal, setModal] = useState(null)
  const { data: branches, isLoading } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches') })

  return (
    <div>
      <PageHeader
        title="Cabang"
        subtitle={`${(branches || []).length} cabang terdaftar`}
        action={<Button onClick={() => setModal('add')}><Plus size={14} /> Tambah Cabang</Button>}
      />

      {isLoading ? <Spinner /> : (branches || []).length === 0 ? <Empty message="Belum ada cabang" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map(b => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 size={18} className="text-primary" />
                </div>
                <Button variant="ghost" className="h-7 px-2" onClick={() => setModal(b)}>
                  <Pencil size={12} />
                </Button>
              </div>
              <h3 className="font-semibold text-sm mb-2">{b.name}</h3>
              {b.address && (
                <div className="flex items-start gap-1.5 mb-1">
                  <MapPin size={11} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">{b.address}</p>
                </div>
              )}
              {b.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={11} className="text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">{b.phone}</p>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border">
                <Badge variant={b.isActive ? 'green' : 'muted'}>{b.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BranchModal open={!!modal} onClose={() => setModal(null)} branch={modal === 'add' ? null : modal} />
    </div>
  )
}
