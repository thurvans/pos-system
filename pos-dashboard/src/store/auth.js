import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: (() => {
    try { return JSON.parse(localStorage.getItem('pos_user')) } catch { return null }
  })(),
  token: localStorage.getItem('pos_token'),

  setAuth: (user, token) => {
    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(user))
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!localStorage.getItem('pos_token'),
}))

export default useAuthStore
