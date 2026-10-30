import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { db } from '../db/client'
import { categories, postRevisions, postTags, posts, tags, users } from '../db/schema'
import { DomainError } from '../errors'
import { isUuid } from '../uuid'
import { ensureUniqueSlug, isValidSlug, slugify } from '../slug'
import { getCategoryById } from './categories'
import { createTag } from './tags'

export type PostStatus = 'draft' | 'published' | 'archived'

/** 谁在写。人与 Agent 共用同一套权限语义。 */
export type Actor =
  | { kind: 'user'; id: string; role: 'admin' | 'author' }
  | { kind: 'token'; id: string; authorId: string; role: 'admin' | 'author'; canPublish: boolean }

/** 公开浏览用的身份：只看得到已发布内容。 */
export const PUBLIC_ACTOR: Actor = { kind: 'user', id: '', role: 'author' }

export type Post = {
  id: string
  categoryId: string
  slug: string
  title: string
  summary: string | null
  bodyMd: string
  status: PostStatus
  authorId: string
  /** 作者名（human 与 token 发布都落到成员头上），文章页展示用。 */
  authorName?: string
  featured: boolean
  coverImage: string | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type PostListItem = {
  id: string
  slug: string
  title: string
  summary: string | null
  status: PostStatus
  authorId: string
  categoryId: string
  categoryPath: string
  tags: { slug: string; name: string }[]
  publishedAt: Date | null
  updatedAt: Date
}

type PostRow = typeof posts.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** actor 对应的用户 id。Token 归属到它的作者。 */
export function actorUserId(actor: Actor): string {
  return actor.kind === 'user' ? actor.id : actor.authorId
}

/** 人可以直接发布；Agent 受 token 的 can_publish 限制。 */
export function actorCanPublish(actor: Actor): boolean {
  return actor.kind === 'user' ? true : actor.canPublish
}

/**
 * 作者只能改自己的文章，管理员可以改任何人的。
 * MCP 与后台走同一套规则——通道不同，权限语义必须一致。
 */
export function assertCanModify(actor: Actor, post: Post): void {
  if (actor.role === 'admin') return
  if (post.authorId !== actorUserId(actor)) {
    // 报"不存在"而不是"没权限"——不该让人知道这篇草稿存在。
    throw new DomainError('not_found', '文章不存在', { id: post.id })
  }
}

/** 某篇文章的标签。 */
export async function listPostTags(postId: string): Promise<{ slug: string; name: string }[]> {
  const rows = await db
    .select({ slug: tags.slug, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, postId))

  return rows
}
function toPost(row: PostRow): Post {
  return {
    id: row.id,
    categoryId: row.categoryId,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    bodyMd: row.bodyMd,
    status: row.status,
    authorId: row.authorId,
    featured: row.featured,
    coverImage: row.coverImage,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * 同一个分类下，文章 slug 和子分类 slug 占用同一段 URL 空间
 * （/分类/xxx），两者必须互斥，否则路由消歧会出错。
 */
async function assertSlugNotTakenByChildCategory(
  categoryId: string,
  slug: string,
): Promise<void> {
  const child = (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, categoryId), eq(categories.slug, slug)))
  )[0]
  if (child) {
    throw new DomainError('conflict', '这个 slug 已经被同级子分类占用', { slug })
  }
}

/** 显式传入的 slug 必须可用；自动生成的撞车则加后缀。 */
async function resolveSlug(
  categoryId: string,
  title: string,
  explicit: string | undefined,
): Promise<string> {
  const existing = new Set(
    (
      await db
        .select({ slug: posts.slug })
        .from(posts)
        .where(eq(posts.categoryId, categoryId))
    ).map((row) => row.slug),
  )
  const taken = (candidate: string): boolean => existing.has(candidate)

  if (explicit !== undefined) {
    if (!isValidSlug(explicit)) {
      throw new DomainError('invalid', 'slug 只能是小写字母、数字和连字符，长度 1–80', {
        slug: explicit,
      })
    }
    if (taken(explicit)) {
      throw new DomainError('conflict', '这个 slug 已经被占用', { slug: explicit })
    }
    await assertSlugNotTakenByChildCategory(categoryId, explicit)
    return explicit
  }

  const base = slugify(title)
  const unique = ensureUniqueSlug(base, (candidate) => taken(candidate))
  await assertSlugNotTakenByChildCategory(categoryId, unique)
  return unique
}

/** 设置文章标签：传入即最终集合。 */
async function applyTags(tx: Tx, postId: string, names: string[]): Promise<void> {
  await tx.delete(postTags).where(eq(postTags.postId, postId))
  for (const name of names) {
    const tag = await createTag(name)
    await tx.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing()
  }
}

