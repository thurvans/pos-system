import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, GitBranch, Users, BarChart3,
  ShoppingBag, Clock, LogOut, ChevronRight, Zap
} from 'lucide-react'
import useAuthStore from '@/store/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/reports', icon: BarChart3, label: 'Laporan' },
  { to: '/orders', icon: ShoppingBag, label: 'Transaksi' },
  { to: '/shifts', icon: Clock, label: 'Shift' },
  { divider: true },
  { to: '/products', icon: Package, label: 'Produk' },
  { to: '/branches', icon: GitBranch, label: 'Cabang' },
  { to: '/users', icon: Users, label: 'Pengguna' },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col bg-sidebar text-sidebar-foreground z-40 border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-display font-bold text-sm text-sidebar-foreground leading-none">POS System</p>
          <p className="text-xs text-sidebar-foreground/40 mt-0.5 font-mono">v1.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item, i) => {
          if (item.divider) {
            return <div key={i} className="h-px bg-sidebar-border my-3 mx-1" />
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium nav-active'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50')} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary/50" />}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{user?.name?.[0] || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-sidebar-foreground/40 capitalize">{user?.role?.toLowerCase().replace('_', ' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
