import {
  deleteCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
} from '@/app/admin/actions'
import { getDictionary, getLocale } from '@/i18n'
import type { CategoryNode } from '@/server/services/categories'

type FlatCategory = {
  id: string
  path: string
  name: string
}

/** 拍平分类树，移动下拉框要用。 */
function flatten(nodes: CategoryNode[]): FlatCategory[] {
  return nodes.flatMap((node) => [
    { id: node.id, path: node.path, name: node.name },
    ...flatten(node.children),
  ])
}

/** 自己 + 全部后代的 id——移到这些下面会成环。 */
function forbiddenIds(node: CategoryNode): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children) {
    for (const id of forbiddenIds(child)) ids.add(id)
  }
  return ids
}

/**
 * 分类树编辑器。每个节点带三组操作：改名、移动、删除。
 * 三个操作各自独立成表单——HTML 不允许表单嵌套。
 */
export async function CategoryTreeEditor({ nodes }: { nodes: CategoryNode[] }) {
  const dict = getDictionary(await getLocale())
  const all = flatten(nodes)

  return (
    <ul className="space-y-3">
      {nodes.map((node) => (
        <CategoryNodeRow key={node.id} node={node} all={all} labels={dict} />
      ))}
    </ul>
  )
}

function CategoryNodeRow({
  node,
  all,
  labels,
}: {
  node: CategoryNode
  all: FlatCategory[]
  labels: ReturnType<typeof getDictionary>
}) {
  const blocked = forbiddenIds(node)
  const moveTargets = all.filter((item) => !blocked.has(item.id))
  const isEmpty = node.children.length === 0 && node.ownPostCount === 0

  return (
    <li className="border border-rule bg-surface px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-sm text-accent">{node.path}</span>
        <span className="text-ink">{node.name}</span>
        <span className="font-mono text-xs text-ink-muted">
          {node.ownPostCount} {labels.postCount}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-4 text-xs">
        <form action={renameCategoryAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={node.id} />
          <label className="block">
            <span className="font-mono text-ink-muted">{labels.adminDisplayName}</span>
            <input
              name="name"
              defaultValue={node.name}
              className="mt-1 block border border-rule bg-paper px-2 py-1 text-ink"
            />
          </label>
          <label className="block">
            <span className="font-mono text-ink-muted">{labels.adminSlug}</span>
            <input
              name="slug"
              defaultValue={node.slug}
              className="mt-1 block border border-rule bg-paper px-2 py-1 font-mono text-ink"
            />
          </label>
          <button
            type="submit"
            className="border border-rule px-2 py-1 hover:border-accent hover:text-accent"
          >
            {labels.adminRename}
          </button>
        </form>

        <form action={moveCategoryAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={node.id} />
          <label className="block">
            <span className="font-mono text-ink-muted">{labels.adminParent}</span>
            <select
              name="parentId"
              defaultValue={node.parentId ?? ''}
              className="mt-1 block border border-rule bg-paper px-2 py-1 font-mono text-ink"
            >
              <option value="">{labels.adminTopLevel}</option>
              {moveTargets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.path}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="border border-rule px-2 py-1 hover:border-accent hover:text-accent"
          >
            {labels.adminMove}
          </button>
        </form>

        <form action={deleteCategoryAction}>
          <input type="hidden" name="id" value={node.id} />
          <button
            type="submit"
            disabled={!isEmpty}
            title={isEmpty ? undefined : labels.adminCategoryNotEmpty}
            className="border border-rule px-2 py-1 text-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            {labels.adminDelete}
          </button>
        </form>
      </div>

      {node.children.length > 0 ? (
        <ul className="mt-3 space-y-3 border-l border-rule pl-4">
          {node.children.map((child) => (
            <CategoryNodeRow key={child.id} node={child} all={all} labels={labels} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
