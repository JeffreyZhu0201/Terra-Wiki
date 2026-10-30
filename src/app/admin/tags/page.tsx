import { mergeTagsAction, renameTagAction } from '@/app/admin/actions'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listTags } from '@/server/services/tags'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const tags = await listTags()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminTags}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      {tags.length === 0 ? (
        <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left font-mono text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-2 pr-4 font-normal">{dict.adminDisplayName}</th>
              <th className="py-2 pr-4 font-normal">{dict.adminSlug}</th>
              <th className="py-2 pr-4 font-normal">{dict.postCount}</th>
              <th className="py-2 font-normal">{dict.adminRename}</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-4">{tag.name}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{tag.slug}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{tag.postCount}</td>
                <td className="py-2.5">
                  <form action={renameTagAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={tag.id} />
                    <input
                      name="name"
                      defaultValue={tag.name}
                      className="border border-rule bg-surface px-2 py-1 text-ink"
                    />
                    <button
                      type="submit"
                      className="border border-rule px-2 py-1 hover:border-accent hover:text-accent"
                    >
                      {dict.adminRename}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tags.length > 1 ? (
        <form action={mergeTagsAction} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="font-mono text-xs text-ink-muted">{dict.adminMergeSource}</span>
            <select
              name="sourceId"
              required
              className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-xs text-ink-muted">{dict.adminMergeTarget}</span>
            <select
              name="targetId"
              required
              className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="border border-rule px-3 py-1.5 hover:border-accent">
            {dict.adminMergeTags}
          </button>
        </form>
      ) : null}
    </div>
  )
}
