import { and, asc, count, eq, inArray, isNull, like, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { categories, posts, redirects } from '../db/schema'
import { DomainError } from '../errors'

/** 不能作为顶级分类的 slug——这些路径被系统路由占用。 */
const RESERVED_SLUGS = new Set([
  'all',
  'tags',
  'search',
  'sitemap',
  'login',
  'admin',
  'api',
  '_next',
  'uploads',
  'rss.xml',
  'sitemap.xml',
  'favicon.ico',
])

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type Category = {
  id: string
  parentId: string | null
  slug: string
  name: string
  description: string | null
  path: string
  depth: number
  position: number
}

export type CategoryNode = Category & {
  children: CategoryNode[]
  postCount: number
}

type CategoryRow = typeof categories.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    path: row.path,
    depth: row.depth,
    position: row.position,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  )
}

function assertValidSlug(slug: string, isTopLevel: boolean): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new DomainError('invalid', 'slug 只能是小写字母、数字和连字符，且不能以连字符开头或结尾', {
      slug,
    })
  }
  if (isTopLevel && RESERVED_SLUGS.has(slug)) {
    throw new DomainError('invalid', '这个 slug 是系统保留字，不能用作顶级分类', { slug })
  }
}

/** 同一层级下 slug 不能重复。 */
async function assertSlugAvailable(
  parentId: string | null,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.slug, slug),
        parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
      ),
    )
  const clash = rows.find((row) => row.id !== excludeId)
  if (clash) {
    throw new DomainError('conflict', '同一层级下已存在相同的 slug', { slug })
  }
}

export async function listCategoryTree(): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name))

  const postCounts = await db
    .select({ categoryId: posts.categoryId, total: count() })
    .from(posts)
    .groupBy(posts.categoryId)
  const ownCounts = new Map(postCounts.map((row) => [row.categoryId, row.total]))

  const nodes = new Map<string, CategoryNode>()
  for (const row of rows) {
    const category = toCategory(row)
    nodes.set(category.id, { ...category, children: [], postCount: ownCounts.get(category.id) ?? 0 })
  }

  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }
    const parent = nodes.get(node.parentId)
    if (parent) parent.children.push(node)
  }

  // 父节点的计数含子树，方便侧栏显示"这一支有多少篇"。
  const rollup = (node: CategoryNode): number => {
    let total = node.postCount
    for (const child of node.children) total += rollup(child)
    node.postCount = total
    return total
  }
  for (const root of roots) rollup(root)

  return roots
}

export async function getCategoryByPath(path: string): Promise<Category | null> {
  const row = (await db.select().from(categories).where(eq(categories.path, path)))[0]
  return row ? toCategory(row) : null
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const row = (await db.select().from(categories).where(eq(categories.id, id)))[0]
  return row ? toCategory(row) : null
}

/** 自身 + 所有后代的物化路径。 */
export async function listDescendantPaths(id: string): Promise<string[]> {
  const self = await getCategoryById(id)
  if (!self) return []
  const rows = await db
    .select({ path: categories.path })
    .from(categories)
    .where(like(categories.path, `${self.path}/%`))
  return [self.path, ...rows.map((row) => row.path)]
}

/**
 * 同一个分类下，子分类 slug 和文章 slug 占用同一段 URL 空间
 * （/分类/xxx），两者必须互斥，否则路由消歧会出错。
 */
async function assertSlugNotTakenBySiblingPost(parentId: string | null, slug: string): Promise<void> {
  if (parentId === null) return
  const row = (
    await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.categoryId, parentId), eq(posts.slug, slug)))
  )[0]
  if (row) {
    throw new DomainError('conflict', '这个 slug 已经被同级的文章占用', { slug })
  }
}

export async function createCategory(input: {
  parentId: string | null
  slug: string
  name: string
  description?: string
}): Promise<Category> {
  const isTopLevel = input.parentId === null
  assertValidSlug(input.slug, isTopLevel)
  await assertSlugAvailable(input.parentId, input.slug)
  await assertSlugNotTakenBySiblingPost(input.parentId, input.slug)

  let parent: Category | null = null
  if (input.parentId !== null) {
    parent = await getCategoryById(input.parentId)
    if (!parent) throw new DomainError('not_found', '父分类不存在', { parentId: input.parentId })
  }

  const path = parent ? `${parent.path}/${input.slug}` : input.slug
  const depth = parent ? parent.depth + 1 : 0

  try {
    const row = (
      await db
        .insert(categories)
        .values({
          parentId: input.parentId,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          path,
          depth,
        })
        .returning()
    )[0]
    if (!row) throw new DomainError('conflict', '分类创建失败')
    return toCategory(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('conflict', '同一层级下已存在相同的 slug', { slug: input.slug })
    }
    throw error
  }
}

/**
 * 重写一棵子树的新路径，并为所有旧路径写 301。
 * 分类页和它下面所有文章的 URL 都会变，两种都要留跳转。
 */
