import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitive.Provider
const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn('fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-[360px] flex-col gap-2', className)}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

const Toast = React.forwardRef(({ className, variant = 'default', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-lg transition-all',
      'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full',
      variant === 'success' && 'border-green-200 bg-green-50 text-green-900',
      variant === 'error' && 'border-red-200 bg-red-50 text-red-900',
      variant === 'default' && 'border bg-background text-foreground',
      className
    )}
    {...props}
  />
))
Toast.displayName = ToastPrimitive.Root.displayName

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn('absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5', className)}
    {...props}
  >
    <X className="h-3 w-3" />
  </ToastPrimitive.Close>
))
ToastClose.displayName = ToastPrimitive.Close.displayName

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
))
const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn('text-xs opacity-80', className)} {...props} />
))

// Simple toast store
const toastState = { toasts: [], listeners: [] }
let toastId = 0

export function toast({ title, description, variant = 'default' }) {
  const id = ++toastId
  toastState.toasts.push({ id, title, description, variant, open: true })
  toastState.listeners.forEach(fn => fn([...toastState.toasts]))
  setTimeout(() => {
    toastState.toasts = toastState.toasts.filter(t => t.id !== id)
    toastState.listeners.forEach(fn => fn([...toastState.toasts]))
  }, 4000)
}

export function Toaster() {
  const [toasts, setToasts] = React.useState([])
  React.useEffect(() => {
    toastState.listeners.push(setToasts)
    return () => { toastState.listeners = toastState.listeners.filter(l => l !== setToasts) }
  }, [])

  return (
    <ToastProvider>
      {toasts.map(t => (
        <Toast key={t.id} variant={t.variant}>
          <div className="flex-shrink-0 mt-0.5">
            {t.variant === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
            {t.variant === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
            {t.variant === 'default' && <Info className="h-4 w-4 text-blue-600" />}
          </div>
          <div className="flex-1 min-w-0">
            {t.title && <ToastTitle>{t.title}</ToastTitle>}
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
