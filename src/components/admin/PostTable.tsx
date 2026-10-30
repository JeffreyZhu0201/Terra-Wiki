import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'
import { getViewCount } from '@/server/services/views'
import type { PostListItem } from '@/server/services/posts'

export async function PostTable({ items }: { items: PostListItem[] }) {
  const dict = getDictionary(await getLocale())

  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
  }

  const views = await Promise.all(items.map((item) => getViewCount(item.id)))

  const statusLabel: Record<PostListItem['status'], string> = {
    draft: dict.adminStatusDraft,
    published: dict.adminStatusPublished,
    archived: dict.adminStatusArchived,
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-rule text-left font-mono text-xs uppercase tracking-wider text-ink-muted">
          <th className="py-2 pr-4 font-normal">{dict.adminColumnTitle}</th>
          <th className="py-2 pr-4 font-normal">{dict.adminColumnStatus}</th>
          <th className="py-2 pr-4 font-normal">{dict.adminColumnCategory}</th>
          <th className="py-2 pr-4 font-normal">{dict.adminColumnUpdated}</th>
          <th className="py-2 pr-4 font-normal">{dict.adminColumnViews}</th>
          <th className="py-2 font-normal">{dict.adminColumnActions}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item.id} className="border-b border-rule align-top">
            <td className="py-2.5 pr-4">
              <Link href={`/admin/posts/${item.id}`} className="text-ink hover:text-accent">
                {item.title}
              </Link>
              {item.tags.length > 0 ? (
                <p className="mt-0.5 font-mono text-xs text-ink-muted">
                  {item.tags.map((tag) => `#${tag.name}`).join(' ')}
                </p>
              ) : null}
            </td>
            <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">
              {statusLabel[item.status]}
            </td>
            <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">
              {item.categoryPath}
            </td>
            <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">
              {item.updatedAt.toISOString().slice(0, 10)}
            </td>
            <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{views[index] ?? 0}</td>
            <td className="py-2.5">
              <Link
                href={`/admin/posts/${item.id}`}
                className="font-mono text-xs text-accent underline underline-offset-4"
              >
                {dict.adminEdit}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