async function rewriteSubtree(tx: Tx, current: Category, newPath: string, newDepth: number): Promise<void> {
  const oldPrefix = current.path

  const descendants = await tx
    .select({ id: categories.id, path: categories.path, depth: categories.depth })
    .from(categories)
    .where(like(categories.path, `${oldPrefix}/%`))

  const affected = [{ id: current.id, path: oldPrefix, depth: current.depth }, ...descendants]

  // 文章的旧 URL 必须在改路径之前取，否则 join 到的是新路径。
  const articleRows = await tx
    .select({ slug: posts.slug, categoryPath: categories.path })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(inArray(posts.categoryId, affected.map((item) => item.id)))

  for (const item of affected) {
    const nextPath = newPath + item.path.slice(oldPrefix.length)
    const nextDepth = newDepth + (item.depth - current.depth)
    await tx
      .update(categories)
      .set({ path: nextPath, depth: nextDepth, updatedAt: new Date() })
      .where(eq(categories.id, item.id))
    await tx
      .insert(redirects)
      .values({ fromPath: `/${item.path}`, toPath: `/${nextPath}` })
      .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: `/${nextPath}` } })
  }

  for (const article of articleRows) {
    const nextCategoryPath = newPath + article.categoryPath.slice(oldPrefix.length)
    await tx
      .insert(redirects)
      .values({
        fromPath: `/${article.categoryPath}/${article.slug}`,
        toPath: `/${nextCategoryPath}/${article.slug}`,
      })
      .onConflictDoUpdate({
        target: redirects.fromPath,
        set: { toPath: `/${nextCategoryPath}/${article.slug}` },
      })
  }
}

export async function renameCategory(input: {
  id: string
  name?: string
  slug?: string
}): Promise<Category> {
  const current = await getCategoryById(input.id)
  if (!current) throw new DomainError('not_found', '分类不存在', { id: input.id })
  if (input.name === undefined && input.slug === undefined) return current

  const isTopLevel = current.parentId === null
  const newSlug = input.slug ?? current.slug
  const newName = input.name ?? current.name
  assertValidSlug(newSlug, isTopLevel)

  let parent: Category | null = null
  if (current.parentId !== null) {
    parent = await getCategoryById(current.parentId)
    if (!parent) throw new DomainError('not_found', '父分类不存在')
  }
  await assertSlugAvailable(current.parentId, newSlug, current.id)

  const newPath = parent ? `${parent.path}/${newSlug}` : newSlug

  return db.transaction(async (tx) => {
    await rewriteSubtree(tx, current, newPath, parent ? parent.depth + 1 : 0)
    const row = (
      await tx
        .update(categories)
        .set({ slug: newSlug, name: newName, updatedAt: new Date() })
        .where(eq(categories.id, current.id))
        .returning()
    )[0]
    if (!row) throw new DomainError('not_found', '分类不存在')
    return toCategory(row)
  })
}

export async function moveCategory(input: {
  id: string
  newParentId: string | null
}): Promise<Category> {
  const current = await getCategoryById(input.id)
  if (!current) throw new DomainError('not_found', '分类不存在', { id: input.id })

  if (input.newParentId === current.id) {
    throw new DomainError('invalid', '不能把分类移到它自己下面')
  }

  let parent: Category | null = null
  if (input.newParentId !== null) {
    parent = await getCategoryById(input.newParentId)
    if (!parent) throw new DomainError('not_found', '目标父分类不存在')
    // 移进自己的后代会成环。
    if (parent.path === current.path || parent.path.startsWith(`${current.path}/`)) {
      throw new DomainError('invalid', '不能把分类移到它自己的后代下面')
    }
  }

  await assertSlugAvailable(input.newParentId, current.slug, current.id)

  const newPath = parent ? `${parent.path}/${current.slug}` : current.slug
  const newDepth = parent ? parent.depth + 1 : 0

  return db.transaction(async (tx) => {
    await rewriteSubtree(tx, current, newPath, newDepth)
    const row = (
      await tx
        .update(categories)
        .set({ parentId: input.newParentId, updatedAt: new Date() })
        .where(eq(categories.id, current.id))
        .returning()
    )[0]
    if (!row) throw new DomainError('not_found', '分类不存在')
    return toCategory(row)
  })
}

export async function deleteCategory(id: string): Promise<void> {
  const current = await getCategoryById(id)
  if (!current) throw new DomainError('not_found', '分类不存在', { id })

  const [childCountRow] = await db
    .select({ total: count() })
    .from(categories)
    .where(eq(categories.parentId, id))
  const [postCountRow] = await db
    .select({ total: count() })
    .from(posts)
    .where(eq(posts.categoryId, id))

  const childCount = childCountRow?.total ?? 0
  const postCount = postCountRow?.total ?? 0
  if (childCount > 0 || postCount > 0) {
    throw new DomainError('conflict', '分类非空，先把内容迁走再删除', { childCount, postCount })
  }

  await db.delete(categories).where(eq(categories.id, id))
}
