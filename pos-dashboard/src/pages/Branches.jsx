import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, GitBranch } from 'lucide-react'
import { branchApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/shared'
import { toast } from '@/components/ui/toast'

function BranchForm({ branch, onClose }) {
  const [form, setForm] = useState({ name: branch?.name || '', address: branch?.address || '', phone: branch?.phone || '' })
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (body) => branch ? branchApi.update(branch.id, body) : branchApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] })
      toast({ title: branch ? 'Cabang diperbarui' : 'Cabang ditambahkan', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Nama Cabang</label>
        <Input placeholder="Cabang Utama" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Alamat</label>
        <Input placeholder="Jl. Sudirman No. 1, Jakarta" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Telepon</label>
        <Input placeholder="021-12345678" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
      </div>
      <Button className="w-full" onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name}>
        {mutation.isPending ? 'Menyimpan...' : branch ? 'Perbarui' : 'Tambah Cabang'}
      </Button>
    </div>
  )
}

export default function BranchesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const { data: branches, isLoading } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const openAdd = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (b) => { setSelected(b); setDialogOpen(true) }

  return (
    <div>
      <PageHeader
        title="Cabang"
        description={`${branches?.length || 0} cabang terdaftar`}
        action={<Button onClick={openAdd}><Plus className="w-4 h-4" /> Tambah Cabang</Button>}
      />

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !branches?.length ? (
            <EmptyState icon={GitBranch} title="Belum ada cabang" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.address || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{b.phone || '—'}</TableCell>
                    <TableCell><Badge variant={b.isActive ? 'success' : 'secondary'}>{b.isActive ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selected ? 'Edit Cabang' : 'Tambah Cabang'}</DialogTitle></DialogHeader>
          <BranchForm branch={selected} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
