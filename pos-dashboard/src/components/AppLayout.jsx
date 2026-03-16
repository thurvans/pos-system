import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import useAuthStore from '@/store/auth'

export default function AppLayout() {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-56 overflow-y-auto">
        <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
