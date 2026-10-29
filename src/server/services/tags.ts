import { pinyin } from 'pinyin'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { postTags, redirects, tags } from '../db/schema'
import { DomainError } from '../errors'

export type Tag = {
  id: string
  slug: string
  name: string
}

export type TagWithCount = Tag & { postCount: number }

/**
 * 标签 slug：小写 + 非字母数字转连字符，最长 80。
 * 中文走拼音——标签是给人看的，中文名必须能用，URL 还得是 ASCII。
 */
export function tagSlug(name: string): string {
  const normalized = name.normalize('NFKC').toLowerCase()
  const hasCjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(normalized)
  const ascii = hasCjk
    ? pinyin(normalized, { style: 'normal' })
        .map((syllables) => syllables[0] ?? '')
        .join('-')
    : normalized

  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

export async function listTags(): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`(select count(*) from ${postTags} where ${postTags.tagId} = ${tags.id})`,
    })
    .from(tags)
    .orderBy(asc(tags.slug))

  return rows.map((row) => ({ ...row, postCount: Number(row.postCount) }))
}

/** 按名字取标签，不存在就建。已存在则返回原记录（幂等）。 */
export async function createTag(name: string): Promise<Tag> {
  const slug = tagSlug(name)
  if (!slug) throw new DomainError('invalid', '标签名转不出合法的 slug', { name })

  const existing = (await db.select().from(tags).where(eq(tags.slug, slug)))[0]
  if (existing) return existing

  const row = (await db.insert(tags).values({ slug, name: name.trim() }).returning())[0]
  if (!row) throw new DomainError('conflict', '标签创建失败', { name })

  return row
}

export async function renameTag(id: string, name: string): Promise<Tag> {
  const current = (await db.select().from(tags).where(eq(tags.id, id)))[0]
  if (!current) throw new DomainError('not_found', '标签不存在', { id })

  const slug = tagSlug(name)
  if (!slug) throw new DomainError('invalid', '标签名转不出合法的 slug', { name })

  const clash = (await db.select().from(tags).where(eq(tags.slug, slug)))[0]
  if (clash && clash.id !== id) {
    throw new DomainError('conflict', '这个标签名已经被占用', { slug })
  }

  const row = (
    await db.update(tags).set({ slug, name: name.trim() }).where(eq(tags.id, id)).returning()
  )[0]
  if (!row) throw new DomainError('not_found', '标签不存在', { id })

  // 标签页 URL 变了，旧地址留个跳转。
  if (current.slug !== slug) {
    await db
      .insert(redirects)
      .values({ fromPath: `/tags/${current.slug}`, toPath: `/tags/${slug}` })
      .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: `/tags/${slug}` } })
  }

  return row
}

/** 把 source 标签合并进 target：文章关联迁移过去，同一篇只留一条关联。 */
export async function mergeTags(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new DomainError('invalid', '不能把标签合并到它自己')

  const source = (await db.select().from(tags).where(eq(tags.id, sourceId)))[0]
  if (!source) throw new DomainError('not_found', '源标签不存在', { id: sourceId })
  const target = (await db.select().from(tags).where(eq(tags.id, targetId)))[0]
  if (!target) throw new DomainError('not_found', '目标标签不存在', { id: targetId })

  await db.transaction(async (tx) => {
    const sourceLinks = await tx
      .select({ postId: postTags.postId })
      .from(postTags)
      .where(eq(postTags.tagId, sourceId))

    if (sourceLinks.length > 0) {
      await tx
        .insert(postTags)
        .values(sourceLinks.map((row) => ({ postId: row.postId, tagId: targetId })))
        .onConflictDoNothing()
    }

    await tx.delete(postTags).where(eq(postTags.tagId, sourceId))
    await tx.delete(tags).where(eq(tags.id, sourceId))
  })
}
