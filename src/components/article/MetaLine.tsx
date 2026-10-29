import Link from 'next/link'
import { estimateReadingTime } from '@/lib/reading-time'
import type { Post } from '@/server/services/posts'

export function MetaLine({
  post,
  views,
  publishedLabel,
  readingLabel,
  viewsLabel,
}: {
  post: Post
  views?: number
  publishedLabel: string
  readingLabel: string
  viewsLabel: string
}) {
  const minutes = estimateReadingTime(post.bodyMd)
  const date = post.publishedAt ?? post.createdAt

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-muted">
      <time dateTime={date.toISOString()}>
        {publishedLabel} {date.toISOString().slice(0, 10)}
      </time>
      <span aria-hidden="true">·</span>
      <span>
        {minutes} {readingLabel}
      </span>
      {views !== undefined ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {views} {viewsLabel}
          </span>
        </>
      ) : null}
    </div>
  )
}

export function TagLinks({
  tags,
  categoryPath,
}: {
  tags: { slug: string; name: string }[]
  categoryPath: string
}) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={`/${categoryPath}?tag=${tag.slug}`}
          className="border border-rule px-2 py-0.5 font-mono text-xs text-ink-muted hover:border-accent hover:text-ink"
        >
          #{tag.name}
        </Link>
      ))}
    </div>
  )
}
