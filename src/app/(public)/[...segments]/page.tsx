import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { Markdown } from '@/components/article/Markdown'
import { MetaLine, TagLinks } from '@/components/article/MetaLine'
import { PostList } from '@/components/article/PostList'
import { TableOfContents } from '@/components/article/TableOfContents'
import { ViewCounter } from '@/components/article/ViewCounter'
import { getDictionary, getLocale } from '@/i18n'
import { renderMarkdown } from '@/server/markdown/render'
import { resolvePath } from '@/server/routes/resolve'
import { getCategoryById } from '@/server/services/categories'
import { getPostById, listPostTags, listPosts, PUBLIC_ACTOR } from '@/server/services/posts'
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

  const { html, toc } = await renderMarkdown(post.bodyMd)
  const views = await getViewCount(post.id)
  const tags = await listPostTags(post.id)

  return (
    <article className="mx-auto max-w-[1100px]">
      <header className="mb-8">
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

      <div className="flex gap-12">
        <Markdown html={html} />
        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-24">
            <TableOfContents entries={toc} label={dict.postTableOfContents} />
          </div>
        </aside>
      </div>

      <footer className="mt-12 border-t border-rule pt-4">
        <ViewCounter postId={post.id} initialViews={views} label={dict.postViews} />
      </footer>
    </article>
  )
}
