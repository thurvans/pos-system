import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/lib/permissions'
import { Card, Button, Badge, Table, Th, Td, Modal, Input, Select, PageHeader, Empty, Spinner } from '@/components/ui'
import { formatRupiah } from '@/lib/utils'
import { Plus, Pencil, Search, Package, Tag, Trash2, Upload, ImagePlus, X } from 'lucide-react'

const VARIANT_CATEGORY_KEYWORDS = ['minuman']

const STATUS_BADGE = {
  true: ['green', 'Aktif'],
  false: ['rose', 'Nonaktif'],
}

const AVAILABILITY_BADGE = {
  true: ['green', 'Tersedia'],
  false: ['muted', 'Tidak tersedia'],
}

const resolveImg = (url) => {
  if (!url) return null
  if (String(url).startsWith('http')) return url
  return String(url).startsWith('/') ? url : `/${url}`
}

const canUseVariantPricing = (menu) => {
  const categoryName = String(menu?.category?.name || '').trim().toLowerCase()
  return VARIANT_CATEGORY_KEYWORDS.some((keyword) => categoryName.includes(keyword))
}

const priceValues = (rows = []) => (
  rows
    .map((row) => Number(row?.price || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
)

const resolveHppSummary = (menu) => menu?.hppSummary || menu?.hpp_summary || null

const minimumSellPrice = (menu) => {
  if (canUseVariantPricing(menu)) {
    const prices = (menu?.variants || []).flatMap((variant) => priceValues(variant.prices))
    return prices.length ? Math.min(...prices) : null
  }

  const prices = priceValues(menu?.prices)
  return prices.length ? Math.min(...prices) : null
}

const pricingSummary = (menu) => {
  if (canUseVariantPricing(menu)) {
    const variants = menu?.variants || []
    const prices = variants.flatMap((variant) => priceValues(variant.prices))
    if (variants.length === 0) return 'Belum ada varian'
    if (prices.length === 0) return `${variants.length} varian`
    return `${variants.length} varian, mulai ${formatRupiah(Math.min(...prices))}`
  }

  const prices = priceValues(menu?.prices)
  if (prices.length === 0) return 'Belum ada harga'
  if (prices.length === 1) return formatRupiah(prices[0])
  return `${formatRupiah(Math.min(...prices))} - ${formatRupiah(Math.max(...prices))}`
}

const buildVariantForm = (branches, variant = null) => ({
  id: variant?.id || null,
  name: variant?.name || '',
  sku: variant?.sku || '',
  branchPrices: Object.fromEntries(
    branches.map((branch) => {
      const row = (variant?.prices || []).find((item) => (item.branchId || item.branch_id) === branch.id)
      return [branch.id, row?.price != null ? String(row.price) : '']
    })
  ),
})

function MenuImageField({ menuId, currentUrl, pendingFile, onPendingFileChange }) {
  const qc = useQueryClient()
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(resolveImg(currentUrl))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (menuId) {
      setPreview(resolveImg(currentUrl))
    }
  }, [currentUrl, menuId])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setError('File harus berupa gambar')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => setPreview(event.target?.result || null)
    reader.readAsDataURL(file)
    setError('')

    if (!menuId) {
      onPendingFileChange?.(file)
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      await api.upload(`/products/${menuId}/image`, formData)
      qc.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [menuId, onPendingFileChange, qc])

  const handleDelete = async () => {
    if (!menuId) {
      setPreview(null)
      onPendingFileChange?.(null)
      return
    }

    setUploading(true)
    try {
      await api.delete(`/products/${menuId}/image`)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Foto Menu</p>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className="relative h-40 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 transition-all cursor-pointer overflow-hidden flex items-center justify-center"
      >
        {preview ? (
          <>
            <img src={preview} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/35 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1">
                <ImagePlus size={12} /> Ganti Foto
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={18} className="text-primary" />
            </div>
            <p className="text-sm font-medium">Klik untuk pilih foto menu</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {(preview || pendingFile) && (
        <button onClick={handleDelete} disabled={uploading} className="text-xs text-destructive flex items-center gap-1 hover:text-destructive/80 transition-colors disabled:opacity-50">
          <Trash2 size={12} /> Hapus foto
        </button>
      )}

      {error && <p className="text-xs text-destructive flex items-center gap-1"><X size={11} /> {error}</p>}
    </div>
  )
}

function ProductModal({ open, onClose, menu, categories }) {
  const qc = useQueryClient()
  const isEdit = Boolean(menu)
  const [form, setForm] = useState({ sku: '', name: '', description: '', categoryId: '' })
  const [pendingFile, setPendingFile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      sku: menu?.sku || '',
      name: menu?.name || '',
      description: menu?.description || '',
      categoryId: menu?.category?.id || '',
    })
    setPendingFile(null)
    setError('')
  }, [menu, open])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.sku.trim()) throw new Error('SKU wajib diisi')
      if (!form.name.trim()) throw new Error('Nama menu wajib diisi')

      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId || undefined,
      }

      if (isEdit) {
        return api.put(`/products/${menu.id}`, payload)
      }

      const saved = await api.post('/products', payload)
      if (pendingFile) {
        const formData = new FormData()
        formData.append('image', pendingFile)
        await api.upload(`/products/${saved.id}/image`, formData)
      }
      return saved
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Menu - ${menu?.name}` : 'Tambah Menu'}>
      <div className="space-y-4">
        <MenuImageField
          menuId={menu?.id}
          currentUrl={menu?.image_url || menu?.imageUrl}
          pendingFile={pendingFile}
          onPendingFileChange={setPendingFile}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="SKU *"
            value={form.sku}
            onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
            placeholder="MNM-001"
          />
          <Select
            label="Kategori"
            value={form.categoryId}
            onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
          >
            <option value="">Tanpa kategori</option>
            {(categories || []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </div>
        <Input
          label="Nama Menu *"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Es Teh Manis"
        />
        <Input
          label="Deskripsi"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Minuman segar..."
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {isEdit ? 'Simpan Perubahan' : 'Tambah Menu'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PricingModal({ open, onClose, menu, branches, canManageBasePrice, canManageVariants }) {
  const qc = useQueryClient()
  const [baseForm, setBaseForm] = useState({ branchId: branches[0]?.id || '', price: '' })
  const [variantForm, setVariantForm] = useState(buildVariantForm(branches))
  const [error, setError] = useState('')
  const usesVariants = canUseVariantPricing(menu)

  useEffect(() => {
    if (!open) return
    setBaseForm({ branchId: branches[0]?.id || '', price: '' })
    setVariantForm(buildVariantForm(branches))
    setError('')
  }, [branches, menu?.id, open])

  const finish = () => {
    qc.invalidateQueries({ queryKey: ['products'] })
    onClose()
  }

  const saveBasePrice = useMutation({
    mutationFn: () => api.put(`/products/${menu.id}/price`, {
      branchId: baseForm.branchId,
      price: Number(baseForm.price),
    }),
    onSuccess: finish,
    onError: (err) => setError(err.message),
  })

  const saveVariant = useMutation({
    mutationFn: async () => {
      if (!variantForm.name.trim()) throw new Error('Nama varian wajib diisi')

      const rows = Object.entries(variantForm.branchPrices)
        .filter(([, price]) => String(price).trim() !== '')
        .map(([branchId, price]) => ({ branchId, price: Number(price) }))

      if (!variantForm.id && rows.length === 0) {
        throw new Error('Minimal isi satu harga cabang untuk varian baru')
      }

      if (variantForm.id) {
        await api.put(`/menu/variants/${variantForm.id}`, {
          name: variantForm.name.trim(),
          sku: variantForm.sku.trim() || null,
        })
        for (const row of rows) {
          await api.put(`/menu/variants/${variantForm.id}/prices`, row)
        }
      } else {
        await api.post('/menu/variants', {
          productId: menu.id,
          name: variantForm.name.trim(),
          sku: variantForm.sku.trim() || undefined,
          branchPrices: rows,
        })
      }
    },
    onSuccess: finish,
    onError: (err) => setError(err.message),
  })

  const toggleVariant = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/menu/variants/${id}/availability`, { isActive }),
    onSuccess: finish,
    onError: (err) => setError(err.message),
  })

  const deleteVariant = useMutation({
    mutationFn: (id) => api.delete(`/menu/variants/${id}`),
    onSuccess: finish,
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={`Harga Menu - ${menu?.name}`} width="max-w-4xl">
      <div className="space-y-4">
        {usesVariants ? (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-semibold">Kategori minuman memakai harga per varian</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tambah, edit, hapus, dan atur harga varian langsung dari halaman Menu.
              </p>
            </div>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Varian Saat Ini</p>
                <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setVariantForm(buildVariantForm(branches))}>
                  Varian Baru
                </Button>
              </div>

              {!(menu?.variants || []).length ? (
                <Empty message="Belum ada varian untuk menu ini" />
              ) : (
                <div className="space-y-3">
                  {(menu?.variants || []).map((variant) => {
                    const active = Boolean(variant.is_active ?? variant.isActive ?? true)
                    return (
                      <div key={variant.id} className="rounded-xl border border-border px-4 py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{variant.name}</p>
                              <Badge variant={active ? 'green' : 'muted'}>
                                {active ? 'Aktif' : 'Nonaktif'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">SKU: {variant.sku || '-'}</p>
                            <div className="flex flex-wrap gap-2">
                              {(variant.prices || []).length === 0 ? (
                                <span className="text-xs text-muted-foreground">Belum ada harga cabang</span>
                              ) : (
                                (variant.prices || []).map((row) => (
                                  <span key={`${variant.id}-${row.branchId || row.branch_id}`} className="rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                                    {row.branch?.name || 'Cabang'}: {formatRupiah(row.price)}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              className="h-8 px-3 text-xs !min-w-0"
                              disabled={!canManageVariants}
                              onClick={() => setVariantForm(buildVariantForm(branches, variant))}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              className="h-8 px-3 text-xs !min-w-0"
                              loading={toggleVariant.isPending && toggleVariant.variables?.id === variant.id}
                              disabled={!canManageVariants}
                              onClick={() => toggleVariant.mutate({ id: variant.id, isActive: !active })}
                            >
                              {active ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                            <Button
                              variant="danger"
                              className="h-8 px-3 text-xs !min-w-0"
                              loading={deleteVariant.isPending && deleteVariant.variables === variant.id}
                              disabled={!canManageVariants}
                              onClick={() => {
                                if (window.confirm(`Hapus varian "${variant.name}"?`)) {
                                  deleteVariant.mutate(variant.id)
                                }
                              }}
                            >
                              Hapus
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">{variantForm.id ? 'Edit Varian' : 'Tambah Varian Baru'}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Nama Varian"
                  value={variantForm.name}
                  onChange={(event) => setVariantForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Large"
                />
                <Input
                  label="SKU Varian"
                  value={variantForm.sku}
                  onChange={(event) => setVariantForm((prev) => ({ ...prev, sku: event.target.value }))}
                  placeholder="MNM-001-L"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {branches.map((branch) => (
                  <Input
                    key={branch.id}
                    label={`Harga ${branch.name}`}
                    type="number"
                    value={variantForm.branchPrices[branch.id] || ''}
                    onChange={(event) => setVariantForm((prev) => ({
                      ...prev,
                      branchPrices: {
                        ...prev.branchPrices,
                        [branch.id]: event.target.value,
                      },
                    }))}
                    placeholder="15000"
                  />
                ))}
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Harga Menu per Cabang</p>
            {!(menu?.prices || []).length ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Belum ada harga cabang untuk menu ini.
              </div>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border/50 mb-4">
                {(menu?.prices || []).map((row) => {
                  const branch = branches.find((item) => item.id === (row.branchId || row.branch_id))
                  return (
                    <div key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-muted-foreground">{branch?.name || row.branchId || row.branch_id}</span>
                      <span className="font-medium font-mono">{formatRupiah(row.price)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
              <Select
                label="Cabang"
                value={baseForm.branchId}
                onChange={(event) => setBaseForm((prev) => ({ ...prev, branchId: event.target.value }))}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
              <Input
                label="Harga"
                type="number"
                value={baseForm.price}
                onChange={(event) => setBaseForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="15000"
              />
              <div className="flex items-end">
                <Button
                  className="w-full"
                  loading={saveBasePrice.isPending}
                  disabled={!canManageBasePrice || !baseForm.branchId || baseForm.price === ''}
                  onClick={() => saveBasePrice.mutate()}
                >
                  Simpan Harga
                </Button>
              </div>
            </div>
          </Card>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {usesVariants ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Tutup</Button>
            <Button
              className="flex-1"
              loading={saveVariant.isPending}
              disabled={!canManageVariants || !variantForm.name.trim()}
              onClick={() => saveVariant.mutate()}
            >
              {variantForm.id ? 'Simpan Varian' : 'Tambah Varian'}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Tutup</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function CategoryManagerModal({ open, onClose, categories = [] }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ id: null, name: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({ id: null, name: '' })
    setError('')
  }, [open])

  const saveCategory = useMutation({
    mutationFn: () => {
      const name = form.name.trim()
      if (!name) throw new Error('Nama kategori wajib diisi')
      return form.id ? api.put(`/categories/${form.id}`, { name }) : api.post('/categories', { name })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setForm({ id: null, name: '' })
      setError('')
    },
    onError: (err) => setError(err.message),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.put(`/categories/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Kelola Kategori Menu" width="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Contoh: Minuman" />
          <Button variant="secondary" onClick={() => setForm({ id: null, name: '' })} disabled={saveCategory.isPending}>Reset</Button>
          <Button onClick={() => saveCategory.mutate()} loading={saveCategory.isPending}>{form.id ? 'Simpan' : 'Tambah'}</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="border border-border rounded-lg overflow-hidden">
          {categories.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Belum ada kategori</div>
          ) : (
            <div className="divide-y divide-border/50 max-h-[320px] overflow-y-auto">
              {[...categories].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))).map((category) => {
                const active = Boolean(category.is_active ?? category.isActive ?? true)
                return (
                  <div key={category.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{category.name}</p>
                      <p className="text-xs text-muted-foreground">{category.productCount || 0} menu</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={active ? 'green' : 'muted'}>
                        {active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setForm({ id: category.id, name: category.name || '' })}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-7 px-2 text-xs !min-w-0"
                        loading={toggleActive.isPending && toggleActive.variables?.id === category.id}
                        onClick={() => toggleActive.mutate({ id: category.id, isActive: !active })}
                      >
                        {active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function ProductsPage() {
  const qc = useQueryClient()
  const { hasPermission } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [pricingModal, setPricingModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(false)

  const canManageItems = hasPermission(PERMISSIONS.MENU_ITEM_MANAGE)
  const canManageCategories = hasPermission(PERMISSIONS.MENU_CATEGORY_MANAGE)
  const canManageVariants = hasPermission(PERMISSIONS.MENU_VARIANT_MANAGE)

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' })
      if (search.trim()) params.set('q', search.trim())
      if (categoryFilter) params.set('category_id', categoryFilter)
      return api.get(`/products?${params.toString()}`)
    },
  })

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories', canManageCategories],
    queryFn: () => api.get(`/categories${canManageCategories ? '?include_inactive=true' : ''}`),
  })

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }) => api.patch(`/products/${id}/availability`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const menus = data?.data || []
  const stats = useMemo(() => {
    const variantMenus = menus.filter((menu) => canUseVariantPricing(menu)).length
    const fullyCostedMenus = menus.filter((menu) => resolveHppSummary(menu)?.fullyCosted).length
    const needsPrice = menus.filter((menu) => {
      if (canUseVariantPricing(menu)) {
        return (menu.variants || []).every((variant) => priceValues(variant.prices).length === 0)
      }
      return priceValues(menu.prices).length === 0
    }).length

    return [
      { label: 'Total Menu', value: menus.length },
      { label: 'Pakai Varian', value: variantMenus },
      { label: 'HPP Lengkap', value: fullyCostedMenus },
      { label: 'Perlu Harga', value: needsPrice },
    ]
  }, [menus])

  return (
    <div>
      <PageHeader
        title="Menu"
        subtitle={`${menus.length} menu ditemukan. Kategori minuman sekarang bisa langsung diatur harga variannya dari halaman ini.`}
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canManageCategories && <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={() => setCategoryModal(true)}>Kelola Kategori</Button>}
            <Button className="w-full justify-center sm:w-auto" onClick={() => setModal('add')} disabled={!canManageItems}>
              <Plus size={14} className="mr-1" /> Tambah Menu
            </Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {stats.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold mt-2">{item.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 md:flex-1 md:min-w-[220px]">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama menu atau SKU..."
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary md:w-auto md:min-w-[220px]"
        >
          <option value="">Semua Kategori</option>
          {(categories || []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.productCount || 0}){(category.is_active ?? category.isActive) === false ? ' - nonaktif' : ''}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {isLoading ? <Spinner /> : menus.length === 0 ? (
          <Empty message="Belum ada menu" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Menu</Th>
                <Th>SKU</Th>
                <Th>Kategori</Th>
                <Th>Harga / HPP</Th>
                <Th>Status</Th>
                <Th>Ketersediaan</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {menus.map((menu) => {
                const active = Boolean(menu.is_active ?? menu.isActive ?? true)
                const available = Boolean(menu.is_available ?? menu.isAvailable ?? true)
                const [statusVariant, statusLabel] = STATUS_BADGE[String(active)] || ['muted', '-']
                const [availabilityVariant, availabilityLabel] = AVAILABILITY_BADGE[String(available)] || ['muted', '-']
                const imgUrl = resolveImg(menu.image_url || menu.imageUrl)
                const usesVariants = canUseVariantPricing(menu)
                const canOpenPricing = usesVariants ? canManageVariants : canManageItems
                const hppSummary = resolveHppSummary(menu)
                const minSellPrice = minimumSellPrice(menu)
                const estimatedCost = Number(hppSummary?.estimatedCost || 0)
                const marginValue = minSellPrice != null ? (minSellPrice - estimatedCost) : null
                const marginPct = minSellPrice && Number.isFinite(marginValue)
                  ? Math.round((marginValue / minSellPrice) * 100)
                  : null

                return (
                  <tr key={menu.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          {imgUrl ? (
                            <img src={imgUrl} className="w-full h-full object-cover" alt="" onError={(event) => { event.target.style.display = 'none' }} />
                          ) : (
                            <Package size={14} className="text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">{menu.name}</p>
                          {menu.description && <p className="text-xs text-muted-foreground truncate max-w-[220px]">{menu.description}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td><span className="font-mono text-xs text-muted-foreground">{menu.sku}</span></Td>
                    <Td>
                      {menu.category ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-accent/50 px-2 py-0.5 rounded-md">
                          <Tag size={10} /> {menu.category.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </Td>
                    <Td>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{pricingSummary(menu)}</p>
                        {usesVariants && <p className="text-xs text-muted-foreground">Harga mengikuti varian</p>}
                        {hppSummary?.recipeConfigured && (
                          <p className="text-xs text-muted-foreground">
                            HPP est. {formatRupiah(estimatedCost)}
                          </p>
                        )}
                        {hppSummary?.recipeConfigured && hppSummary?.missingCostCount > 0 && (
                          <p className="text-[11px] text-amber-400">
                            {hppSummary.missingCostCount} bahan belum punya cost
                          </p>
                        )}
                        {hppSummary?.fullyCosted && marginValue != null && (
                          <p className={`text-[11px] ${marginValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            Margin est. {formatRupiah(marginValue)}{marginPct != null ? ` (${marginPct}%)` : ''}
                          </p>
                        )}
                      </div>
                    </Td>
                    <Td><Badge variant={statusVariant}>{statusLabel}</Badge></Td>
                    <Td><Badge variant={availabilityVariant}>{availabilityLabel}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setPricingModal(menu)}
                          disabled={!canOpenPricing}
                          className="px-2 py-1 text-xs rounded bg-accent/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {usesVariants ? 'Varian' : 'Harga'}
                        </button>
                        <button
                          onClick={() => setModal(menu)}
                          disabled={!canManageItems}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
                          title="Edit menu"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleAvailability.mutate({ id: menu.id, isAvailable: !available })}
                          disabled={!canManageItems || toggleAvailability.isPending}
                          className="px-2 py-1 text-xs rounded bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          title="Ubah ketersediaan"
                        >
                          {available ? 'Tutup' : 'Buka'}
                        </button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ProductModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        menu={modal === 'add' ? null : modal}
        categories={(categories || []).filter((category) => (category.is_active ?? category.isActive ?? true))}
      />

      {pricingModal && (
        <PricingModal
          open={Boolean(pricingModal)}
          onClose={() => setPricingModal(null)}
          menu={pricingModal}
          branches={branches || []}
          canManageBasePrice={canManageItems}
          canManageVariants={canManageVariants}
        />
      )}

      <CategoryManagerModal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        categories={categories || []}
      />
    </div>
  )
}
