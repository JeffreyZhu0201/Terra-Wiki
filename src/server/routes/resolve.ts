import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { categories, posts, redirects } from '../db/schema'
import { getCategoryByPath } from '../services/categories'

export type ResolvedRoute =
  | { kind: 'home' }
  | { kind: 'category'; categoryId: string; path: string }
  | { kind: 'post'; postId: string; categoryPath: string; slug: string }
  | { kind: 'redirect'; to: string }

/**
 * 把一段 URL 解析成路由。顺序是固定的，不能调换：
 *   ① 完整路径命中分类 → 分类页
 *   ② 末段作文章 slug、其余作分类路径命中已发布文章 → 文章页
 *   ③ 命中重定向表 → 301
 *   ④ 都没有 → null（404）
 * ①和②不会同时命中——文章 slug 与同级子分类 slug 互斥。
 */
export async function resolvePath(segments: string[]): Promise<ResolvedRoute | null> {
  const clean = segments.filter((segment) => segment.length > 0)
  if (clean.length === 0) return { kind: 'home' }

  const path = clean.join('/')

  const category = await getCategoryByPath(path)
  if (category) {
    return { kind: 'category', categoryId: category.id, path: category.path }
  }

  if (clean.length >= 2) {
    const slug = clean[clean.length - 1] ?? ''
    const categoryPath = clean.slice(0, -1).join('/')
    const row = (
      await db
        .select({ id: posts.id })
        .from(posts)
        .innerJoin(categories, eq(posts.categoryId, categories.id))
        .where(
          and(
            eq(categories.path, categoryPath),
            eq(posts.slug, slug),
            eq(posts.status, 'published'),
          ),
        )
    )[0]
    if (row) return { kind: 'post', postId: row.id, categoryPath, slug }
  }

  const redirect = (
    await db.select().from(redirects).where(eq(redirects.fromPath, `/${path}`))
  )[0]
  if (redirect) return { kind: 'redirect', to: redirect.toPath }

  return null
}
