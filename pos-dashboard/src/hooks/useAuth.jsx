import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api } from '@/api/client'

const AuthContext = createContext(null)

const normalizeUser = (value) => {
  if (!value) return null
  return {
    ...value,
    permissions: Array.isArray(value.permissions) ? value.permissions : [],
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me')
      .then((data) => setUser(normalizeUser(data)))
      .catch(() => {
        localStorage.removeItem('token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.accessToken)
    const normalized = normalizeUser(data.user)
    setUser(normalized)
    return normalized
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const permissionSet = useMemo(() => new Set(user?.permissions || []), [user?.permissions])

  const hasPermission = useCallback((permission) => {
    if (!permission) return true
    if (!user) return false
    if (user.role === 'SUPER_ADMIN') return true
    return permissionSet.has(permission)
  }, [permissionSet, user])

  const hasAnyPermission = useCallback((permissions = []) => {
    if (!permissions?.length) return true
    return permissions.some((permission) => hasPermission(permission))
  }, [hasPermission])

  const hasAllPermissions = useCallback((permissions = []) => {
    if (!permissions?.length) return true
    return permissions.every((permission) => hasPermission(permission))
  }, [hasPermission])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