async function attachTags(rows: PostListItem[]): Promise<PostListItem[]> {
  if (rows.length === 0) return rows
  const ids = rows.map((row) => row.id)
  const links = await db
    .select({ postId: postTags.postId, slug: tags.slug, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, ids))

  const byPost = new Map<string, { slug: string; name: string }[]>()
  for (const link of links) {
    const list = byPost.get(link.postId) ?? []
    list.push({ slug: link.slug, name: link.name })
    byPost.set(link.postId, list)
  }

  return rows.map((row) => ({ ...row, tags: byPost.get(row.id) ?? [] }))
}

export async function createPost(input: {
  actor: Actor
  categoryId: string
  slug?: string
  title: string
  summary?: string
  bodyMd: string
  tags?: string[]
}): Promise<Post> {
  const category = await getCategoryById(input.categoryId)
  if (!category) {
    throw new DomainError('not_found', '分类不存在', { categoryId: input.categoryId })
  }

  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, category.id))
  if (child) {
    throw new DomainError('invalid', '文章只能放在叶子分类下', { categoryId: category.id })
  }

  const slug = await resolveSlug(category.id, input.title, input.slug)
  const authorId = actorUserId(input.actor)

  return db.transaction(async (tx) => {
    const row = (
      await tx
        .insert(posts)
        .values({
          categoryId: category.id,
          slug,
          title: input.title,
          summary: input.summary ?? null,
          bodyMd: input.bodyMd,
          status: 'draft',
          authorId,
        })
        .returning()
    )[0]
    if (!row) throw new DomainError('conflict', '文章创建失败')

    if (input.tags && input.tags.length > 0) {
      await applyTags(tx, row.id, input.tags)
    }

    return toPost(row)
  })
}

export async function updatePost(input: {
  actor: Actor
  id: string
  slug?: string
  title?: string
  summary?: string | null
  bodyMd?: string
  tags?: string[]
  featured?: boolean
  expectedUpdatedAt?: Date
}): Promise<Post> {
  const current = await getPostById(input.id)
  if (!current) throw new DomainError('not_found', '文章不存在', { id: input.id })
  assertCanModify(input.actor, current)

  if (
    input.expectedUpdatedAt !== undefined &&
    Math.abs(current.updatedAt.getTime() - input.expectedUpdatedAt.getTime()) > 1
  ) {
    throw new DomainError('conflict', '文章已被他人修改，请重新加载后再保存', { id: input.id })
  }

  const nextTitle = input.title ?? current.title
  const nextSummary = input.summary !== undefined ? input.summary : current.summary
  const nextBody = input.bodyMd ?? current.bodyMd

  let nextSlug = current.slug
  if (input.slug !== undefined && input.slug !== current.slug) {
    nextSlug = await resolveSlug(current.categoryId, nextTitle, input.slug)
  }

  const contentChanged =
    nextTitle !== current.title ||
    nextSummary !== current.summary ||
    nextBody !== current.bodyMd

  return db.transaction(async (tx) => {
    if (contentChanged) {
      await tx.insert(postRevisions).values({
        postId: current.id,
        title: current.title,
        summary: current.summary,
        bodyMd: current.bodyMd,
        authorId: actorUserId(input.actor),
        source: input.actor.kind === 'token' ? 'agent' : 'human',
      })
    }

    const row = (
      await tx
        .update(posts)
        .set({
          title: nextTitle,
          summary: nextSummary,
          bodyMd: nextBody,
          slug: nextSlug,
          featured: input.featured ?? current.featured,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, current.id))
        .returning()
    )[0]
    if (!row) throw new DomainError('not_found', '文章不存在', { id: current.id })

    if (input.tags !== undefined) {
      await applyTags(tx, current.id, input.tags)
    }

    return toPost(row)
  })
}

export async function publishPost(input: { actor: Actor; id: string }): Promise<Post> {
  if (!actorCanPublish(input.actor)) {
    throw new DomainError('forbidden', '这个 Token 没有发布权限')
  }
  const current = await getPostById(input.id)
  if (!current) throw new DomainError('not_found', '文章不存在', { id: input.id })
  assertCanModify(input.actor, current)

  const row = (
    await db
      .update(posts)
      .set({
        status: 'published',
        publishedAt: current.publishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, current.id))
      .returning()
  )[0]
  if (!row) throw new DomainError('not_found', '文章不存在', { id: input.id })
  return toPost(row)
}

export async function unpublishPost(input: { actor: Actor; id: string }): Promise<Post> {
  if (!actorCanPublish(input.actor)) {
    throw new DomainError('forbidden', '这个 Token 没有发布权限')
  }
  const current = await getPostById(input.id)
  if (!current) throw new DomainError('not_found', '文章不存在', { id: input.id })
  assertCanModify(input.actor, current)

  const row = (
    await db
      .update(posts)
      .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(posts.id, current.id))
      .returning()
  )[0]
  if (!row) throw new DomainError('not_found', '文章不存在', { id: input.id })
  return toPost(row)
}

