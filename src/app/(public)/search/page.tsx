import { getDictionary, getLocale } from '@/i18n'
import { PostList } from '@/components/article/PostList'
import { searchPosts, PUBLIC_ACTOR } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const raw = query.q
  const term = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''

  const locale = await getLocale()
  const dict = getDictionary(locale)

  const results = term ? await searchPosts({ actor: PUBLIC_ACTOR, q: term, limit: 50 }) : []

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ink">
        {dict.searchResults}
        {term ? <span className="ml-2 text-ink-muted">“{term}”</span> : null}
      </h1>

      {term && results.length === 0 ? (
        <p className="py-12 text-sm text-ink-muted">{dict.searchNoResults}</p>
      ) : results.length > 0 ? (
        <PostList items={results} total={results.length} />
      ) : (
        <p className="py-12 text-sm text-ink-muted">{dict.searchPlaceholder}</p>
      )}
    </div>
  )
}
