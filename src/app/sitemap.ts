import type { MetadataRoute } from 'next'
import { listCategoryTree } from '@/server/services/categories'
import { listPosts, PUBLIC_ACTOR } from '@/server/services/posts'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tree, posts, settings] = await Promise.all([
    listCategoryTree(),
    listPosts({ actor: PUBLIC_ACTOR, limit: 5000 }),
    getSettings(),
  ])
  const SITE_URL = settings.siteUrl

  const flatten = (nodes: typeof tree): string[] =>
    nodes.flatMap((node) => [node.path, ...flatten(node.children)])

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/tags`, changeFrequency: 'weekly', priority: 0.4 },
    ...flatten(tree).map((path) => ({
      url: `${SITE_URL}/${path}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.items.map((post) => ({
      url: `${SITE_URL}/${post.categoryPath}/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
