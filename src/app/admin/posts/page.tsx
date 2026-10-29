import Link from 'next/link'
import { PostTable } from '@/components/admin/PostTable'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listCategoryTree } from '@/server/services/categories'
import { listPosts, type Actor, type PostStatus } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const dict = getDictionary(await getLocale())
  const query = await searchParams

  const statusParam = one(query.status)
  const status: PostStatus | undefined =
    statusParam === 'draft' || statusParam === 'published' || statusParam === 'archived'
      ? statusParam
      : undefined
  const categoryPath = one(query.category)
  const tag = one(query.tag)
  const page = Math.max(1, Number(one(query.page) ?? '1') || 1)

  const actor: Actor = { kind: 'user', id: user.id, role: user.role }
  const tree = await listCategoryTree()

  const { items, total } = await listPosts({
    actor,
    ...(status ? { status } : {}),
    ...(categoryPath ? { categoryPathPrefix: categoryPath } : {}),
    ...(tag ? { tag } : {}),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const flat = (nodes: typeof tree): { path: string; name: string }[] =>
    nodes.flatMap((node) => [{ path: node.path, name: node.name }, ...flat(node.children)])

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-ink">{dict.adminPosts}</h1>
        <Link
          href="/admin/posts/new"
          className="bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover"
        >
          {dict.adminNewPost}
        </Link>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminColumnStatus}</span>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 block border border-rule bg-surface px-2 py-1.5"
          >
            <option value="">{dict.adminAllStatuses}</option>
            <option value="draft">{dict.adminStatusDraft}</option>
            <option value="published">{dict.adminStatusPublished}</option>
            <option value="archived">{dict.adminStatusArchived}</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminColumnCategory}</span>
          <select
            name="category"
            defaultValue={categoryPath ?? ''}
            className="mt-1 block border border-rule bg-surface px-2 py-1.5"
          >
            <option value="">{dict.adminAllStatuses}</option>
            {flat(tree).map((node) => (
              <option key={node.path} value={node.path}>
                {node.path}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.postTags}</span>
          <input
            name="tag"
            defaultValue={tag ?? ''}
            className="mt-1 block border border-rule bg-surface px-2 py-1.5"
          />
        </label>

        <button type="submit" className="border border-rule px-3 py-1.5 hover:border-accent">
          {dict.searchQuery}
        </button>
      </form>

      <PostTable items={items} />

      {total > items.length ? (
        <p className="text-xs text-ink-muted">
          {total} {dict.postCount}
        </p>
      ) : null}
    </div>
  )
}
