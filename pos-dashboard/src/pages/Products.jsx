import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Tag, Package } from 'lucide-react'
import { productApi, branchApi } from '@/api'
import { formatRupiah } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/shared'
import { toast } from '@/components/ui/toast'

function ProductForm({ product, branches, onSave, onClose }) {
  const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    description: product?.description || '',
  })
  const [priceForm, setPriceForm] = useState({ branchId: '', price: '' })
  const qc = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: (body) => product ? productApi.update(product.id, body) : productApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast({ title: `Produk ${product ? 'diperbarui' : 'ditambahkan'}`, variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  const priceMutation = useMutation({
    mutationFn: ({ id, body }) => productApi.setPrice(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast({ title: 'Harga diperbarui', variant: 'success' })
      setPriceForm({ branchId: '', price: '' })
    },
    onError: (e) => toast({ title: 'Gagal', description: e?.error, variant: 'error' }),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">SKU</label>
          <Input placeholder="MNM-001" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nama Produk</label>
          <Input placeholder="Es Teh Manis" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Deskripsi</label>
        <Input placeholder="Opsional" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      <Button className="w-full" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.sku}>
        {saveMutation.isPending ? 'Menyimpan...' : product ? 'Perbarui Produk' : 'Tambah Produk'}
      </Button>

      {product && (
        <>
          <div className="h-px bg-border" />
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Set Harga Per Cabang</p>
            <div className="flex gap-2">
              <select
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={priceForm.branchId}
                onChange={e => setPriceForm(p => ({ ...p, branchId: e.target.value }))}
              >
                <option value="">Pilih cabang</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <Input
                type="number"
                placeholder="Harga"
                className="w-32"
                value={priceForm.price}
                onChange={e => setPriceForm(p => ({ ...p, price: e.target.value }))}
              />
              <Button
                size="sm"
                onClick={() => priceMutation.mutate({ id: product.id, body: { branchId: priceForm.branchId, price: Number(priceForm.price) } })}
                disabled={!priceForm.branchId || !priceForm.price || priceMutation.isPending}
              >
                <Tag className="w-3.5 h-3.5" />
              </Button>
            </div>
            {product.prices?.length > 0 && (
              <div className="mt-2 space-y-1">
                {product.prices.map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    <span>{branches?.find(b => b.id === p.branchId)?.name || p.branchId}</span>
                    <span className="font-medium text-foreground tabular">{formatRupiah(p.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productApi.list({ q: search || undefined, limit: 100 }),
    staleTime: 30000,
  })

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: branchApi.list })

  const products = productsData?.data || []

  const openAdd = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (p) => { setSelected(p); setDialogOpen(true) }

  return (
    <div>
      <PageHeader
        title="Produk"
        description={`${products.length} produk terdaftar`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Tambah Produk
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nama produk..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="Belum ada produk" description="Klik Tambah Produk untuk mulai" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><span className="font-mono text-xs text-muted-foreground">{p.sku}</span></TableCell>
                    <TableCell><span className="font-medium">{p.name}</span></TableCell>
                    <TableCell>{p.category?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {p.prices?.length > 0
                        ? <span className="tabular font-medium">{formatRupiah(p.prices[0].price)}</span>
                        : <Badge variant="warning">Belum ada harga</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'success' : 'secondary'}>
                        {p.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit Produk' : 'Tambah Produk'}</DialogTitle>
            <DialogDescription>
              {selected ? `Mengedit: ${selected.name}` : 'Isi detail produk baru'}
            </DialogDescription>
          </DialogHeader>
          <ProductForm product={selected} branches={branches} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
