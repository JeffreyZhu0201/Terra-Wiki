'use client'

import { useEffect, useRef, useState } from 'react'
import type { TocEntry } from '@/server/markdown/toc'

export function TableOfContents({ entries, label }: { entries: TocEntry[]; label: string }) {
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (entries.length === 0) return

    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => element !== null)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((item) => item.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const first = visible[0]
        if (first) setActiveId(first.target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    )

    for (const heading of headings) observer.observe(heading)
    return () => observer.disconnect()
  }, [entries])

  // 目录过高会滚动：让当前阅读到的那一项保持在可视区。
  // block:'nearest' 只滚必要的最小距离，且不会连带滚动页面。
  useEffect(() => {
    if (!activeId) return
    const link = listRef.current?.querySelector<HTMLElement>(`a[href="#${CSS.escape(activeId)}"]`)
    link?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  if (entries.length === 0) return null

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 border-b border-rule pb-2 font-mono text-xs uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <div ref={listRef} className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
        <TocList entries={entries} activeId={activeId} />
      </div>
    </nav>
  )
}

/**
 * 窄屏用的折叠目录。侧栏目录在 xl 以下不显示，
 * 长文章在小屏上仍需要一条跳转路径。
 */
export function CollapsibleTableOfContents({
  entries,
  label,
}: {
  entries: TocEntry[]
  label: string
}) {
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null)

  useEffect(() => {
    if (entries.length === 0) return

    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => element !== null)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((item) => item.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const first = visible[0]
        if (first) setActiveId(first.target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    )

    for (const heading of headings) observer.observe(heading)
    return () => observer.disconnect()
  }, [entries])

  if (entries.length === 0) return null

  return (
    <details className="mb-6 border border-rule bg-surface px-3 py-2 xl:hidden">
      <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-ink-muted">
        {label}
      </summary>
      <div className="mt-2">
        <TocList entries={entries} activeId={activeId} />
      </div>
    </details>
  )
}

function TocList({ entries, activeId }: { entries: TocEntry[]; activeId: string | null }) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => {
        const active = entry.id === activeId
        // 层级用缩进表达：h2 顶格，h3 缩一档，h4 再缩一档。
        const indent = entry.depth <= 2 ? 'pl-3' : entry.depth === 3 ? 'pl-6' : 'pl-9'

        return (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={active ? 'location' : undefined}
              className={`-ml-px block border-l-2 py-1 leading-snug transition-colors ${indent} ${
                active
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:border-rule hover:text-ink'
              }`}
            >
              {entry.text}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
