'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { CategoryNode } from '@/server/services/categories'

function TreeBranch({
  node,
  pathname,
  depth,
}: {
  node: CategoryNode
  pathname: string
  depth: number
}) {
  const [open, setOpen] = useState(depth === 0)
  const href = `/${node.path}`
  const current = pathname === href
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? `折叠 ${node.name}` : `展开 ${node.name}`}
            className="w-4 shrink-0 text-xs text-ink-muted hover:text-ink"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <Link
          href={href}
          aria-current={current ? 'page' : undefined}
          className={
            current
              ? 'border-l-2 border-accent py-0.5 pl-2 font-medium text-ink'
              : 'border-l-2 border-transparent py-0.5 pl-2 text-ink-muted hover:text-ink'
          }
        >
          {node.name}
        </Link>
      </div>

      {hasChildren && open ? (
        <ul className="ml-2 space-y-0.5">
          {node.children.map((child) => (
            <TreeBranch key={child.id} node={child} pathname={pathname} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function CategoryTree({ nodes }: { nodes: CategoryNode[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Categories" className="text-sm">
      <ul className="space-y-0.5">
        {nodes.map((node) => (
          <TreeBranch key={node.id} node={node} pathname={pathname} depth={0} />
        ))}
      </ul>
    </nav>
  )
}
