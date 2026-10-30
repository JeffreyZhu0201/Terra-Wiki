'use client'

import { useEffect, useRef, useState } from 'react'
import type { TocEntry } from '@/server/markdown/toc'

/**
 * 高亮「当前读到的那一节」：以视口中线为判定线，
 * 最后一个已经越过中线的标题即当前小节——正文滚到哪里，目录就亮到哪里。
 * 视口里同时有多个标题时，IntersectionObserver 的「可见」会同时命中好几个，
 * 那种做法只能靠顶部排序猜，读到页面中间时常常对不上。
 */
function useActiveHeading(entries: TocEntry[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null)

  useEffect(() => {
    if (entries.length === 0) return

    // 正文滚动发生在外壳的 main 里，不是 window——监听真正滚动的那个容器。
    const scroller = document.getElementById('content')
    const isScroller = scroller !== null && scroller.scrollHeight > scroller.clientHeight

    let frame = 0
    const update = () => {
      frame = 0
      // 中线按「正在阅读的那一屏」算：滚动容器取自身中线，否则取视口中线。
      const mid = isScroller
        ? scroller.getBoundingClientRect().top + scroller.clientHeight / 2
        : window.innerHeight / 2

      let current = entries[0]?.id ?? null

      for (const entry of entries) {
        const element = document.getElementById(entry.id)
        if (!element) continue
        // 标题顶部还没有越过中线，后面的更靠下，不必再看。
        if (element.getBoundingClientRect().top > mid) break
        current = entry.id
      }

      // 滚到底时最后一节可能永远够不到中线，兜底选它。
      // 但必须真的「滚到末尾」才算——短文章只需几十像素就触底，
      // 那时读者还在开头，不能因为触底就把最后一节点亮。
      const scrolled = scroller ? scroller.scrollTop : window.scrollY
      const pageSize = scroller ? scroller.clientHeight : window.innerHeight
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        : window.innerHeight + window.scrollY >= document.body.scrollHeight - 2
      if (atBottom && scrolled > pageSize / 2) current = entries.at(-1)?.id ?? current

      setActiveId((prev) => (prev === current ? prev : current))
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    // 首帧后重算一次：挂载时字体/图片尚未定型，标题位置还会变。
    frame = window.requestAnimationFrame(update)

    const target: EventTarget = isScroller ? scroller : window
    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    // 容器尺寸变化（图片加载、字体回流）时也要重算中线。
    const resizeObserver =
      isScroller && scroller && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(onScroll)
        : null
    if (resizeObserver && scroller) {
      resizeObserver.observe(scroller)
      const body = document.querySelector('.prose')
      if (body) resizeObserver.observe(body)
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      resizeObserver?.disconnect()
    }
  }, [entries])

  return activeId
}

export function TableOfContents({ entries, label }: { entries: TocEntry[]; label: string }) {
  const activeId = useActiveHeading(entries)
  const listRef = useRef<HTMLDivElement>(null)

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
      <div ref={listRef} className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
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
  const activeId = useActiveHeading(entries)

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
