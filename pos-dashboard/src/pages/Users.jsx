import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Users, ShieldCheck, KeyRound, UserX, UserCheck } from 'lucide-react'
import api from '@/api'
import { branchApi } from '@/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Skeleton, StatCard } from '@/components/ui/shared'
import { toast } from '@/components/ui/toast'

const ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'MANAGER', 'SUPER_ADMIN']
const ROLE_LABEL = {
  CASHIER: 'Kasir',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  MANAGER: 'Manager',
  SUPER_ADMIN: 'Super Admin',
}
const ROLE_VARIANT = {
  CASHIER: 'secondary',
  WAITER: 'info',
  KITCHEN: 'secondary',
  MANAGER: 'info',
  SUPER_ADMIN: 'warning',
}

function UserForm({ user, branches, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!user

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'CASHIER',
    branchId: user?.branchId || '',
    isActive: user?.isActive ?? true,
  })

  const mutation = useMutation({
    mutationFn: (body) => isEdit
      ? api.put(`/auth/users/${user.id}`, body)
      : api.post('/auth/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({ title: isEdit ? 'User diperbarui' : 'User ditambahkan', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  const handleSubmit = () => {
    const body = {
      name: form.name,
      role: form.role,
      branchId: form.branchId || null,
      ...(isEdit ? { isActive: form.isActive } : { email: form.email }),
      ...(form.password && { password: form.password }),
    }
    mutation.mutate(body)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nama Lengkap</label>
          <Input placeholder="Budi Santoso" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        {!isEdit && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" placeholder="budi@toko.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
          >
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cabang</label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={form.branchId}
            onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))}
          >
            <option value="">— Semua Cabang —</option>
            {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {isEdit ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="password"
            className="pl-9"
            placeholder={isEdit ? 'Kosongkan jika tidak diubah' : 'Min. 6 karakter'}
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          />
        </div>
      </div>

      {isEdit && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
              className="rounded"
            />
            Akun Aktif
          </label>
          {!form.isActive && <span className="text-xs text-destructive">User tidak bisa login jika nonaktif</span>}
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={mutation.isPending || !form.name || (!isEdit && (!form.email || !form.password))}
      >
        {mutation.isPending ? 'Menyimpan...' : isEdit ? 'Perbarui User' : 'Tambah User'}
      </Button>
    </div>
  )
}

export default function UsersPage() {
  const [roleFilter, setRoleFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const { data, isLoading } = useQuery({
    queryKey: ['users', roleFilter, branchFilter, page],
    queryFn: () => api.get('/auth/users', { params: { role: roleFilter || undefined, branch_id: branchFilter || undefined, page, limit: 20 } }),
    staleTime: 30000,
  })

  const users = data?.data || []
  const meta = data?.meta || {}

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length
    return acc
  }, {})

  const openAdd = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (u) => { setSelected(u); setDialogOpen(true) }

  return (
    <div>
      <PageHeader
        title="Pengguna"
        description={`${meta.total || 0} user terdaftar`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Tambah User
          </Button>
        }
      />

      {/* Role stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard title="Total Kasir" value={roleCounts.CASHIER || 0} icon={Users} color="amber" />
        <StatCard title="Manager" value={roleCounts.MANAGER || 0} icon={ShieldCheck} color="blue" />
        <StatCard title="Waiter" value={roleCounts.WAITER || 0} icon={ShieldCheck} color="blue" />
        <StatCard title="Kitchen" value={roleCounts.KITCHEN || 0} icon={ShieldCheck} color="purple" />
        <StatCard title="Super Admin" value={roleCounts.SUPER_ADMIN || 0} icon={ShieldCheck} color="red" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}>
          <option value="">Semua Role</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1) }}>
          <option value="">Semua Cabang</option>
          {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada user" description="Klik Tambah User untuk membuat akun baru" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bergabung</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">{u.name?.[0]}</span>
                          </div>
                          <span className="font-medium">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono text-xs">{u.email}</TableCell>
                      <TableCell><Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge></TableCell>
                      <TableCell className="text-sm">{u.branch?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {u.isActive
                            ? <><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-xs text-green-600">Aktif</span></>
                            : <><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" /><span className="text-xs text-muted-foreground">Nonaktif</span></>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {meta.totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 text-sm">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
                  <span className="text-muted-foreground">Halaman {page} dari {meta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit User' : 'Tambah User Baru'}</DialogTitle>
            <DialogDescription>
              {selected ? `Mengedit akun: ${selected.name}` : 'Buat akun kasir, manager, atau admin baru'}
            </DialogDescription>
          </DialogHeader>
          <UserForm user={selected} branches={branches} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