export async function archivePost(input: { actor: Actor; id: string }): Promise<Post> {
  const current = await getPostById(input.id)
  if (!current) throw new DomainError('not_found', '文章不存在', { id: input.id })
  assertCanModify(input.actor, current)

  const row = (
    await db
      .update(posts)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(posts.id, current.id))
      .returning()
  )[0]
  if (!row) throw new DomainError('not_found', '文章不存在', { id: input.id })
  return toPost(row)
}

export async function getPostById(id: string): Promise<Post | null> {
  // id 不是 UUID 时直接当作"不存在"——否则数据库会抛原始错误。
  if (!isUuid(id)) return null
  const row = (
    await db
      .select({ post: posts, authorName: users.name })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, id))
  )[0]
  return row ? { ...toPost(row.post), authorName: row.authorName } : null
}

export async function getPostBySlug(categoryPath: string, slug: string): Promise<Post | null> {
  const row = (
    await db
      .select({ post: posts })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(and(eq(categories.path, categoryPath), eq(posts.slug, slug)))
  )[0]
  return row ? toPost(row.post) : null
}

export async function listPosts(query: {
  actor: Actor
  categoryId?: string
  categoryPathPrefix?: string
  tag?: string
  status?: PostStatus
  authorId?: string
  featured?: boolean
  limit?: number
  offset?: number
}): Promise<{ items: PostListItem[]; total: number }> {
  const conditions: SQL[] = []
  const status = query.status ?? 'published'
  conditions.push(eq(posts.status, status))

  if (query.categoryId !== undefined) {
    conditions.push(eq(posts.categoryId, query.categoryId))
  }
  if (query.categoryPathPrefix !== undefined) {
    const prefix = query.categoryPathPrefix
    conditions.push(
      sql`(${categories.path} = ${prefix} or ${categories.path} like ${`${prefix}/%`})`,
    )
  }
  if (query.authorId !== undefined) {
    conditions.push(eq(posts.authorId, query.authorId))
  }
  if (query.featured !== undefined) {
    conditions.push(eq(posts.featured, query.featured))
  }
  if (query.tag !== undefined) {
    const tagged = db
      .select({ postId: postTags.postId })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(tags.slug, query.tag))
    conditions.push(inArray(posts.id, tagged))
  }

  // 非 published 的内容只有本人和 admin 能看见——与后台的可见范围一致。
  if (status !== 'published' && query.actor.role !== 'admin') {
    conditions.push(
      or(eq(posts.authorId, actorUserId(query.actor)), eq(posts.status, 'published'))!,
    )
  }

  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(where)

  const rows = await db
    .select({ post: posts, categoryPath: categories.path })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(where)
    .orderBy(desc(posts.publishedAt), desc(posts.updatedAt))
    .limit(query.limit ?? 20)
    .offset(query.offset ?? 0)

  const items: PostListItem[] = rows.map((row) => ({
    id: row.post.id,
    slug: row.post.slug,
    title: row.post.title,
    summary: row.post.summary,
    status: row.post.status,
    authorId: row.post.authorId,
    categoryId: row.post.categoryId,
    categoryPath: row.categoryPath,
    tags: [],
    publishedAt: row.post.publishedAt,
    updatedAt: row.post.updatedAt,
  }))

  return { items: await attachTags(items), total: totalRow?.total ?? 0 }
}

export async function searchPosts(query: {
  actor: Actor
  q: string
  limit?: number
}): Promise<PostListItem[]> {
  const term = query.q.trim()
  if (!term) return []

  const pattern = `%${term}%`
  const rows = await db
    .select({ post: posts, categoryPath: categories.path })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(
      and(
        eq(posts.status, 'published'),
        or(
          ilike(posts.title, pattern),
          ilike(posts.summary, pattern),
          ilike(posts.bodyMd, pattern),
        ),
      ),
    )
    .orderBy(
      sql`greatest(similarity(${posts.title}, ${term}), similarity(coalesce(${posts.summary}, ''), ${term})) desc`,
      desc(posts.publishedAt),
    )
    .limit(query.limit ?? 20)

  const items: PostListItem[] = rows.map((row) => ({
    id: row.post.id,
    slug: row.post.slug,
    title: row.post.title,
    summary: row.post.summary,
    status: row.post.status,
    authorId: row.post.authorId,
    categoryId: row.post.categoryId,
    categoryPath: row.categoryPath,
    tags: [],
    publishedAt: row.post.publishedAt,
    updatedAt: row.post.updatedAt,
  }))

  return attachTags(items)
}
