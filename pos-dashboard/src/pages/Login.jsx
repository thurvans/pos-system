import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api'
import useAuthStore from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(form)
      setAuth(res.user, res.accessToken)
      navigate('/')
    } catch (err) {
      setError(err?.error || 'Email atau password salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-[420px] flex-shrink-0 bg-sidebar flex-col justify-between p-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-lg text-white">POS System</span>
        </div>

        <div>
          <h2 className="font-display font-bold text-3xl text-white leading-tight">
            Kelola toko<br />lebih efisien.
          </h2>
          <p className="text-white/40 text-sm mt-3 leading-relaxed">
            Dashboard lengkap untuk kasir, laporan penjualan, dan manajemen multi-cabang.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Multi Cabang', desc: 'Kelola semua toko' },
            { label: 'Real-time', desc: 'Sinkron otomatis' },
            { label: 'Laporan', desc: 'Analitik lengkap' },
            { label: 'Xendit', desc: 'QRIS & VA terintegrasi' },
          ].map((f) => (
            <div key={f.label} className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-xs font-semibold text-white">{f.label}</p>
              <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold">Masuk ke Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Gunakan akun yang diberikan oleh admin</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="admin@pos.com"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : 'Masuk'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Demo: <span className="font-mono">admin@pos.com</span> / <span className="font-mono">admin123</span>
          </p>
        </div>
      </div>
    </div>
  )
}
