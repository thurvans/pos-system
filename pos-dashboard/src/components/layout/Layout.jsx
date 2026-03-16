import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  Calculator,
  ClipboardList,
  Clock,
  CloudDownload,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
} from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  COSTING_PERMISSIONS,
  DASHBOARD_PERMISSIONS,
  MENU_ADVANCED_PERMISSIONS,
  MENU_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_SETTINGS_PERMISSIONS,
} from '@/lib/permissions'

const NAV_SECTIONS = [
  {
    key: 'overview',
    label: 'Overview',
    items: [
      {
        to: '/',
        icon: LayoutDashboard,
        label: 'Dashboard',
        exact: true,
        anyPermissions: DASHBOARD_PERMISSIONS,
      },
      {
        to: '/reports',
        icon: BarChart3,
        label: 'Laporan',
        anyPermissions: [PERMISSIONS.FINANCE_REPORT_VIEW],
      },
      {
        to: '/orders',
        icon: ShoppingBag,
        label: 'Transaksi',
        anyPermissions: ORDER_PERMISSIONS,
      },
      {
        to: '/shifts',
        icon: Clock,
        label: 'Shift',
        anyPermissions: [PERMISSIONS.SHIFT_RECAP_VIEW],
      },
      {
        to: '/shift-schedules',
        icon: ClipboardList,
        label: 'Jadwal Shift',
        anyPermissions: [PERMISSIONS.EMPLOYEE_SHIFT_MANAGE],
      },
    ],
  },
  {
    key: 'catalog',
    label: 'Menu & Promo',
    items: [
      {
        to: '/menu',
        icon: Package,
        label: 'Menu',
        anyPermissions: MENU_PERMISSIONS,
      },
      {
        to: '/menu-advanced',
        icon: Sparkles,
        label: 'Menu Advanced',
        anyPermissions: MENU_ADVANCED_PERMISSIONS,
      },
      {
        to: '/cost-hpp',
        icon: Calculator,
        label: 'Cost & HPP',
        anyPermissions: COSTING_PERMISSIONS,
      },
      {
        to: '/promotions',
        icon: BarChart3,
        label: 'Promo',
        anyPermissions: [PERMISSIONS.PROMO_MANAGE],
      },
    ],
  },
  {
    key: 'system',
    label: 'Administrasi',
    items: [
      {
        to: '/audit-logs',
        icon: ScrollText,
        label: 'Audit Log',
        anyPermissions: [PERMISSIONS.AUDIT_LOG_VIEW],
      },
      {
        to: '/settings',
        icon: Settings,
        label: 'Pengaturan',
        anyPermissions: SYSTEM_SETTINGS_PERMISSIONS,
      },
      { to: '/downloads', icon: CloudDownload, label: 'APK Kasir' },
      { to: '/branches', icon: Building2, label: 'Cabang', roles: ['SUPER_ADMIN'] },
      {
        to: '/users',
        icon: Users,
        label: 'Pengguna',
        anyPermissions: [PERMISSIONS.EMPLOYEE_MANAGE],
      },
      {
        to: '/role-permissions',
        icon: ShieldCheck,
        label: 'Role Permission',
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
]

function NavItem({ to, icon: Icon, label, exact, onSelect }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onSelect}
      className={({ isActive }) =>
        cn(
          'group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-all duration-200',
          'text-muted-foreground hover:bg-accent/55 hover:text-foreground',
          isActive && 'bg-primary/10 text-primary'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            strokeWidth={1.8}
            className={cn(
              'shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
            )}
          />
          <span className="truncate">{label}</span>
          <span
            className={cn(
              'ml-auto flex h-4 w-4 items-center justify-center transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout, hasAnyPermission, hasAllPermissions } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const roleLabel = user?.role?.toLowerCase()?.replace(/_/g, ' ') || 'guest'
  const branchLabel = user?.branch?.name || (user?.role === 'SUPER_ADMIN' ? 'Semua cabang' : 'Cabang belum dipilih')

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return undefined

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [mobileNavOpen])

  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles && !item.roles.includes(user?.role)) return false
        if (item.anyPermissions && !hasAnyPermission(item.anyPermissions)) return false
        if (item.allPermissions && !hasAllPermissions(item.allPermissions)) return false
        return true
      }),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card/70 text-foreground transition-colors hover:bg-accent"
            aria-label="Buka menu"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">POS Control</p>
            <p className="truncate text-xs text-muted-foreground">{branchLabel}</p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-sm font-semibold uppercase text-primary">
            {user?.name?.[0] || 'U'}
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Tutup menu"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[min(85vw,320px)] -translate-x-full border-r border-border bg-card/90 backdrop-blur-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[260px] lg:translate-x-0 lg:flex-shrink-0',
          mobileNavOpen && 'translate-x-0'
        )}
      >
        <div className="relative flex h-full flex-col">
          <div className="border-b border-border/70 px-4 py-4 sm:px-5 lg:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12">
                  <Store size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-none text-foreground">POS Control</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">Dashboard multi cabang</p>
                </div>
              </div>

              <div className="hidden text-right sm:block lg:block">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Role</p>
                <p className="mt-1 text-xs font-medium capitalize text-foreground">{roleLabel}</p>
              </div>

              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
                aria-label="Tutup navigasi"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 px-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Cabang aktif</p>
              <p className="mt-1 text-sm font-medium text-foreground">{branchLabel}</p>
            </div>
          </div>

          <nav className="px-3 py-3 lg:flex-1 lg:overflow-y-auto lg:px-4 lg:py-4">
            {visibleSections.length === 0 ? (
              <div className="rounded-2xl bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                Tidak ada menu untuk role ini.
              </div>
            ) : (
              <div className="space-y-4">
                {visibleSections.map((section) => (
                  <section key={section.key}>
                    <p className="px-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
                      {section.label}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {section.items.map((item) => (
                        <NavItem key={item.to} {...item} onSelect={() => setMobileNavOpen(false)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </nav>

          <div className="mt-auto border-t border-border/70 px-4 py-4 sm:px-5 lg:border-t-0">
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-sm font-semibold uppercase text-primary">
                {user?.name?.[0] || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || roleLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Keluar"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8 fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
