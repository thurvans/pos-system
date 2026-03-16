import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/components/ui/toast'
import {
  Card,
  Button,
  Badge,
  PageHeader,
  Spinner,
  Empty,
  Table,
  Th,
  Td,
  Modal,
  Input,
  Select,
} from '@/components/ui'

const ROLE_BADGE = {
  SUPER_ADMIN: ['rose', 'Super Admin (Owner)'],
  MANAGER: ['amber', 'Manager'],
  CASHIER: ['green', 'Kasir'],
  WAITER: ['blue', 'Waiter'],
  KITCHEN: ['muted', 'Kitchen'],
}

const ROLE_OPTIONS_BY_ACTOR = {
  SUPER_ADMIN: [
    { value: 'CASHIER', label: 'Kasir' },
    { value: 'WAITER', label: 'Waiter' },
    { value: 'KITCHEN', label: 'Kitchen' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
  ],
  MANAGER: [
    { value: 'CASHIER', label: 'Kasir' },
    { value: 'WAITER', label: 'Waiter' },
    { value: 'KITCHEN', label: 'Kitchen' },
  ],
}

const getRoleOptions = (actorRole) => ROLE_OPTIONS_BY_ACTOR[actorRole] || ROLE_OPTIONS_BY_ACTOR.MANAGER

function UserModal({ open, onClose, user, branches, actorRole }) {
  const qc = useQueryClient()
  const isEdit = Boolean(user)
  const isOwner = actorRole === 'SUPER_ADMIN'
  const roleOptions = useMemo(() => getRoleOptions(actorRole), [actorRole])
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER',
    branchId: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const fallbackRole = roleOptions[0]?.value || 'CASHIER'
    const selectedRole = user?.role && roleOptions.some((option) => option.value === user.role)
      ? user.role
      : fallbackRole

    setForm({
      name: user?.name || '',
      email: user?.email || '',
      password: '',
      role: selectedRole,
      branchId: user?.branchId || '',
    })
    setError('')
  }, [open, roleOptions, user])

  const saveMutation = useMutation({
    mutationFn: () => {
      const normalizedBranchId = form.branchId.trim()
      const hasPasswordValue = form.password.trim().length > 0
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: hasPasswordValue ? form.password : undefined,
        role: form.role,
        branchId: isEdit
          ? (normalizedBranchId || (isOwner ? null : undefined))
          : (normalizedBranchId || undefined),
      }

      return isEdit
        ? api.put(`/users/${user.id}`, payload)
        : api.post('/users', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: isEdit ? 'Pengguna diperbarui' : 'Pengguna ditambahkan',
        variant: 'success',
      })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Pengguna' : 'Tambah Pengguna'}>
      <div className="space-y-4">
        <Input label="Nama" value={form.name} onChange={setField('name')} placeholder="Budi Santoso" />
        <Input label="Email" type="email" value={form.email} onChange={setField('email')} placeholder="budi@pos.com" />
        <Input
          label={isEdit ? 'Password Baru (opsional)' : 'Password'}
          type="password"
          value={form.password}
          onChange={setField('password')}
          placeholder="********"
        />
        <Select label="Role" value={form.role} onChange={setField('role')}>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select label="Cabang" value={form.branchId} onChange={setField('branchId')}>
          <option value="">Tidak terikat cabang</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button
            className="flex-1"
            loading={saveMutation.isPending}
            disabled={!form.name.trim() || !form.email.trim() || (!isEdit && !form.password.trim())}
            onClick={() => saveMutation.mutate()}
          >
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DeleteUserModal({ open, onClose, user }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setError('')
    }
  }, [open])

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'Pengguna dihapus',
        variant: 'success',
      })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  if (!user) return null

  return (
    <Modal open={open} onClose={onClose} title="Hapus Pengguna">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Hapus akun <span className="font-medium text-foreground">{user.name}</span>?
          Tindakan ini permanen. Jika user sudah punya transaksi atau data operasional, penghapusan akan ditolak.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Hapus
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function UsersPage() {
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  })

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  })

  const list = users?.data || users || []
  const canDeleteUsers = user?.role === 'SUPER_ADMIN'

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle={`${list.length} pengguna terdaftar. Role dan permission sudah dipisah ke halaman terpisah.`}
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {user?.role === 'SUPER_ADMIN' && (
              <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={() => navigate('/role-permissions')}>
                Role Permission
              </Button>
            )}
            <Button className="w-full justify-center sm:w-auto" onClick={() => setModal('add')}>
              <Plus size={14} /> Tambah Pengguna
            </Button>
          </div>
        )}
      />

      <Card>
        {isLoading ? <Spinner /> : list.length === 0 ? (
          <Empty message="Belum ada pengguna" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pengguna</Th>
                <Th>Role</Th>
                <Th>Cabang</Th>
                <Th>Status</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const [badgeVariant, badgeLabel] = ROLE_BADGE[item.role] || ['muted', item.role]
                return (
                  <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {item.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge variant={badgeVariant}>{badgeLabel}</Badge></Td>
                    <Td><span className="text-xs text-muted-foreground">{item.branch?.name || 'Semua cabang'}</span></Td>
                    <Td>
                      <Badge variant={item.isActive ? 'green' : 'muted'}>
                        {item.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setModal(item)}>
                          <Pencil size={12} />
                        </Button>
                        {canDeleteUsers && item.id !== user?.id ? (
                          <Button
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <UserModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        user={modal === 'add' ? null : modal}
        branches={branches || []}
        actorRole={user?.role}
      />
      <DeleteUserModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        user={deleteTarget}
      />
    </div>
  )
}
