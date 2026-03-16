import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield } from 'lucide-react'
import { api } from '@/api/client'
import { PERMISSIONS } from '@/lib/permissions'
import { Badge, Button, Card, PageHeader, Spinner, Select } from '@/components/ui'

const PERMISSION_GROUPS = [
  {
    label: 'Dashboard',
    items: [
      PERMISSIONS.DASHBOARD_OVERVIEW,
      PERMISSIONS.DASHBOARD_REVENUE_TREND,
      PERMISSIONS.DASHBOARD_TOP_PRODUCTS,
      PERMISSIONS.DASHBOARD_OCCUPANCY,
      PERMISSIONS.DASHBOARD_ACTIVE_ORDERS,
    ],
  },
  {
    label: 'Menu',
    items: [
      PERMISSIONS.MENU_CATEGORY_MANAGE,
      PERMISSIONS.MENU_ITEM_MANAGE,
      PERMISSIONS.MENU_VARIANT_MANAGE,
      PERMISSIONS.MENU_MODIFIER_MANAGE,
      PERMISSIONS.MENU_BUNDLE_MANAGE,
    ],
  },
  {
    label: 'Order',
    items: [
      PERMISSIONS.ORDER_MONITOR,
      PERMISSIONS.ORDER_HISTORY_VIEW,
      PERMISSIONS.ORDER_CANCEL,
    ],
  },
  {
    label: 'Finance & Shift',
    items: [
      PERMISSIONS.INVENTORY_MASTER_MANAGE,
      PERMISSIONS.INVENTORY_PURCHASE_MANAGE,
      PERMISSIONS.INVENTORY_STOCK_OPNAME,
      PERMISSIONS.INVENTORY_REPORT_VIEW,
      PERMISSIONS.FINANCE_REPORT_VIEW,
      PERMISSIONS.FINANCE_EXPORT_PDF,
      PERMISSIONS.SHIFT_RECAP_VIEW,
      PERMISSIONS.EMPLOYEE_SHIFT_MANAGE,
    ],
  },
  {
    label: 'System',
    items: [
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.AUDIT_LOG_VIEW,
      PERMISSIONS.PROMO_MANAGE,
      PERMISSIONS.SYSTEM_SETTINGS_MANAGE,
      PERMISSIONS.SYSTEM_BACKUP_MANAGE,
    ],
  },
]

const ROLE_OPTIONS = [
  { value: 'MANAGER', label: 'Manager' },
  { value: 'CASHIER', label: 'Kasir' },
  { value: 'WAITER', label: 'Waiter' },
  { value: 'KITCHEN', label: 'Kitchen' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
]

export default function RolePermissionsPage() {
  const qc = useQueryClient()
  const [selectedRole, setSelectedRole] = useState('MANAGER')
  const [selectedPermissions, setSelectedPermissions] = useState([])
  const [status, setStatus] = useState({ type: '', message: '' })

  const { data: rolePermissions, isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api.get('/auth/permissions/roles'),
  })

  useEffect(() => {
    if (!rolePermissions) return
    setSelectedPermissions(rolePermissions[selectedRole] || [])
  }, [rolePermissions, selectedRole])

  const roleStats = useMemo(() => {
    if (!rolePermissions) return []
    return ROLE_OPTIONS.map((role) => ({
      ...role,
      total: role.value === 'SUPER_ADMIN'
        ? PERMISSION_GROUPS.flatMap((group) => group.items).length
        : (rolePermissions[role.value] || []).length,
    }))
  }, [rolePermissions])

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/auth/permissions/roles/${selectedRole}`, {
      permissions: selectedPermissions,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role-permissions'] })
      setStatus({ type: 'success', message: `Permission untuk ${selectedRole} berhasil diperbarui.` })
    },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  })

  const togglePermission = (permission) => {
    setSelectedPermissions((prev) => (
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    ))
  }

  return (
    <div>
      <PageHeader
        title="Role Permission"
        subtitle="Pisahkan pengaturan hak akses per role tanpa tercampur dengan data pengguna."
        action={(
          <Select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </Select>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        {roleStats.map((role) => (
          <Card key={role.value} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">{role.label}</p>
              <Shield size={14} className="text-primary" />
            </div>
            <p className="text-2xl font-semibold">{role.total}</p>
            <p className="text-xs text-muted-foreground mt-1">permission aktif</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold">Atur Permission</p>
            <p className="text-xs text-muted-foreground mt-1">
              Super Admin selalu full akses dan tidak bisa diubah dari halaman ini.
            </p>
          </div>
          {selectedRole === 'SUPER_ADMIN' && <Badge variant="blue">Readonly</Badge>}
        </div>

        {isLoading ? <Spinner /> : (
          <div className="space-y-3">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {group.items.map((permission) => (
                    <label key={permission} className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission)}
                        disabled={selectedRole === 'SUPER_ADMIN'}
                        onChange={() => togglePermission(permission)}
                        className="accent-primary"
                      />
                      <span className="font-mono text-[11px]">{permission}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {status.message && (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${status.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
            {status.message}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            disabled={selectedRole === 'SUPER_ADMIN'}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Simpan Permission
          </Button>
        </div>
      </Card>
    </div>
  )
}
