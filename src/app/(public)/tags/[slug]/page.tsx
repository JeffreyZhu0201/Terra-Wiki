import { notFound } from 'next/navigation'
import { PostList } from '@/components/article/PostList'
import { listPosts, PUBLIC_ACTOR } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { items, total } = await listPosts({ actor: PUBLIC_ACTOR, tag: slug, limit: 100 })

  if (total === 0) notFound()

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ink">#{slug}</h1>
      <PostList items={items} total={total} />
    </div>
  )
}
