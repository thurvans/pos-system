import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProductsPage from '@/pages/products/ProductsPage'
import BranchesPage from '@/pages/branches/BranchesPage'
import UsersPage from '@/pages/users/UsersPage'
import RolePermissionsPage from '@/pages/users/RolePermissionsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import ShiftsPage from '@/pages/shifts/ShiftsPage'
import OrdersPage from '@/pages/orders/OrdersPage'
import DownloadPage from '@/pages/downloads/DownloadPage'
import MenuAdvancedPage from '@/pages/menu/MenuAdvancedPage'
import PromotionsPage from '@/pages/promotions/PromotionsPage'
import AuditLogsPage from '@/pages/audit/AuditLogsPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import ShiftSchedulesPage from '@/pages/shifts/ShiftSchedulesPage'
import CostingPage from '@/pages/costing/CostingPage'
import {
  COSTING_PERMISSIONS,
  DASHBOARD_PERMISSIONS,
  MENU_ADVANCED_PERMISSIONS,
  MENU_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_SETTINGS_PERMISSIONS,
} from '@/lib/permissions'

function Guard({ children, roles, anyPermissions, allPermissions, fallback = '/forbidden' }) {
  const { user, loading, hasAnyPermission, hasAllPermissions } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
      Memuat...
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={fallback} replace />
  if (anyPermissions && !hasAnyPermission(anyPermissions)) return <Navigate to={fallback} replace />
  if (allPermissions && !hasAllPermissions(allPermissions)) return <Navigate to={fallback} replace />
  return children
}

function ForbiddenPage() {
  return (
    <div className="max-w-xl mx-auto py-12">
      <h1 className="text-lg font-semibold text-foreground">Akses Dibatasi</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Akun ini belum memiliki permission untuk membuka halaman tersebut.
      </p>
    </div>
  )
}

function AppRoutes() {
  const { user, hasAnyPermission, hasPermission } = useAuth()

  const homePath = (() => {
    if (!user) return '/login'
    if (hasAnyPermission(DASHBOARD_PERMISSIONS)) return '/'
    if (hasAnyPermission(ORDER_PERMISSIONS)) return '/orders'
    if (hasPermission(PERMISSIONS.FINANCE_REPORT_VIEW)) return '/reports'
    if (hasPermission(PERMISSIONS.PROMO_MANAGE)) return '/promotions'
    if (hasPermission(PERMISSIONS.SHIFT_RECAP_VIEW)) return '/shifts'
    if (hasPermission(PERMISSIONS.EMPLOYEE_SHIFT_MANAGE)) return '/shift-schedules'
    if (hasAnyPermission(MENU_PERMISSIONS)) return '/menu'
    if (hasAnyPermission(COSTING_PERMISSIONS)) return '/cost-hpp'
    if (hasAnyPermission(MENU_ADVANCED_PERMISSIONS)) return '/menu-advanced'
    if (hasPermission(PERMISSIONS.AUDIT_LOG_VIEW)) return '/audit-logs'
    if (hasAnyPermission(SYSTEM_SETTINGS_PERMISSIONS)) return '/settings'
    if (hasPermission(PERMISSIONS.EMPLOYEE_MANAGE)) return '/users'
    if (user.role === 'SUPER_ADMIN') return '/branches'
    return '/downloads'
  })()

  const fallbackFor = (target) => (homePath === target ? '/forbidden' : homePath)

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath} replace /> : <LoginPage />} />
      <Route path="/welcome" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route
          index
          element={homePath === '/'
            ? (
              <Guard anyPermissions={DASHBOARD_PERMISSIONS}>
                <DashboardPage />
              </Guard>
            )
            : <Navigate to={homePath} replace />
          }
        />
        <Route
          path="orders"
          element={(
            <Guard anyPermissions={ORDER_PERMISSIONS} fallback={fallbackFor('/orders')}>
              <OrdersPage />
            </Guard>
          )}
        />
        <Route
          path="reports"
          element={(
            <Guard anyPermissions={[PERMISSIONS.FINANCE_REPORT_VIEW]} fallback={fallbackFor('/reports')}>
              <ReportsPage />
            </Guard>
          )}
        />
        <Route
          path="shifts"
          element={(
            <Guard anyPermissions={[PERMISSIONS.SHIFT_RECAP_VIEW]} fallback={fallbackFor('/shifts')}>
              <ShiftsPage />
            </Guard>
          )}
        />
        <Route
          path="menu"
          element={(
            <Guard anyPermissions={MENU_PERMISSIONS} fallback={fallbackFor('/menu')}>
              <ProductsPage />
            </Guard>
          )}
        />
        <Route path="products" element={<Navigate to="/menu" replace />} />
        <Route
          path="menu-advanced"
          element={(
            <Guard anyPermissions={MENU_ADVANCED_PERMISSIONS} fallback={fallbackFor('/menu-advanced')}>
              <MenuAdvancedPage />
            </Guard>
          )}
        />
        <Route
          path="cost-hpp"
          element={(
            <Guard anyPermissions={COSTING_PERMISSIONS} fallback={fallbackFor('/cost-hpp')}>
              <CostingPage />
            </Guard>
          )}
        />
        <Route
          path="promotions"
          element={(
            <Guard anyPermissions={[PERMISSIONS.PROMO_MANAGE]} fallback={fallbackFor('/promotions')}>
              <PromotionsPage />
            </Guard>
          )}
        />
        <Route
          path="shift-schedules"
          element={(
            <Guard anyPermissions={[PERMISSIONS.EMPLOYEE_SHIFT_MANAGE]} fallback={fallbackFor('/shift-schedules')}>
              <ShiftSchedulesPage />
            </Guard>
          )}
        />
        <Route
          path="audit-logs"
          element={(
            <Guard anyPermissions={[PERMISSIONS.AUDIT_LOG_VIEW]} fallback={fallbackFor('/audit-logs')}>
              <AuditLogsPage />
            </Guard>
          )}
        />
        <Route
          path="settings"
          element={(
            <Guard anyPermissions={SYSTEM_SETTINGS_PERMISSIONS} fallback={fallbackFor('/settings')}>
              <SettingsPage />
            </Guard>
          )}
        />
        <Route path="downloads" element={<DownloadPage />} />
        <Route
          path="branches"
          element={(
            <Guard roles={['SUPER_ADMIN']} fallback={fallbackFor('/branches')}>
              <BranchesPage />
            </Guard>
          )}
        />
        <Route
          path="users"
          element={(
            <Guard anyPermissions={[PERMISSIONS.EMPLOYEE_MANAGE]} fallback={fallbackFor('/users')}>
              <UsersPage />
            </Guard>
          )}
        />
        <Route
          path="role-permissions"
          element={(
            <Guard roles={['SUPER_ADMIN']} fallback={fallbackFor('/role-permissions')}>
              <RolePermissionsPage />
            </Guard>
          )}
        />
        <Route path="forbidden" element={<ForbiddenPage />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? homePath : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><AppRoutes /></AuthProvider>
    </BrowserRouter>
  )
}
