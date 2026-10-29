import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'
import type { PostListItem } from '@/server/services/posts'

export async function PostList({
  items,
  total,
  categoryPath,
  tag,
}: {
  items: PostListItem[]
  total: number
  categoryPath?: string
  tag?: string
}) {
  const dict = getDictionary(await getLocale())

  if (items.length === 0) {
    return <p className="py-12 text-sm text-ink-muted">{dict.categoryEmpty}</p>
  }

  return (
    <div>
      <ul className="divide-y divide-rule border-t border-rule">
        {items.map((item) => {
          const href = categoryPath
            ? `/${categoryPath}/${item.slug}${tag ? `?tag=${tag}` : ''}`
            : `/${item.categoryPath}/${item.slug}`

          return (
            <li key={item.id} className="py-5">
              <Link href={href} className="block">
                <h2 className="font-serif text-lg text-ink hover:text-accent">{item.title}</h2>
              </Link>

              {item.summary ? (
                <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">{item.summary}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-muted">
                <time dateTime={(item.publishedAt ?? item.updatedAt).toISOString()}>
                  {(item.publishedAt ?? item.updatedAt).toISOString().slice(0, 10)}
                </time>
                {item.tags.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.tags.map((tag) => `#${tag.name}`).join(' ')}</span>
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {total > items.length ? (
        <p className="mt-4 text-xs text-ink-muted">
          {total} {dict.postCount}
        </p>
      ) : null}
    </div>
  )
}
