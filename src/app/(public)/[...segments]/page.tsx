import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { Markdown } from '@/components/article/Markdown'
import { MetaLine, TagLinks } from '@/components/article/MetaLine'
import { PostList } from '@/components/article/PostList'
import { CollapsibleTableOfContents, TableOfContents } from '@/components/article/TableOfContents'
import { ViewCounter } from '@/components/article/ViewCounter'
import { PublishCalendar } from '@/components/layout/PublishCalendar'
import { getDictionary, getLocale } from '@/i18n'
import { dayKey, monthRange } from '@/lib/calendar'
import { renderMarkdown } from '@/server/markdown/render'
import { resolvePath } from '@/server/routes/resolve'
import { getCategoryById } from '@/server/services/categories'
import { countPostsByDay, getPostById, listPostTags, listPosts, PUBLIC_ACTOR } from '@/server/services/posts'
import { getViewCount } from '@/server/services/views'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PAGE_SIZE = 20

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { segments } = await params
  const resolved = await resolvePath(segments)
  if (!resolved || resolved.kind !== 'post') return {}

  const post = await getPostById(resolved.postId)
  if (!post) return {}

  return {
    title: post.title,
    description: post.summary ?? undefined,
    openGraph: {
      title: post.title,
      description: post.summary ?? undefined,
      type: 'article',
    },
  }
}

export default async function CatchAllPage({ params, searchParams }: Props) {
  const { segments } = await params
  const query = await searchParams
  const resolved = await resolvePath(segments)

  if (!resolved) notFound()
  if (resolved.kind === 'redirect') permanentRedirect(resolved.to)
  if (resolved.kind === 'home') redirect('/')

  const locale = await getLocale()
  const dict = getDictionary(locale)

  if (resolved.kind === 'category') {
    const category = await getCategoryById(resolved.categoryId)
    if (!category) notFound()

    const tag = firstParam(query.tag)
    const page = Math.max(1, Number(firstParam(query.page) ?? '1') || 1)

    const { items, total } = await listPosts({
      actor: PUBLIC_ACTOR,
      categoryPathPrefix: category.path,
      ...(tag ? { tag } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })

    return (
      <div>
        <header className="mb-8">
          <h1 className="font-serif text-3xl text-ink">{category.name}</h1>
          {category.description ? (
            <p className="mt-2 max-w-[60ch] text-sm text-ink-muted">{category.description}</p>
          ) : null}
          {tag ? (
            <p className="mt-2 font-mono text-xs text-ink-muted">
              {dict.postTags} #{tag}
            </p>
          ) : null}
        </header>

        <PostList items={items} total={total} categoryPath={category.path} {...(tag ? { tag } : {})} />
      </div>
    )
  }

  const post = await getPostById(resolved.postId)
  if (!post) notFound()

  const now = new Date()
  const calMonth = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const [calFrom, calTo] = monthRange(calMonth.year, calMonth.month)
  const [{ html, toc }, views, tags, counts] = await Promise.all([
    renderMarkdown(post.bodyMd),
    getViewCount(post.id),
    listPostTags(post.id),
    countPostsByDay(calFrom, calTo),
  ])
  const todayKey = dayKey(now)

  return (
    <article className="mx-auto w-full max-w-[1180px]">
      <header className="mb-10 max-w-[68ch] border-b border-rule pb-6">
        <h1 className="font-serif text-3xl leading-tight text-ink">{post.title}</h1>
        <div className="mt-3">
          <MetaLine
            post={post}
            views={views}
            publishedLabel={dict.postPublished}
            authorLabel={dict.postAuthor}
            readingLabel={dict.postReadingTime}
            viewsLabel={dict.postViews}
          />
        </div>
        <div className="mt-3">
          <TagLinks tags={tags} categoryPath={resolved.categoryPath} />
        </div>
      </header>

      {/* 窄屏没有侧栏，给一条折叠的跳转路径。 */}
      <CollapsibleTableOfContents entries={toc} label={dict.postTableOfContents} />

      {/*
        正文与目录并排两列：目录贴右边缘，与正文顶端平齐。
        用 grid 而不是 flex——flex 子项的 min-width 默认是 auto，
        中文没有词边界，长段落的 min-content 很大，会把正文列撑破，
        正文被压到 322px，右侧空出一大片。
      */}
      <div className="grid gap-x-12 xl:grid-cols-[minmax(0,68ch)_14rem] xl:justify-between">
        <div className="min-w-0">
          <Markdown html={html} />

          <footer className="mt-12 border-t border-rule pt-4">
            <ViewCounter postId={post.id} initialViews={views} label={dict.postViews} />
          </footer>
        </div>

        {/*
          右栏 fixed 钉在视口：正文在 main 里滚，栏若留在文档流里就会跟着滚。
          pt-8 与正文、左栏的顶 padding 一致，三栏同一水平线起头。
          grid 的第二列保留宽度占位，正文列不会被日历压到。
        */}
        <aside className="fixed bottom-0 right-[max(1.25rem,calc((100vw-1440px)/2+1.25rem))] top-14 hidden w-[14rem] flex-col pb-8 pt-8 xl:flex">
          <TableOfContents entries={toc} label={dict.postTableOfContents} />
          <div className="mt-auto">
            <PublishCalendar
              year={calMonth.year}
              month={calMonth.month}
              counts={counts}
              selectedDay={null}
              labels={{
                title: dict.calendarTitle,
                prevMonth: dict.calendarPrevMonth,
                nextMonth: dict.calendarNextMonth,
                today: dict.calendarToday,
                weekdays: Array.from(dict.calendarWeekdays),
              }}
              dayHref={(day) => `/?day=${day}`}
              monthHref={(year, month) => `/?month=${year}-${String(month).padStart(2, '0')}`}
            />
          </div>
        </aside>
      </div>
    </article>
  )
}
