import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Beaker, Calculator, PackageSearch, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/lib/permissions'
import { Button, Empty, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { formatDateTime, formatNumber, formatRupiah } from '@/lib/utils'

const createRecipeRow = () => ({ ingredientId: '', quantity: '1', lossFactor: '0' })
const DRINK_CATEGORY_KEYWORD = 'minuman'
const readBranchQuery = (branchId) => {
  const params = new URLSearchParams()
  if (branchId) params.set('branch_id', branchId)
  return params.toString()
}
const priceValues = (rows = []) => (
  rows
    .map((row) => Number(row?.price || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
)
const isVariantActive = (variant) => Boolean(variant?.isActive ?? variant?.is_active ?? true)
const isDrinkCategory = (product) => String(product?.category?.name || '').trim().toLowerCase().includes(DRINK_CATEGORY_KEYWORD)
const getRecipeVariants = (product) => (product?.variants || []).filter(isVariantActive)
const getProductHppSummary = (product) => product?.hppSummary || product?.hpp_summary || null
const getVariantHppSummary = (variant) => variant?.hppSummary || variant?.hpp_summary || null
const resolveScopedHppSummary = (product, variantId = '') => {
  if (variantId) {
    const variant = (product?.variants || []).find((row) => row.id === variantId)
    return (
      getVariantHppSummary(variant)
      || getProductHppSummary(product)?.variantSummaries?.[variantId]
      || getProductHppSummary(product)?.variant_summaries?.[variantId]
      || null
    )
  }
  return getProductHppSummary(product)
}
const productSellPrice = (product, variantId = '') => {
  if (variantId) {
    const variant = (product?.variants || []).find((row) => row.id === variantId)
    const values = priceValues(variant?.prices)
    return values.length ? Math.min(...values) : null
  }

  const values = priceValues(product?.prices)
  return values.length ? Math.min(...values) : null
}
const resolveRecipeScopeLabel = (product, variantId = '') => {
  if (!variantId) return 'Resep Dasar'
  const variant = (product?.variants || []).find((row) => row.id === variantId)
  return variant?.name ? `Varian ${variant.name}` : 'Varian'
}
const resolveProductRecipeStatus = (product) => {
  const variants = isDrinkCategory(product) ? getRecipeVariants(product) : []
  if (variants.length > 0) {
    const summaries = variants.map((variant) => resolveScopedHppSummary(product, variant.id))
    return {
      mode: 'variant',
      totalCount: variants.length,
      configuredCount: summaries.filter((summary) => summary?.recipeConfigured).length,
      fullyCostedCount: summaries.filter((summary) => summary?.fullyCosted).length,
    }
  }

  const summary = resolveScopedHppSummary(product)
  return {
    mode: 'base',
    totalCount: 1,
    configuredCount: summary?.recipeConfigured ? 1 : 0,
    fullyCostedCount: summary?.fullyCosted ? 1 : 0,
  }
}
const getUnitCode = (unit) => unit?.code || unit?.name || 'unit'
const getUnitLabel = (unit) => {
  if (!unit) return 'unit bahan'
  if (unit.name && unit.code && unit.name.toUpperCase() !== unit.code) return `${unit.name} (${unit.code})`
  return unit.name || unit.code || 'unit bahan'
}
const formatQtyUnit = (value, unit) => (value == null ? '-' : `${formatNumber(value)} ${getUnitCode(unit)}`)
const describeCostSource = (source) => {
  if (source === 'purchase_order') return 'PO terakhir'
  if (source === 'movement') return 'Update manual'
  return 'Belum ada cost'
}

function IngredientModal({ open, onClose, ingredient, branchId, canEdit }) {
  const qc = useQueryClient()
  const isEdit = Boolean(ingredient)
  const [form, setForm] = useState({
    sku: '', name: '', unitCode: '', unitName: '', minStock: '0', stockQty: '', latestCost: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      sku: ingredient?.sku || '',
      name: ingredient?.name || '',
      unitCode: ingredient?.unit?.code || '',
      unitName: ingredient?.unit?.name || '',
      minStock: ingredient?.minStock != null ? String(ingredient.minStock) : '0',
      stockQty: ingredient?.stockQty != null ? String(ingredient.stockQty) : '',
      latestCost: ingredient?.latestCost != null ? String(ingredient.latestCost) : '',
    })
    setError('')
  }, [ingredient, open])

  const unitPreview = form.unitCode.trim().toUpperCase() || ingredient?.unit?.code || 'unit'
  const stockEnabled = Boolean(branchId)

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('Nama bahan wajib diisi')
      if (!form.unitCode.trim()) throw new Error('Unit wajib diisi')

      const initialCost = ingredient?.latestCost != null ? Number(ingredient.latestCost) : null
      const nextCost = form.latestCost !== '' ? Number(form.latestCost) : null
      const shouldSendLatestCost = nextCost != null && (!isEdit || nextCost !== initialCost)
      const shouldSendStock = form.stockQty !== ''

      if ((shouldSendLatestCost || shouldSendStock) && !branchId) {
        throw new Error('Pilih cabang dulu untuk menyimpan stok atau cost bahan')
      }

      const payload = {
        sku: form.sku.trim() || null,
        name: form.name.trim(),
        unitCode: form.unitCode.trim(),
        unitName: form.unitName.trim() || null,
        minStock: Number(form.minStock || 0),
        ...(shouldSendStock ? { stockQty: Number(form.stockQty || 0), branchId } : {}),
        ...(shouldSendLatestCost ? { latestCost: nextCost, branchId } : {}),
      }

      return isEdit
        ? api.put(`/costing/ingredients/${ingredient.id}`, payload)
        : api.post('/costing/ingredients', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costing-ingredients'] })
      qc.invalidateQueries({ queryKey: ['costing-products'] })
      qc.invalidateQueries({ queryKey: ['costing-recipe'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Bahan - ${ingredient?.name}` : 'Tambah Bahan'} width="max-w-2xl">
      <div className="space-y-4">
        {isEdit && (
          <div className="grid gap-3 rounded-2xl bg-background/60 px-4 py-4 md:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Unit</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{getUnitLabel(ingredient?.unit)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Cost terakhir</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {ingredient?.latestCost == null ? '-' : `${formatRupiah(ingredient.latestCost)} / ${getUnitCode(ingredient.unit)}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Stok cabang</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {branchId ? formatQtyUnit(ingredient?.stockQty, ingredient?.unit) : 'Pilih cabang'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="SKU" value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} placeholder="GULA-001" />
          <Input label="Nama Bahan *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Gula pasir" />
          <Input label="Unit Code *" value={form.unitCode} onChange={(e) => setForm((p) => ({ ...p, unitCode: e.target.value }))} placeholder="GR" />
          <Input label="Nama Unit" value={form.unitName} onChange={(e) => setForm((p) => ({ ...p, unitName: e.target.value }))} placeholder="Gram" />

          <div className="space-y-1.5">
            <Input label={`Min Stock (${unitPreview})`} type="number" value={form.minStock} onChange={(e) => setForm((p) => ({ ...p, minStock: e.target.value }))} placeholder="0" />
            <p className="text-xs text-muted-foreground">Batas aman stok. Satuan mengikuti unit bahan.</p>
          </div>

          <div className="space-y-1.5">
            <Input label={`Stok Cabang (${unitPreview})`} type="number" value={form.stockQty} onChange={(e) => setForm((p) => ({ ...p, stockQty: e.target.value }))} placeholder="0" disabled={!stockEnabled} />
            <p className="text-xs text-muted-foreground">
              {stockEnabled ? `Stok disimpan per cabang dalam ${unitPreview}.` : 'Pilih cabang dulu untuk mengisi stok.'}
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Input label={`Cost Terakhir (Rp / ${unitPreview})`} type="number" value={form.latestCost} onChange={(e) => setForm((p) => ({ ...p, latestCost: e.target.value }))} placeholder="15000" disabled={!stockEnabled} />
            <p className="text-xs text-muted-foreground">
              {stockEnabled ? `Disimpan sebagai Rupiah per ${unitPreview}.` : 'Pilih cabang dulu untuk menyimpan cost.'}
            </p>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" disabled={!canEdit} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {isEdit ? 'Simpan Perubahan' : 'Tambah Bahan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DeleteIngredientModal({ ingredient, open, onClose, onConfirm, loading }) {
  if (!ingredient) return null
  return (
    <Modal open={open} onClose={onClose} title={`Hapus Bahan - ${ingredient.name}`} width="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{ingredient.name}</p>
          <p className="mt-1">{ingredient.sku || 'Tanpa SKU'} - {getUnitLabel(ingredient.unit)}</p>
          <p className="mt-3">
            Jika bahan sudah punya histori stok, cost, pembelian, atau opname, sistem akan mengarsipkan bahan dan
            melepasnya dari resep aktif agar data lama tetap aman.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button variant="danger" className="flex-1" loading={loading} onClick={() => onConfirm(ingredient)}>
            <Trash2 size={14} /> Hapus Bahan
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function CostingPage() {
  const qc = useQueryClient()
  const { user, hasPermission } = useAuth()
  const canEdit = hasPermission(PERMISSIONS.MENU_ITEM_MANAGE) || hasPermission(PERMISSIONS.INVENTORY_MASTER_MANAGE)
  const defaultBranchId = user?.role === 'SUPER_ADMIN' ? '' : (user?.branch?.id || '')

  const [branchId, setBranchId] = useState(defaultBranchId)
  const [tab, setTab] = useState('hpp')
  const [productSearch, setProductSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedRecipeVariantId, setSelectedRecipeVariantId] = useState('')
  const [recipeDraft, setRecipeDraft] = useState([createRecipeRow()])
  const [notice, setNotice] = useState('')
  const [ingredientNotice, setIngredientNotice] = useState('')
  const [ingredientModal, setIngredientModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const branchQuery = useMemo(() => readBranchQuery(branchId), [branchId])

  const { data: branches } = useQuery({ queryKey: ['costing-branches'], queryFn: () => api.get('/branches') })
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['costing-products', branchQuery, productSearch],
    queryFn: () => api.get(`/costing/products?${new URLSearchParams({
      ...(branchId && { branch_id: branchId }),
      ...(productSearch.trim() && { q: productSearch.trim() }),
    }).toString()}`),
  })
  const { data: ingredients = [], isLoading: loadingIngredients } = useQuery({
    queryKey: ['costing-ingredients', branchQuery, ingredientSearch],
    queryFn: () => api.get(`/costing/ingredients?${new URLSearchParams({
      ...(branchId && { branch_id: branchId }),
      ...(ingredientSearch.trim() && { q: ingredientSearch.trim() }),
    }).toString()}`),
  })

  useEffect(() => {
    if (!products.length) {
      setSelectedProductId('')
      return
    }
    if (!selectedProductId || !products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(products[0].id)
    }
  }, [products, selectedProductId])

  const selectedProduct = useMemo(() => products.find((item) => item.id === selectedProductId) || null, [products, selectedProductId])
  const selectedProductVariants = useMemo(() => getRecipeVariants(selectedProduct), [selectedProduct])
  const supportsVariantRecipes = Boolean(selectedProduct && isDrinkCategory(selectedProduct) && selectedProductVariants.length > 0)
  const recipeQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (branchId) params.set('branch_id', branchId)
    if (selectedRecipeVariantId) params.set('variant_id', selectedRecipeVariantId)
    return params.toString()
  }, [branchId, selectedRecipeVariantId])

  useEffect(() => {
    if (!selectedProduct) {
      setSelectedRecipeVariantId('')
      return
    }

    if (!supportsVariantRecipes) {
      if (selectedRecipeVariantId) setSelectedRecipeVariantId('')
      return
    }

    if (selectedProductVariants.some((variant) => variant.id === selectedRecipeVariantId)) {
      return
    }

    setSelectedRecipeVariantId(selectedProductVariants[0]?.id || '')
  }, [selectedProduct, selectedProductVariants, selectedRecipeVariantId, supportsVariantRecipes])

  const { data: recipeData, isLoading: loadingRecipe } = useQuery({
    queryKey: ['costing-recipe', selectedProductId, recipeQuery],
    enabled: Boolean(selectedProductId),
    queryFn: () => api.get(`/costing/products/${selectedProductId}/recipe${recipeQuery ? `?${recipeQuery}` : ''}`),
  })

  useEffect(() => {
    if (!recipeData) return
    if (!(recipeData.items || []).length) {
      setRecipeDraft([createRecipeRow()])
      return
    }
    setRecipeDraft((recipeData.items || []).map((item) => ({
      ingredientId: item.ingredientId,
      quantity: String(item.quantity || 0),
      lossFactor: String(item.lossFactor || 0),
    })))
  }, [recipeData])

  useEffect(() => {
    setNotice('')
  }, [selectedProductId, selectedRecipeVariantId])

  const ingredientMap = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients])
  const activeProduct = recipeData?.product || selectedProduct

  const recipePreview = useMemo(() => {
    const rows = recipeDraft.map((row, index) => {
      const ingredient = ingredientMap.get(row.ingredientId) || null
      const quantity = Number(row.quantity || 0)
      const lossFactor = Number(row.lossFactor || 0)
      const effectiveQty = quantity * (1 + (lossFactor / 100))
      const unitCost = Number(ingredient?.latestCost || 0)
      return {
        key: `${row.ingredientId || 'new'}-${index}`,
        ingredient,
        ingredientId: row.ingredientId,
        unitCost: ingredient?.latestCost != null ? unitCost : null,
        subtotal: unitCost > 0 ? effectiveQty * unitCost : 0,
      }
    })

    const estimatedCost = rows.reduce((sum, row) => sum + row.subtotal, 0)
    const missingCostCount = rows.filter((row) => row.ingredientId && row.unitCost == null).length
    return { rows, estimatedCost, missingCostCount, fullyCosted: rows.some((row) => row.ingredientId) && missingCostCount === 0 }
  }, [ingredientMap, recipeDraft])

  const saveRecipe = useMutation({
    mutationFn: () => {
      const items = recipeDraft.filter((row) => row.ingredientId).map((row) => ({
        ingredientId: row.ingredientId,
        quantity: Number(row.quantity || 0),
        lossFactor: Number(row.lossFactor || 0),
      }))
      if (!selectedProductId) throw new Error('Pilih menu dulu')
      if (items.some((row) => row.quantity <= 0)) throw new Error('Qty bahan harus lebih dari 0')
      return api.put(`/costing/products/${selectedProductId}/recipe`, {
        branchId: branchId || undefined,
        variantId: selectedRecipeVariantId || undefined,
        items,
      })
    },
    onSuccess: async () => {
      setNotice(`${resolveRecipeScopeLabel(activeProduct, selectedRecipeVariantId)} berhasil disimpan`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['costing-products'] }),
        qc.invalidateQueries({ queryKey: ['costing-recipe'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ])
    },
    onError: (err) => setNotice(err.message),
  })

  const deleteIngredient = useMutation({
    mutationFn: (ingredient) => api.delete(`/costing/ingredients/${ingredient.id}${branchQuery ? `?${branchQuery}` : ''}`),
    onSuccess: async (result) => {
      setIngredientNotice(result?.message || 'Bahan berhasil dihapus')
      setDeleteTarget(null)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['costing-ingredients'] }),
        qc.invalidateQueries({ queryKey: ['costing-products'] }),
        qc.invalidateQueries({ queryKey: ['costing-recipe'] }),
      ])
    },
    onError: (err) => setIngredientNotice(err.message),
  })

  const summary = useMemo(() => {
    const fullyCosted = products.filter((product) => {
      const status = resolveProductRecipeStatus(product)
      return status.mode === 'variant'
        ? status.totalCount > 0 && status.fullyCostedCount === status.totalCount
        : status.fullyCostedCount > 0
    }).length
    const recipeConfigured = products.filter((product) => resolveProductRecipeStatus(product).configuredCount > 0).length
    return [
      { label: 'Menu', value: formatNumber(products.length) },
      { label: 'Resep aktif', value: formatNumber(recipeConfigured) },
      { label: 'HPP lengkap', value: formatNumber(fullyCosted) },
      { label: 'Bahan aktif', value: formatNumber(ingredients.length) },
    ]
  }, [ingredients.length, products])

  const addRecipeRow = () => setRecipeDraft((prev) => [...prev, createRecipeRow()])
  const updateRecipeRow = (index, key, value) => setRecipeDraft((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  const removeRecipeRow = (index) => setRecipeDraft((prev) => (prev.length === 1 ? [createRecipeRow()] : prev.filter((_, rowIndex) => rowIndex !== index)))
  const selectedBaseSummary = resolveScopedHppSummary(activeProduct)
  const selectedScopeSummary = resolveScopedHppSummary(activeProduct, selectedRecipeVariantId)
  const selectedScopeLabel = resolveRecipeScopeLabel(activeProduct, selectedRecipeVariantId)
  const minSellPrice = productSellPrice(activeProduct, selectedRecipeVariantId)
  const estimatedMargin = minSellPrice != null ? minSellPrice - recipePreview.estimatedCost : null

  return (
    <div>
      <PageHeader
        title="Cost & HPP"
        subtitle="Kelola bahan, stok, resep menu, dan estimasi HPP dari satu halaman."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === 'SUPER_ADMIN' && (
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Semua cost</option>
                {(branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
            )}
            <Button variant={tab === 'hpp' ? 'primary' : 'secondary'} className="h-9 px-3 text-xs" onClick={() => setTab('hpp')}><Calculator size={13} /> Resep & HPP</Button>
            <Button variant={tab === 'ingredients' ? 'primary' : 'secondary'} className="h-9 px-3 text-xs" onClick={() => setTab('ingredients')}><Beaker size={13} /> Bahan & Cost</Button>
          </div>
        )}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label} className="rounded-2xl bg-card/70 px-4 py-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.7)]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {tab === 'hpp' ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-3xl bg-card/70 p-4 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.9)]">
            <div className="flex items-center gap-2 rounded-2xl bg-background/60 px-3 py-2.5">
              <Search size={14} className="text-muted-foreground" />
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari menu..." className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            </div>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {loadingProducts ? <Spinner /> : products.length === 0 ? <Empty message="Menu belum tersedia" /> : products.map((product) => {
                const active = product.id === selectedProductId
                const recipeStatus = resolveProductRecipeStatus(product)
                const hppSummary = resolveScopedHppSummary(product)
                return (
                  <button key={product.id} onClick={() => setSelectedProductId(product.id)} className={`w-full rounded-2xl px-3 py-3 text-left transition-colors ${active ? 'bg-primary/12 text-foreground' : 'bg-background/35 text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{product.category?.name || 'Tanpa kategori'}</p>
                      </div>
                      <PackageSearch size={15} className={active ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {recipeStatus.mode === 'variant' ? (
                        <>
                          <span className="rounded-full bg-background/70 px-2 py-1">
                            Resep {recipeStatus.configuredCount}/{recipeStatus.totalCount} varian
                          </span>
                          <span className={`rounded-full px-2 py-1 ${recipeStatus.fullyCostedCount === recipeStatus.totalCount ? 'bg-emerald-500/12 text-emerald-400' : 'bg-amber-500/12 text-amber-300'}`}>
                            {recipeStatus.fullyCostedCount}/{recipeStatus.totalCount} lengkap
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-background/70 px-2 py-1">HPP {formatRupiah(hppSummary?.estimatedCost || 0)}</span>
                          <span className={`rounded-full px-2 py-1 ${hppSummary?.fullyCosted ? 'bg-emerald-500/12 text-emerald-400' : 'bg-amber-500/12 text-amber-300'}`}>
                            {hppSummary?.fullyCosted ? 'Lengkap' : `Kurang ${hppSummary?.missingCostCount || 0}`}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-4">
            {!selectedProduct ? (
              <div className="rounded-3xl bg-card/70 p-6 text-sm text-muted-foreground">Pilih menu untuk mengatur resep dan melihat perhitungan HPP.</div>
            ) : (
              <>
                <div className="rounded-3xl bg-card/70 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.9)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{activeProduct?.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{activeProduct?.category?.name || 'Tanpa kategori'} - {activeProduct?.sku}</p>
                      {supportsVariantRecipes && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Kategori Minuman memakai terpisah per varian
                        </p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-background/55 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Harga jual</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{supportsVariantRecipes ? selectedScopeLabel : 'Menu'}</p>
                        <p className="mt-2 text-base font-semibold text-foreground">{minSellPrice == null ? '-' : formatRupiah(minSellPrice)}</p>
                      </div>
                      <div className="rounded-2xl bg-background/55 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">HPP estimasi</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Tersimpan {formatRupiah(selectedScopeSummary?.estimatedCost || 0)}
                        </p>
                        <p className="mt-2 text-base font-semibold text-foreground">{formatRupiah(recipePreview.estimatedCost)}</p>
                      </div>
                      <div className="rounded-2xl bg-background/55 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Margin</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{supportsVariantRecipes ? selectedScopeLabel : 'Menu'}</p>
                        <p className={`mt-2 text-base font-semibold ${estimatedMargin == null ? 'text-foreground' : estimatedMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{estimatedMargin == null ? '-' : formatRupiah(estimatedMargin)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl bg-card/70 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.9)]">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Resep Menu</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {supportsVariantRecipes
                          ? `${selectedScopeLabel}. Qty dan loss mengikuti satuan bahan, cost tampil dalam Rupiah per satuan.`
                          : 'Qty dan loss mengikuti satuan bahan. Cost tampil dalam Rupiah per satuan.'}
                      </p>
                      {supportsVariantRecipes && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant={selectedRecipeVariantId === '' ? 'primary' : 'secondary'}
                            className="h-8 px-3 text-xs"
                            onClick={() => setSelectedRecipeVariantId('')}
                          >
                            Resep Dasar
                          </Button>
                          {selectedProductVariants.map((variant) => (
                            <Button
                              key={variant.id}
                              variant={selectedRecipeVariantId === variant.id ? 'primary' : 'secondary'}
                              className="h-8 px-3 text-xs"
                              onClick={() => setSelectedRecipeVariantId(variant.id)}
                            >
                              {variant.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="secondary" className="h-9 px-3 text-xs" onClick={addRecipeRow}><Plus size={13} /> Tambah Baris</Button>
                  </div>
                  {supportsVariantRecipes && selectedRecipeVariantId && !recipeData?.recipeConfigured && selectedBaseSummary?.recipeConfigured && (
                    <div className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                      Resep varian ini masih kosong. Sampai disimpan, transaksi akan memakai Resep Dasar sebagai fallback.
                    </div>
                  )}
                  {loadingRecipe ? <Spinner /> : (
                    <div className="space-y-3">
                      {recipeDraft.map((row, index) => {
                        const preview = recipePreview.rows[index]
                        const unitCode = getUnitCode(preview?.ingredient?.unit)
                        return (
                          <div key={`recipe-row-${index}`} className="grid gap-2 rounded-2xl bg-background/50 p-3 md:grid-cols-[1.8fr_0.8fr_0.8fr_1fr_auto]">
                            <Select value={row.ingredientId} onChange={(e) => updateRecipeRow(index, 'ingredientId', e.target.value)}>
                              <option value="">Pilih bahan</option>
                              {ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit?.code || '-'})</option>)}
                            </Select>
                            <Input type="number" value={row.quantity} onChange={(e) => updateRecipeRow(index, 'quantity', e.target.value)} placeholder="Qty" />
                            <Input type="number" value={row.lossFactor} onChange={(e) => updateRecipeRow(index, 'lossFactor', e.target.value)} placeholder="Loss %" />
                            <div className="rounded-2xl bg-card px-3 py-2.5 text-xs text-muted-foreground">
                              <p>{preview?.ingredient ? `Unit ${unitCode}` : 'Belum pilih bahan'}</p>
                              <p className="mt-1 font-medium text-foreground">{preview?.unitCost == null ? 'Cost kosong' : `${formatRupiah(preview.unitCost)} / ${unitCode}`}</p>
                              <p className="mt-1">Subtotal {formatRupiah(preview?.subtotal || 0)}</p>
                            </div>
                            <Button variant="secondary" className="h-10 px-3 text-xs" onClick={() => removeRecipeRow(index)}>Hapus</Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {notice && <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${notice.toLowerCase().includes('berhasil') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>{notice}</div>}
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-muted-foreground">
                      Total HPP {supportsVariantRecipes ? selectedScopeLabel : 'saat ini'}:{' '}
                      <span className="font-semibold text-foreground">{formatRupiah(recipePreview.estimatedCost)}</span>
                    </div>
                    <Button className="h-10 px-4" disabled={!canEdit || !selectedProductId} loading={saveRecipe.isPending} onClick={() => saveRecipe.mutate()}>
                      {supportsVariantRecipes ? `Simpan ${selectedScopeLabel}` : 'Simpan Resep'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-card/70 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.9)]">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="flex w-full items-center gap-2 rounded-2xl bg-background/60 px-3 py-2.5 md:w-[320px]">
                <Search size={14} className="text-muted-foreground" />
                <input value={ingredientSearch} onChange={(e) => setIngredientSearch(e.target.value)} placeholder="Cari bahan..." className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
              </div>
              <p className="text-xs text-muted-foreground">Min stock dan stok mengikuti satuan bahan. Cost terakhir tampil dalam Rupiah per satuan.</p>
            </div>
            <Button className="h-10 px-4" disabled={!canEdit} onClick={() => setIngredientModal('add')}><Plus size={14} /> Tambah Bahan</Button>
          </div>

          {!branchId && user?.role === 'SUPER_ADMIN' && <div className="mb-4 rounded-2xl bg-background/60 px-4 py-3 text-sm text-muted-foreground">Pilih cabang untuk mengisi stok dan cost per cabang. Tanpa cabang, stok tidak ditampilkan.</div>}
          {ingredientNotice && <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${ingredientNotice.toLowerCase().includes('diarsipkan') || ingredientNotice.toLowerCase().includes('berhasil') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>{ingredientNotice}</div>}

          {loadingIngredients ? <Spinner /> : ingredients.length === 0 ? <Empty message="Belum ada bahan baku" /> : (
            <div className="space-y-2">
              {ingredients.map((ingredient) => (
                <div key={ingredient.id} className="grid gap-3 rounded-2xl bg-background/50 px-4 py-4 md:grid-cols-[1.6fr_0.95fr_0.85fr_0.85fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{ingredient.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ingredient.sku || 'Tanpa SKU'} - {getUnitLabel(ingredient.unit)}</p>
                  </div>
                  <div className="text-sm text-foreground">
                    <p className="font-medium">{ingredient.latestCost == null ? '-' : `${formatRupiah(ingredient.latestCost)} / ${getUnitCode(ingredient.unit)}`}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ingredient.latestCostEffectiveAt ? `${describeCostSource(ingredient.latestCostSource)} - ${formatDateTime(ingredient.latestCostEffectiveAt)}` : describeCostSource(ingredient.latestCostSource)}</p>
                  </div>
                  <div className="text-sm text-foreground">
                    <p className="font-medium">{branchId ? formatQtyUnit(ingredient.stockQty, ingredient.unit) : 'Pilih cabang'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">stok cabang</p>
                  </div>
                  <div className="text-sm text-foreground">
                    <p className="font-medium">{formatQtyUnit(ingredient.minStock || 0, ingredient.unit)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">batas minimum</p>
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <Button variant="secondary" className="h-9 px-3 text-xs" disabled={!canEdit} onClick={() => setIngredientModal(ingredient)}><Pencil size={13} /> Edit</Button>
                    <Button variant="danger" className="h-9 px-3 text-xs" disabled={!canEdit} onClick={() => setDeleteTarget(ingredient)}><Trash2 size={13} /> Hapus</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <IngredientModal open={Boolean(ingredientModal)} onClose={() => setIngredientModal(null)} ingredient={ingredientModal === 'add' ? null : ingredientModal} branchId={branchId} canEdit={canEdit} />
      <DeleteIngredientModal open={Boolean(deleteTarget)} ingredient={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={(ingredient) => deleteIngredient.mutate(ingredient)} loading={deleteIngredient.isPending} />
    </div>
  )
}
