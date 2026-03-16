import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/lib/permissions'
import { formatRupiah } from '@/lib/utils'
import { Pencil, Trash2, Plus } from 'lucide-react'

const emptyBundleItem = { productId: '', variantId: '', quantity: '1' }

function ModifierGroupModal({ open, onClose, group, products, defaultProductId }) {
  const qc = useQueryClient()
  const isEdit = Boolean(group)
  const [form, setForm] = useState({ name: '', inputType: 'MULTIPLE', productId: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: group?.name || '',
      inputType: group?.inputType || 'MULTIPLE',
      productId: defaultProductId || group?.products?.[0]?.product?.id || '',
    })
    setError('')
  }, [defaultProductId, group, open])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Nama modifier wajib diisi')

      if (isEdit) {
        await api.put(`/menu/modifier-groups/${group.id}`, {
          name: form.name.trim(),
          inputType: form.inputType,
        })
      } else {
        await api.post('/menu/modifier-groups', {
          name: form.name.trim(),
          inputType: form.inputType,
          productIds: form.productId ? [form.productId] : [],
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-modifier-groups'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Modifier - ${group?.name}` : 'Tambah Modifier'}>
      <div className="space-y-4">
        <Input label="Nama Group" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        <Select label="Tipe Input" value={form.inputType} onChange={(event) => setForm((prev) => ({ ...prev, inputType: event.target.value }))}>
          <option value="MULTIPLE">Multiple</option>
          <option value="SINGLE">Single</option>
        </Select>
        {!isEdit && (
          <Select label="Menu" value={form.productId} onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value }))}>
            <option value="">Tanpa menu</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </Select>
        )}
        {isEdit && (
          <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Edit dari halaman ini fokus ke nama dan tipe modifier. Relasi menu yang sudah terpasang tetap dipertahankan.
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ModifierOptionModal({ open, onClose, group, option }) {
  const qc = useQueryClient()
  const isEdit = Boolean(option)
  const [form, setForm] = useState({ name: '', priceDelta: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: option?.name || '',
      priceDelta: option?.priceDelta != null ? String(option.priceDelta) : '',
    })
    setError('')
  }, [open, option])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('Nama opsi wajib diisi')
      const payload = {
        name: form.name.trim(),
        priceDelta: form.priceDelta === '' ? 0 : Number(form.priceDelta),
      }

      return isEdit
        ? api.put(`/menu/modifier-options/${option.id}`, payload)
        : api.post(`/menu/modifier-groups/${group.id}/options`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-modifier-groups'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Opsi - ${option?.name}` : `Tambah Opsi - ${group?.name}`}>
      <div className="space-y-4">
        <Input label="Nama Opsi" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        <Input
          label="Harga Tambahan"
          type="number"
          value={form.priceDelta}
          onChange={(event) => setForm((prev) => ({ ...prev, priceDelta: event.target.value }))}
          placeholder="0"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ModifierSection({ products }) {
  const qc = useQueryClient()
  const [productId, setProductId] = useState('')
  const [groupModal, setGroupModal] = useState(null)
  const [optionModal, setOptionModal] = useState(null)

  const { data: groups, isLoading } = useQuery({
    queryKey: ['menu-modifier-groups', productId],
    queryFn: () => api.get(`/menu/modifier-groups${productId ? `?product_id=${productId}` : ''}`),
  })

  const deleteGroup = useMutation({
    mutationFn: (id) => api.delete(`/menu/modifier-groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-modifier-groups'] }),
  })

  const deleteOption = useMutation({
    mutationFn: (id) => api.delete(`/menu/modifier-options/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-modifier-groups'] }),
  })

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Modifier / Add-on</p>
          <p className="text-xs text-muted-foreground mt-1">Varian sudah dipindahkan ke halaman Menu. Di sini tinggal modifier dan bundling.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Semua menu</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </Select>
          <Button onClick={() => setGroupModal('add')}>
            <Plus size={14} /> Tambah Group
          </Button>
        </div>
      </div>

      {isLoading ? <Spinner /> : !(groups || []).length ? (
        <Empty message="Belum ada modifier group" />
      ) : (
        <div className="space-y-3">
          {(groups || []).map((group) => (
            <div key={group.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{group.name}</p>
                    <Badge variant={group.isActive ? 'green' : 'muted'}>
                      {group.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                    <Badge variant="blue">{group.inputType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Menu: {group.products?.map((row) => row.product?.name).filter(Boolean).join(', ') || 'Belum dipasang'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setOptionModal({ group, option: null })}>
                    Tambah Opsi
                  </Button>
                  <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setGroupModal(group)}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    variant="danger"
                    className="h-8 px-3 text-xs !min-w-0"
                    loading={deleteGroup.isPending && deleteGroup.variables === group.id}
                    onClick={() => {
                      if (window.confirm(`Hapus modifier group "${group.name}"?`)) {
                        deleteGroup.mutate(group.id)
                      }
                    }}
                  >
                    <Trash2 size={12} /> Hapus
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {!group.options?.length ? (
                  <p className="text-xs text-muted-foreground">Belum ada opsi modifier</p>
                ) : (
                  group.options.map((option) => (
                    <div key={option.id} className="rounded-lg bg-secondary/50 px-3 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{option.name}</p>
                        <p className="text-xs text-muted-foreground">{formatRupiah(option.priceDelta || 0)}</p>
                      </div>
                      <Badge variant={option.isActive ? 'green' : 'muted'}>
                        {option.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setOptionModal({ group, option })}>
                        <Pencil size={12} /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        className="h-8 px-3 text-xs !min-w-0"
                        loading={deleteOption.isPending && deleteOption.variables === option.id}
                        onClick={() => {
                          if (window.confirm(`Hapus opsi "${option.name}"?`)) {
                            deleteOption.mutate(option.id)
                          }
                        }}
                      >
                        <Trash2 size={12} /> Hapus
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ModifierGroupModal
        open={Boolean(groupModal)}
        onClose={() => setGroupModal(null)}
        group={groupModal === 'add' ? null : groupModal}
        products={products}
        defaultProductId={productId}
      />

      <ModifierOptionModal
        open={Boolean(optionModal)}
        onClose={() => setOptionModal(null)}
        group={optionModal?.group || null}
        option={optionModal?.option || null}
      />
    </Card>
  )
}

function BundleModal({ open, onClose, bundle, products }) {
  const qc = useQueryClient()
  const isEdit = Boolean(bundle)
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    bundlePrice: '',
    items: [{ ...emptyBundleItem }],
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: bundle?.name || '',
      code: bundle?.code || '',
      description: bundle?.description || '',
      bundlePrice: bundle?.bundlePrice != null ? String(bundle.bundlePrice) : '',
      items: bundle?.items?.length
        ? bundle.items.map((item) => ({
          productId: item.productId || item.product?.id || '',
          variantId: item.variantId || item.variant?.id || '',
          quantity: String(item.quantity || 1),
        }))
        : [{ ...emptyBundleItem }],
    })
    setError('')
  }, [bundle, open])

  const updateItem = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (
        itemIndex === index
          ? {
            ...item,
            [key]: value,
            ...(key === 'productId' ? { variantId: '' } : {}),
          }
          : item
      )),
    }))
  }

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyBundleItem }] }))
  }

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('Nama bundle wajib diisi')
      if (!form.bundlePrice) throw new Error('Harga bundle wajib diisi')

      const items = form.items
        .filter((item) => item.productId)
        .map((item) => ({
          productId: item.productId,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          quantity: Number(item.quantity || 1),
        }))

      if (items.length === 0) throw new Error('Minimal isi satu item bundle')

      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        bundlePrice: Number(form.bundlePrice),
        items,
      }

      return isEdit
        ? api.put(`/menu/bundles/${bundle.id}`, payload)
        : api.post('/menu/bundles', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-bundles'] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Bundle - ${bundle?.name}` : 'Tambah Bundle'} width="max-w-4xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nama Bundle" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <Input label="Kode" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} />
          <Input
            label="Harga Bundle"
            type="number"
            value={form.bundlePrice}
            onChange={(event) => setForm((prev) => ({ ...prev, bundlePrice: event.target.value }))}
          />
          <Input label="Deskripsi" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Item Bundle</p>
            <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={addItem}>
              <Plus size={12} /> Tambah Item
            </Button>
          </div>

          <div className="space-y-3">
            {form.items.map((item, index) => {
              const product = products.find((row) => row.id === item.productId)
              const variants = (product?.variants || []).filter((row) => row.isActive ?? row.is_active ?? true)
              return (
                <div key={`bundle-item-${index}`} className="grid grid-cols-1 md:grid-cols-[1.6fr_1.2fr_0.8fr_auto] gap-2">
                  <Select value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)}>
                    <option value="">Pilih menu</option>
                    {products.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </Select>
                  <Select value={item.variantId} onChange={(event) => updateItem(index, 'variantId', event.target.value)}>
                    <option value="">Tanpa varian</option>
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>{variant.name}</option>
                    ))}
                  </Select>
                  <Input type="number" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} placeholder="Qty" />
                  <Button variant="secondary" className="!min-w-0 px-3" disabled={form.items.length === 1} onClick={() => removeItem(index)}>
                    Hapus
                  </Button>
                </div>
              )
            })}
          </div>
        </Card>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function BundleSection({ products }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)

  const { data: bundles, isLoading } = useQuery({
    queryKey: ['menu-bundles'],
    queryFn: () => api.get('/menu/bundles'),
  })

  const toggleBundle = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/menu/bundles/${id}/availability`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-bundles'] }),
  })

  const deleteBundle = useMutation({
    mutationFn: (id) => api.delete(`/menu/bundles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-bundles'] }),
  })

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Bundling / Paket Menu</p>
          <p className="text-xs text-muted-foreground mt-1">Edit dan hapus bundle sekarang tersedia dari halaman ini.</p>
        </div>
        <Button onClick={() => setModal('add')}>
          <Plus size={14} /> Tambah Bundle
        </Button>
      </div>

      {isLoading ? <Spinner /> : !(bundles || []).length ? (
        <Empty message="Belum ada bundle" />
      ) : (
        <div className="space-y-3">
          {(bundles || []).map((bundle) => (
            <div key={bundle.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{bundle.name}</p>
                    <Badge variant={bundle.isActive ? 'green' : 'muted'}>
                      {bundle.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bundle.code || '-'} | {formatRupiah(bundle.bundlePrice)} | {bundle.items?.length || 0} item
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(bundle.items || []).map((item) => `${item.product?.name || 'Menu'}${item.variant?.name ? ` (${item.variant.name})` : ''} x${item.quantity || 1}`).join(', ')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-xs !min-w-0"
                    loading={toggleBundle.isPending && toggleBundle.variables?.id === bundle.id}
                    onClick={() => toggleBundle.mutate({ id: bundle.id, isActive: !bundle.isActive })}
                  >
                    {bundle.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button variant="secondary" className="h-8 px-3 text-xs !min-w-0" onClick={() => setModal(bundle)}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    variant="danger"
                    className="h-8 px-3 text-xs !min-w-0"
                    loading={deleteBundle.isPending && deleteBundle.variables === bundle.id}
                    onClick={() => {
                      if (window.confirm(`Hapus bundle "${bundle.name}"?`)) {
                        deleteBundle.mutate(bundle.id)
                      }
                    }}
                  >
                    <Trash2 size={12} /> Hapus
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BundleModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        bundle={modal === 'add' ? null : modal}
        products={products}
      />
    </Card>
  )
}

export default function MenuAdvancedPage() {
  const { hasAnyPermission } = useAuth()
  const [tab, setTab] = useState('modifiers')

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['menu-advanced-products'],
    queryFn: () => api.get('/products?limit=500'),
  })

  const products = useMemo(() => productsData?.data || [], [productsData?.data])

  const tabs = [
    { key: 'modifiers', label: 'Modifier', permission: PERMISSIONS.MENU_MODIFIER_MANAGE },
    { key: 'bundles', label: 'Bundling', permission: PERMISSIONS.MENU_BUNDLE_MANAGE },
  ].filter((item) => hasAnyPermission([item.permission]))

  const activeTab = tabs.some((item) => item.key === tab) ? tab : (tabs[0]?.key || '')

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Menu Advanced"
        subtitle="Kelola modifier dan bundling menu. Varian sudah dipindahkan ke halaman Menu utama."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((item) => (
          <Button
            key={item.key}
            variant={activeTab === item.key ? 'primary' : 'secondary'}
            className="h-8 px-3 text-xs !min-w-0"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {activeTab === 'modifiers' && <ModifierSection products={products} />}
      {activeTab === 'bundles' && <BundleSection products={products} />}
    </div>
  )
}
