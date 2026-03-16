import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }) {
  return <div className={cn('skeleton h-4 w-full', className)} {...props} />
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-display font-bold text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="w-full lg:w-auto lg:flex-shrink-0">{action}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  )
}

export function StatCard({ title, value, sub, icon: Icon, trend, color = 'amber' }) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="stat-card bg-card rounded-xl border p-5">
      <div className="flex items-start justify-between">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colors[color])}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        {trend != null && (
          <span className={cn('text-xs font-medium tabular', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-display font-bold mt-1 tabular">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}
