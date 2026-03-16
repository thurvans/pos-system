import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { PageHeader, Card, Button, Badge, Spinner } from '@/components/ui'

export default function DownloadPage() {
  const downloadQuery = useQuery({
    queryKey: ['apk-download'],
    queryFn: () => api.get('/downloads/android'),
    retry: false,
  })

  const status = downloadQuery.data ? 'AVAILABLE' : 'ERROR'

  return (
    <div>
      <PageHeader
        title="APK Kasir"
        subtitle="Download aplikasi kasir Android."
        action={
          <Badge variant={status === 'AVAILABLE' ? 'green' : 'rose'}>
            {status === 'AVAILABLE' ? 'APK Tersedia' : 'Error'}
          </Badge>
        }
      />

      <Card className="p-5">
        {downloadQuery.isLoading ? <Spinner /> : downloadQuery.data ? (
          <div className="space-y-4">
            <div className="text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">Versi</span>
                <span className="font-mono sm:text-right">{downloadQuery.data.version} ({downloadQuery.data.build || '-'})</span>
              </div>
              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">Checksum</span>
                <span className="break-all font-mono sm:max-w-[60%] sm:text-right">{downloadQuery.data.checksum || '-'}</span>
              </div>
              {downloadQuery.data.releaseNotes && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {downloadQuery.data.releaseNotes}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full justify-center sm:w-auto" onClick={() => window.open(downloadQuery.data.url, '_blank')}>
                Download APK
              </Button>
              <Button className="w-full justify-center sm:w-auto" variant="outline" onClick={() => downloadQuery.refetch()}>
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {downloadQuery.error?.message || 'Gagal mengambil info APK.'}
          </div>
        )}
      </Card>
    </div>
  )
}
