import Link from 'next/link'
import { PostList } from '@/components/article/PostList'
import { getDictionary, getLocale } from '@/i18n'
import { listCategoryTree } from '@/server/services/categories'
import { listPosts, PUBLIC_ACTOR } from '@/server/services/posts'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)

  const [latest, featured, tree, settings] = await Promise.all([
    listPosts({ actor: PUBLIC_ACTOR, limit: 20 }),
    listPosts({ actor: PUBLIC_ACTOR, featured: true, limit: 5 }),
    listCategoryTree(),
    getSettings(),
  ])

  return (
    <div>
      <section className="mb-14">
        <h1 className="font-serif text-4xl leading-tight text-ink">{settings.siteName}</h1>
      </section>

      {featured.items.length > 0 ? (
        <section className="mb-12">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
            {dict.homeFeatured}
          </h2>
          <PostList items={featured.items} total={featured.total} />
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.homeLatest}
        </h2>
        <PostList items={latest.items} total={latest.total} />
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.homeCategories}
        </h2>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((node) => (
            <li key={node.id}>
              <Link href={`/${node.path}`} className="text-ink hover:text-accent">
                {node.name}
                <span className="ml-2 font-mono text-xs text-ink-muted">{node.postCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
