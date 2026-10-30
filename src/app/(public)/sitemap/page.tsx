import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'
import { listCategoryTree } from '@/server/services/categories'
import { listPosts, PUBLIC_ACTOR } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

export default async function SitemapPage() {
  const dict = getDictionary(await getLocale())
  const [tree, posts] = await Promise.all([
    listCategoryTree(),
    listPosts({ actor: PUBLIC_ACTOR, limit: 500 }),
  ])

  const flatten = (nodes: typeof tree): { path: string; name: string }[] =>
    nodes.flatMap((node) => [{ path: node.path, name: node.name }, ...flatten(node.children)])

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ink">{dict.sitemapTitle}</h1>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.sitemapCategories}
        </h2>
        <ul className="space-y-1 text-sm">
          {flatten(tree).map((node) => (
            <li key={node.path}>
              <Link href={`/${node.path}`} className="text-ink hover:text-accent">
                {node.name}
              </Link>
              <span className="ml-2 font-mono text-xs text-ink-muted">/{node.path}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.sitemapPosts}
        </h2>
        <ul className="space-y-1 text-sm">
          {posts.items.map((post) => (
            <li key={post.id}>
              <Link
                href={`/${post.categoryPath}/${post.slug}`}
                className="text-ink hover:text-accent"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
