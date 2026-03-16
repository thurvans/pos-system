import { cn } from '@/lib/utils'
import { Loader2, X } from 'lucide-react'

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card', className)} {...props}>
      {children}
    </div>
  )
}

const badgeVariants = {
  green: 'badge-green',
  amber: 'badge-amber',
  rose: 'badge-rose',
  blue: 'badge-blue',
  muted: 'badge-muted',
}

export function Badge({ variant = 'muted', className, children }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', badgeVariants[variant], className)}>
      {children}
    </span>
  )
}

const btnBase = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50'
const btnVariants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  danger: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-white',
  outline: 'border border-border text-foreground hover:bg-accent',
}

export function Button({ variant = 'primary', loading, className, children, disabled, ...props }) {
  return (
    <button className={cn(btnBase, btnVariants[variant], className)} disabled={loading || disabled} {...props}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <input
        className={cn(
          'w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
          'transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          error && 'border-destructive focus:ring-destructive',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function Select({ label, error, children, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <select
        className={cn(
          'w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground',
          'transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function Table({ children, className, tableClassName }) {
  return (
    <div className={cn('relative w-full overflow-x-auto overscroll-x-contain', className)}>
      <table className={cn('w-full min-w-[680px] text-sm sm:min-w-full', tableClassName)}>{children}</table>
    </div>
  )
}

export function Th({ children, className }) {
  return <th className={cn('border-b border-border px-4 py-3 text-left text-xs font-medium text-muted-foreground', className)}>{children}</th>
}

export function Td({ children, className }) {
  return <td className={cn('border-b border-border/50 px-4 py-3', className)}>{children}</td>
}

export function Modal({ open, onClose, title, children, width = 'max-w-md' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl fade-in sm:max-h-[calc(100vh-2rem)] sm:rounded-xl', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, trend, color = 'green', loading }) {
  const colors = {
    green: 'bg-emerald-400/10 text-emerald-400',
    amber: 'bg-amber-400/10 text-amber-400',
    blue: 'bg-blue-400/10 text-blue-400',
    rose: 'bg-rose-400/10 text-rose-400',
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', colors[color])}>
            <Icon size={15} />
          </div>
        )}
      </div>
      {loading ? (
        <div className="mb-1 h-7 w-32 rounded shimmer" />
      ) : (
        <p className="money text-2xl font-bold tracking-tight">{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {trend != null && (
        <p className={cn('mt-2 text-xs font-medium', trend >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
          {trend >= 0 ? 'UP' : 'DOWN'} {Math.abs(trend)}% vs kemarin
        </p>
      )}
    </Card>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action ? <div className="w-full lg:w-auto lg:flex-shrink-0">{action}</div> : null}
    </div>
  )
}

export function Empty({ message = 'Tidak ada data' }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{message}</div>
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
}
