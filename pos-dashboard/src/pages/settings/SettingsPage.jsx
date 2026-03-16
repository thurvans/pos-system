import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui'
import { formatDateTime } from '@/lib/utils'

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0)
  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const resolveBackupPath = (filePath) => {
  const source = String(filePath || '')
  if (!source) return ''
  if (source.startsWith('http://') || source.startsWith('https://')) return source
  if (source.startsWith('/api/settings/backups/')) return source.replace(/^\/api/, '')
  if (source.startsWith('/settings/backups/')) return source
  const filename = source.split('/').pop()
  return filename ? `/settings/backups/${filename}` : source
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const defaultBranchId = user?.role === 'SUPER_ADMIN' ? '' : (user?.branch?.id || '')
  const [branchId, setBranchId] = useState(defaultBranchId)

  const queryString = useMemo(() => (
    branchId ? `?branch_id=${branchId}` : ''
  ), [branchId])

  const { data: branches } = useQuery({
    queryKey: ['settings-branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ['settings-overview', branchId],
    queryFn: () => api.get(`/settings/overview${queryString}`),
  })

  const [businessProfile, setBusinessProfile] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    taxNumber: '',
    taxRate: '',
    serviceChargeRate: '',
    currency: 'IDR',
  })
  const [restoreSource, setRestoreSource] = useState('')
  const [downloadingBackupId, setDownloadingBackupId] = useState('')

  useEffect(() => {
    if (!overview) return
    const profile = overview.businessProfile || {}

    setBusinessProfile({
      name: profile.name || '',
      address: profile.address || '',
      phone: profile.phone || '',
      email: profile.email || '',
      taxNumber: profile.taxNumber || '',
      taxRate: profile.taxRate != null ? String(profile.taxRate) : '',
      serviceChargeRate: profile.serviceChargeRate != null ? String(profile.serviceChargeRate) : '',
      currency: profile.currency || 'IDR',
    })
  }, [overview])

  const saveBusinessProfile = useMutation({
    mutationFn: () => api.put('/settings/business-profile', {
      branchId: branchId || undefined,
      name: businessProfile.name,
      address: businessProfile.address || null,
      phone: businessProfile.phone || null,
      email: businessProfile.email || null,
      taxNumber: businessProfile.taxNumber || null,
      taxRate: businessProfile.taxRate === '' ? undefined : Number(businessProfile.taxRate),
      serviceChargeRate: businessProfile.serviceChargeRate === '' ? undefined : Number(businessProfile.serviceChargeRate),
      currency: businessProfile.currency,
    }),
    onSuccess: () => qc.invalidateQueries(['settings-overview']),
  })

  const backupMutation = useMutation({
    mutationFn: () => api.post('/settings/backup', {
      branchId: branchId || undefined,
    }),
    onSuccess: () => qc.invalidateQueries(['settings-overview']),
  })

  const restoreMutation = useMutation({
    mutationFn: () => api.post('/settings/restore', {
      source: restoreSource,
      branchId: branchId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['settings-overview'])
      setRestoreSource('')
    },
  })

  const handleDownloadBackup = async (log) => {
    const sourcePath = resolveBackupPath(log?.filePath)
    if (!sourcePath) return
    setDownloadingBackupId(log.id)
    try {
      await api.download(sourcePath, { filename: 'backup.json' })
    } catch (err) {
      alert(err.message || 'Gagal download backup')
    } finally {
      setDownloadingBackupId('')
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Pengaturan Sistem"
        subtitle="Profil bisnis, pajak, backup & restore"
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {user?.role === 'SUPER_ADMIN' && (
              <Select className="w-full sm:w-[240px]" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">Global / Semua Cabang</option>
                {(branches || []).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            )}
            <Button variant="secondary" className="w-full justify-center sm:w-auto" onClick={() => refetch()}>Refresh</Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Profil Bisnis</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input label="Nama Bisnis" value={businessProfile.name} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, name: event.target.value }))} />
            <Input label="Mata Uang" value={businessProfile.currency} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, currency: event.target.value }))} />
            <Input label="No. Telepon" value={businessProfile.phone} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, phone: event.target.value }))} />
            <Input label="Email" value={businessProfile.email} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, email: event.target.value }))} />
            <Input label="NPWP / Tax Number" value={businessProfile.taxNumber} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, taxNumber: event.target.value }))} />
            <Input label="PPN (%)" type="number" value={businessProfile.taxRate} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, taxRate: event.target.value }))} />
            <Input label="Service Charge (%)" type="number" value={businessProfile.serviceChargeRate} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, serviceChargeRate: event.target.value }))} />
          </div>
          <Input className="mt-2" label="Alamat" value={businessProfile.address} onChange={(event) => setBusinessProfile((prev) => ({ ...prev, address: event.target.value }))} />
          <div className="mt-3">
            <Button loading={saveBusinessProfile.isPending} onClick={() => saveBusinessProfile.mutate()}>
              Simpan Profil
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">Backup & Restore</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button loading={backupMutation.isPending} onClick={() => backupMutation.mutate()}>
              Trigger Backup
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-4">
          <Input
            placeholder="Sumber restore (contoh: /settings/backups/backup-xxx.json)"
            value={restoreSource}
            onChange={(event) => setRestoreSource(event.target.value)}
          />
          <Button
            variant="secondary"
            loading={restoreMutation.isPending}
            disabled={!restoreSource.trim()}
            onClick={() => restoreMutation.mutate()}
          >
            Request Restore
          </Button>
        </div>

        {!(overview?.backupLogs || []).length ? (
          <Empty message="Belum ada log backup" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Status</Th>
                <Th>File</Th>
                <Th>Size</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {(overview.backupLogs || []).map((log) => (
                <tr key={log.id} className="border-b border-border/50 last:border-0">
                  <Td><span className="text-xs">{formatDateTime(log.startedAt)}</span></Td>
                  <Td>
                    <Badge variant={String(log.status).includes('SUCCESS') ? 'green' : 'amber'}>
                      {log.status}
                    </Badge>
                  </Td>
                  <Td><span className="text-xs text-muted-foreground">{log.filePath || '-'}</span></Td>
                  <Td><span className="text-xs text-muted-foreground">{formatFileSize(log.sizeBytes)}</span></Td>
                  <Td className="text-right">
                    {log.filePath && String(log.status).includes('SUCCESS') ? (
                      <Button
                        variant="secondary"
                        className="h-7 px-2 text-xs !min-w-0"
                        loading={downloadingBackupId === log.id}
                        onClick={() => handleDownloadBackup(log)}
                      >
                        Download
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
