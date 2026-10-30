'use client'

import { useEffect, useState } from 'react'
import type { TocEntry } from '@/server/markdown/toc'

export function TableOfContents({ entries, label }: { entries: TocEntry[]; label: string }) {
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
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <ul className="space-y-1 border-l border-rule">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={entry.id === activeId ? 'location' : undefined}
              className={
                entry.id === activeId
                  ? `block border-l-2 border-accent pl-3 text-ink ${entry.depth === 3 ? 'pl-6' : ''}`
                  : `block border-l-2 border-transparent pl-3 text-ink-muted hover:text-ink ${entry.depth === 3 ? 'pl-6' : ''}`
              }
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
