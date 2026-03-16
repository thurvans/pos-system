import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Minus, CheckCircle, XCircle, Calendar } from 'lucide-react'
import { shiftApi, branchApi } from '@/api'
import { formatRupiah, formatDateTime, toISODate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Skeleton, StatCard } from '@/components/ui/shared'
import { toast } from '@/components/ui/toast'

function SummaryDialog({ shiftId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['shift-summary', shiftId],
    queryFn: () => shiftApi.summary(shiftId),
    enabled: !!shiftId,
  })

  const summary = data?.summary
  const shift = data?.shift

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Ringkasan Shift</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} />)}</div>
      ) : summary ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Order</p>
              <p className="text-2xl font-bold tabular">{summary.totalOrders}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Penjualan</p>
              <p className="text-xl font-bold tabular text-primary">{formatRupiah(summary.totalSales)}</p>
            </div>
          </div>

          {Object.entries(summary.paymentBreakdown || {}).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Metode Pembayaran</p>
              {Object.entries(summary.paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex justify-between py-1">
                  <span className="text-muted-foreground">{method}</span>
                  <span className="tabular font-medium">{formatRupiah(amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="h-px bg-border" />

          <div className="space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Modal Awal</span><span className="tabular">{formatRupiah(shift?.openingCash)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Penjualan Cash</span><span className="tabular text-green-600">+{formatRupiah(summary.cashSales)}</span></div>
            {summary.cashIn > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Cash In</span><span className="tabular text-green-600">+{formatRupiah(summary.cashIn)}</span></div>}
            {summary.cashOut > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Cash Out</span><span className="tabular text-red-500">-{formatRupiah(summary.cashOut)}</span></div>}
            {shift?.closingCash != null && (
              <>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between font-semibold"><span>Kas Aktual</span><span className="tabular">{formatRupiah(shift.closingCash)}</span></div>
                <div className="flex justify-between font-semibold"><span>Selisih</span>
                  <span className={`tabular ${summary.cashDifference >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {summary.cashDifference >= 0 ? '+' : ''}{formatRupiah(summary.cashDifference)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </DialogContent>
  )
}

export default function ShiftsPage() {
  const [date, setDate] = useState(toISODate())
  const [selectedBranch, setSelectedBranch] = useState('')
  const [summaryShiftId, setSummaryShiftId] = useState(null)
  const [cashDialog, setCashDialog] = useState(null)
  const [cashForm, setCashForm] = useState({ type: 'CASH_IN', amount: '', note: '' })
  const qc = useQueryClient()

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const { data, isLoading } = useQuery({
    queryKey: ['shifts', date, selectedBranch],
    queryFn: () => shiftApi.list({ date, branch_id: selectedBranch || undefined, limit: 50 }),
    staleTime: 15000,
  })

  const cashMutation = useMutation({
    mutationFn: ({ id, body }) => shiftApi.cashInOut(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast({ title: 'Kas dicatat', variant: 'success' })
      setCashDialog(null)
      setCashForm({ type: 'CASH_IN', amount: '', note: '' })
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  const shifts = data?.data || []
  const openShifts = shifts.filter(s => s.status === 'OPEN')

  return (
    <div>
      <PageHeader title="Shift" description="Manajemen shift kasir" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="Shift Aktif" value={openShifts.length} icon={Clock} color="green" />
        <StatCard title="Shift Selesai" value={shifts.filter(s => s.status === 'CLOSED').length} icon={CheckCircle} color="blue" />
        <StatCard title="Total Shift" value={shifts.length} icon={Clock} color="amber" />
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="date" className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
          <option value="">Semua Cabang</option>
          {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : shifts.length === 0 ? (
            <EmptyState icon={Clock} title="Belum ada shift" description="Tidak ada shift pada tanggal ini" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kasir</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Buka</TableHead>
                  <TableHead>Tutup</TableHead>
                  <TableHead>Modal Awal</TableHead>
                  <TableHead>Kas Akhir</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map(shift => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-medium">{shift.user?.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{shift.branch?.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(shift.openedAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{shift.closedAt ? formatDateTime(shift.closedAt) : '—'}</TableCell>
                    <TableCell><span className="tabular">{formatRupiah(shift.openingCash)}</span></TableCell>
                    <TableCell><span className="tabular">{shift.closingCash ? formatRupiah(shift.closingCash) : '—'}</span></TableCell>
                    <TableCell>
                      <Badge variant={shift.status === 'OPEN' ? 'success' : 'secondary'}>
                        {shift.status === 'OPEN' ? 'Aktif' : 'Selesai'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setSummaryShiftId(shift.id)}>Ringkasan</Button>
                        {shift.status === 'OPEN' && (
                          <Button variant="ghost" size="sm" onClick={() => setCashDialog(shift)}>Kas</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!summaryShiftId} onOpenChange={() => setSummaryShiftId(null)}>
        {summaryShiftId && <SummaryDialog shiftId={summaryShiftId} />}
      </Dialog>

      <Dialog open={!!cashDialog} onOpenChange={() => setCashDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Cash In / Out</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium">{cashDialog?.user?.name}</p>
              <p className="text-muted-foreground">{cashDialog?.branch?.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['CASH_IN', 'CASH_OUT'].map(type => (
                <button
                  key={type}
                  onClick={() => setCashForm(p => ({ ...p, type }))}
                  className={`flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-all ${cashForm.type === type ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted/50'}`}
                >
                  {type === 'CASH_IN' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {type === 'CASH_IN' ? 'Cash In' : 'Cash Out'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Jumlah</label>
              <Input type="number" placeholder="Rp 50.000" value={cashForm.amount} onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Keterangan (wajib)</label>
              <Input placeholder="Beli plastik, titipan, dll" value={cashForm.note} onChange={e => setCashForm(p => ({ ...p, note: e.target.value }))} />
            </div>
            <Button
              className="w-full"
              onClick={() => cashMutation.mutate({ id: cashDialog.id, body: { ...cashForm, amount: Number(cashForm.amount) } })}
              disabled={cashMutation.isPending || !cashForm.amount || !cashForm.note}
            >
              {cashMutation.isPending ? 'Menyimpan...' : 'Catat'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
