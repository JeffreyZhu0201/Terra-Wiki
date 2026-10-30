import { redirect } from 'next/navigation'
import { createCategoryAction } from '@/app/admin/actions'
import { CategoryTreeEditor } from '@/components/admin/CategoryTreeEditor'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listCategoryTree, type CategoryNode } from '@/server/services/categories'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** 拍平分类树——建分类时选上级用。 */
function flatten(nodes: CategoryNode[]): { id: string; path: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, path: node.path },
    ...flatten(node.children),
  ])
}

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  // 分类治理是管理员的活——作者和 MCP 的作者角色都做不到。
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const tree = await listCategoryTree()
  const flat = flatten(tree)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminCategories}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <form action={createCategoryAction} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminParent}</span>
          <select
            name="parentId"
            defaultValue=""
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 font-mono text-ink"
          >
            <option value="">{dict.adminTopLevel}</option>
            {flat.map((node) => (
              <option key={node.id} value={node.id}>
                {node.path}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSlug}</span>
          <input
            name="slug"
            required
            placeholder="rust"
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 font-mono text-ink"
          />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminDisplayName}</span>
          <input
            name="name"
            required
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
          />
        </label>
        <button type="submit" className="bg-accent px-3 py-2 text-paper hover:bg-accent-hover">
          {dict.adminNewCategory}
        </button>
      </form>

      {tree.length === 0 ? (
        <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
      ) : (
        <CategoryTreeEditor nodes={tree} />
      )}
    </div>
  )
}
