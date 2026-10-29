import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'
import { listTags } from '@/server/services/tags'

export const dynamic = 'force-dynamic'

export default async function TagsPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const tags = await listTags()

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ink">{dict.tagIndex}</h1>

      {tags.length === 0 ? (
        <p className="text-sm text-ink-muted">{dict.tagEmpty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id}>
              <Link
                href={`/tags/${tag.slug}`}
                className="inline-flex items-center gap-2 border border-rule px-3 py-1.5 font-mono text-sm text-ink hover:border-accent hover:text-accent"
              >
                #{tag.name}
                <span className="text-xs text-ink-muted">{tag.postCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
