import { deleteMediaAction } from '@/app/admin/actions'
import { Flash } from '@/components/admin/Flash'
import { MediaPicker } from '@/components/admin/MediaPicker'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listMedia } from '@/server/services/media'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: Date, locale: 'zh' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const query = await searchParams
  const media = await listMedia()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminMedia}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <MediaPicker
        items={[]}
        labels={{
          upload: dict.adminUpload,
          uploading: dict.adminUploading,
          pick: dict.adminInsert,
          empty: dict.adminNoItems,
        }}
      />

      {media.length === 0 ? (
        <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
      ) : (
        <ul className="divide-y divide-rule border border-rule bg-surface">
          {media.map((item) => (
            <li key={item.id} className="flex items-center gap-4 p-3">
              {/* 图片来自本站上传目录，Next 图片优化对本地磁盘不适用。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={item.url} target="_blank" rel="noreferrer">
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-16 w-16 shrink-0 border border-rule object-cover"
                />
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-ink">{item.filename}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-muted">
                  {item.mime} · {formatBytes(item.bytes)} · {formatDate(item.createdAt, locale)}
                </p>
              </div>
              <form action={deleteMediaAction}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className="font-mono text-xs text-danger underline underline-offset-4"
                >
                  {dict.adminDeleteFile}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
