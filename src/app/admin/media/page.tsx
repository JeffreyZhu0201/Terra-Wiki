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

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const dict = getDictionary(await getLocale())
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
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {media.map((item) => (
            <li key={item.id} className="border border-rule bg-surface p-2">
              {/* 图片来自本站上传目录，Next 图片优化对本地磁盘不适用。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.filename} className="h-24 w-full object-cover" />
              <p className="mt-1 truncate font-mono text-xs text-ink-muted">{item.filename}</p>
              <form action={deleteMediaAction} className="mt-1">
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
