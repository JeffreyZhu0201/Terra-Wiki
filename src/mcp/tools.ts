import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { recordAudit } from '@/server/audit'
import { DomainError } from '@/server/errors'
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  moveCategory,
  renameCategory,
  type CategoryNode,
} from '@/server/services/categories'
import { deleteMedia, listMedia, uploadMedia } from '@/server/services/media'
import {
  actorUserId,
  archivePost,
  assertCanModify,
  createPost,
  getPostById,
  getPostBySlug,
  listPostTags,
  listPosts,
  publishPost,
  searchPosts,
  unpublishPost,
  updatePost,
} from '@/server/services/posts'
import { listRevisions, restoreRevision } from '@/server/services/revisions'
import { createTag, listTags, mergeTags, renameTag } from '@/server/services/tags'
import type { McpContext } from './context'

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** 工具的通用返回：JSON 文本。Agent 读 JSON 比读散文稳。 */
function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string, details?: Record<string, unknown>): ToolResult {
  const text = details ? `${message}\n${JSON.stringify(details)}` : message
  return { isError: true, content: [{ type: 'text', text }] }
}

/** 叶子分类——文章只能放在叶子分类下。 */
async function listLeafCategories(): Promise<{ id: string; path: string; name: string }[]> {
  const tree = await listCategoryTree()
  const leaves: { id: string; path: string; name: string }[] = []
  const walk = (nodes: CategoryNode[]): void => {
    for (const node of nodes) {
      if (node.children.length === 0) {
        leaves.push({ id: node.id, path: node.path, name: node.name })
      } else {
        walk(node.children)
      }
    }
  }
  walk(tree)
  return leaves
}

/**
 * 把业务错误翻译成工具错误。
 * 分类不存在时顺带列出可用分类——Agent 拿到这个就能自己改对。
 */
async function toToolError(error: unknown): Promise<ToolResult> {
  if (!(error instanceof DomainError)) {
    // 不把原始异常（含 SQL 片段）透给 Agent。
    console.error('[mcp] 工具执行失败', error)
    return fail('服务器内部错误，详情见服务端日志')
  }

  const details: Record<string, unknown> = { ...(error.details ?? {}) }
  if (error.code === 'not_found' && details.categoryId !== undefined) {
    details.availableCategories = await listLeafCategories()
  }
  return fail(error.message, Object.keys(details).length > 0 ? details : undefined)
}

/** 包一层，把 handler 抛出的 DomainError 变成 isError 结果。 */
async function run(handler: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await handler())
  } catch (error) {
    return toToolError(error)
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

/**
 * 注册全部 MCP 工具。
 *
 * 工具集 = 后台能力全集，减去平台管理（成员 / Token / 站点设置 / 审计查询）——
 * Agent 给自己签发 Token 属于权限提升。
 * 状态变更只有 publish_post / unpublish_post / archive_post 三个入口，
 * create_post / update_post 不接受 status 字段。
 */
export function registerTools(server: McpServer, ctx: McpContext): void {
  const actor = ctx.actor

  // ---------- 读 ----------

  server.registerTool(
    'list_categories',
    {
      description: '列出全部分类树，含每个分类的文章数。',
      inputSchema: z.object({}),
    },
    async () =>
      run(async () => {
        const tree = await listCategoryTree()
        const flatten = (nodes: CategoryNode[]): unknown[] =>
          nodes.map((node) => ({
            id: node.id,
            path: node.path,
            name: node.name,
            slug: node.slug,
            postCount: node.postCount,
            children: flatten(node.children),
          }))
        return flatten(tree)
      }),
  )

  server.registerTool(
    'list_tags',
    {
      description: '列出全部标签及其文章数。',
      inputSchema: z.object({}),
    },
    async () => run(async () => listTags()),
  )

  server.registerTool(
    'list_posts',
    {
      description:
        '列出文章。默认只返回已发布文章；status 可选 draft / published / archived。' +
        '草稿只对作者本人与管理员可见。',
      inputSchema: z.object({
        category: z.string().optional().describe('分类路径前缀，如 guide/rust'),
        tag: z.string().optional().describe('标签 slug'),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        authorId: z.string().optional().describe('按作者 id 过滤'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ category, tag, status, authorId, limit }) =>
      run(async () => {
        const { items, total } = await listPosts({
          actor,
          ...(category ? { categoryPathPrefix: category } : {}),
          ...(tag ? { tag } : {}),
          ...(status ? { status } : {}),
          ...(authorId ? { authorId } : {}),
          ...(limit ? { limit } : {}),
        })
        return {
          total,
          items: items.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            summary: item.summary,
            status: item.status,
            categoryPath: item.categoryPath,
            authorId: item.authorId,
            tags: item.tags,
            publishedAt: iso(item.publishedAt),
            updatedAt: iso(item.updatedAt),
          })),
        }
      }),
  )

  server.registerTool(
    'get_post',
    {
      description: '按 postId 取文章，或按 category 路径 + slug 取。他人的草稿不可见。',
      inputSchema: z.object({
        postId: z.string().optional(),
        category: z.string().optional().describe('分类路径，如 guide/rust'),
        slug: z.string().optional(),
      }),
    },
    async ({ postId, category, slug }) =>
      run(async () => {
        if (!postId && !(category && slug)) {
          throw new DomainError('invalid', '需要 postId，或者 category + slug')
        }

        const post = postId
          ? await getPostById(postId)
          : await getPostBySlug(category ?? '', slug ?? '')

        if (!post) throw new DomainError('not_found', '文章不存在', { postId, category, slug })

        // 草稿只有本人和 admin 看得见——和后台列表一个口径。
        if (post.status !== 'published') {
          const isOwner = post.authorId === actorUserId(actor)
          if (!isOwner && actor.role !== 'admin') {
            throw new DomainError('not_found', '文章不存在', { postId: post.id })
          }
        }

        const tags = await listPostTags(post.id)
        return {
          id: post.id,
          slug: post.slug,
          title: post.title,
          summary: post.summary,
          bodyMd: post.bodyMd,
          status: post.status,
          authorId: post.authorId,
          tags,
          publishedAt: iso(post.publishedAt),
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        }
      }),
  )

  server.registerTool(
    'search_posts',
    {
      description: '全文搜索文章，只返回已发布内容。',
      inputSchema: z.object({
        q: z.string().describe('搜索词'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ q, limit }) =>
      run(async () => {
        const items = await searchPosts({ actor, q, ...(limit ? { limit } : {}) })
        return items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          categoryPath: item.categoryPath,
          tags: item.tags,
        }))
      }),
  )

  server.registerTool(
    'list_media',
    {
      description: '列出媒体库里的图片。',
      inputSchema: z.object({}),
    },
    async () => run(async () => listMedia()),
  )

  server.registerTool(
    'list_revisions',
    {
      description: '列出某篇文章的历史版本（最新在前）。',
      inputSchema: z.object({ postId: z.string() }),
    },
    async ({ postId }) =>
      run(async () => {
        const revisions = await listRevisions(postId)
        return revisions.map((revision) => ({
          id: revision.id,
          title: revision.title,
          summary: revision.summary,
          source: revision.source,
          authorId: revision.authorId,
          wordCount: revision.bodyMd.length,
          createdAt: revision.createdAt.toISOString(),
        }))
      }),
  )

  // ---------- 写 ----------

  server.registerTool(
    'create_post',
    {
      description:
        '创建一篇草稿。必须指定已存在的叶子分类；新标签会自动创建。' +
        '不接受 status——发布要用 publish_post。',
      inputSchema: z.strictObject({
        categoryId: z.string().describe('叶子分类 id'),
        title: z.string(),
        bodyMd: z.string(),
        summary: z.string().optional(),
        slug: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    async ({ categoryId, title, bodyMd, summary, slug, tags }) =>
      run(async () => {
        const post = await createPost({
          actor,
          categoryId,
          title,
          bodyMd,
          ...(summary !== undefined ? { summary } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(tags !== undefined ? { tags } : {}),
        })
        await recordAudit({
          actor,
          action: 'post.create',
          target: { type: 'post', id: post.id },
        })
        return { id: post.id, slug: post.slug, status: post.status, title: post.title }
      }),
  )

  server.registerTool(
    'update_post',
    {
      description:
        '更新文章内容。tags 是最终集合；addTags / removeTags 做增删。' +
        '不接受 status——状态变更走 publish_post / unpublish_post / archive_post。',
      inputSchema: z.strictObject({
        postId: z.string(),
        title: z.string().optional(),
        summary: z.string().nullable().optional(),
        bodyMd: z.string().optional(),
        slug: z.string().optional(),
        tags: z.array(z.string()).optional().describe('最终标签集合'),
        addTags: z.array(z.string()).optional(),
        removeTags: z.array(z.string()).optional(),
      }),
    },
    async ({ postId, title, summary, bodyMd, slug, tags, addTags, removeTags }) =>
      run(async () => {
        const current = await getPostById(postId)
        if (!current) throw new DomainError('not_found', '文章不存在', { postId })
        assertCanModify(actor, current)

        let nextTags: string[] | undefined
        if (tags !== undefined || addTags !== undefined || removeTags !== undefined) {
          const existing = await listPostTags(current.id)
          const names = existing.map((tag) => tag.name)
          if (tags !== undefined) {
            nextTags = tags
          } else {
            const set = new Set(names)
            for (const name of addTags ?? []) set.add(name)
            for (const name of removeTags ?? []) set.delete(name)
            nextTags = [...set]
          }
        }

        const post = await updatePost({
          actor,
          id: postId,
          ...(title !== undefined ? { title } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(bodyMd !== undefined ? { bodyMd } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(nextTags !== undefined ? { tags: nextTags } : {}),
        })
        await recordAudit({
          actor,
          action: 'post.update',
          target: { type: 'post', id: post.id },
        })
        return {
          id: post.id,
          slug: post.slug,
          status: post.status,
          title: post.title,
          updatedAt: post.updatedAt.toISOString(),
        }
      }),
  )

  server.registerTool(
    'publish_post',
    {
      description: '发布文章。Token 需要 can_publish 权限。',
      inputSchema: z.object({ postId: z.string() }),
    },
    async ({ postId }) =>
      run(async () => {
        const post = await publishPost({ actor, id: postId })
        await recordAudit({
          actor,
          action: 'post.publish',
          target: { type: 'post', id: postId },
        })
        return { id: post.id, status: post.status, publishedAt: iso(post.publishedAt) }
      }),
  )

  server.registerTool(
    'unpublish_post',
    {
      description: '撤回文章，回到草稿。Token 需要 can_publish 权限。',
      inputSchema: z.object({ postId: z.string() }),
    },
    async ({ postId }) =>
      run(async () => {
        const post = await unpublishPost({ actor, id: postId })
        await recordAudit({
          actor,
          action: 'post.unpublish',
          target: { type: 'post', id: postId },
        })
        return { id: post.id, status: post.status }
      }),
  )

  server.registerTool(
    'archive_post',
    {
      description: '归档文章（软删除）。',
      inputSchema: z.object({ postId: z.string() }),
    },
    async ({ postId }) =>
      run(async () => {
        const post = await archivePost({ actor, id: postId })
        await recordAudit({
          actor,
          action: 'post.archive',
          target: { type: 'post', id: postId },
        })
        return { id: post.id, status: post.status }
      }),
  )

  server.registerTool(
    'create_tag',
    {
      description: '创建标签。同名标签已存在时直接返回它。',
      inputSchema: z.object({ name: z.string() }),
    },
    async ({ name }) =>
      run(async () => {
        const tag = await createTag(name)
        await recordAudit({ actor, action: 'tag.create', target: { type: 'tag', id: tag.id } })
        return tag
      }),
  )

  server.registerTool(
    'rename_tag',
    {
      description: '重命名标签，slug 同步更新，旧标签页留 301。',
      inputSchema: z.object({ tagId: z.string(), name: z.string() }),
    },
    async ({ tagId, name }) =>
      run(async () => {
        const tag = await renameTag(tagId, name)
        await recordAudit({ actor, action: 'tag.rename', target: { type: 'tag', id: tagId } })
        return tag
      }),
  )

  server.registerTool(
    'merge_tags',
    {
      description: '把 source 标签合并进 target 标签，文章关联一起迁移。',
      inputSchema: z.object({ sourceId: z.string(), targetId: z.string() }),
    },
    async ({ sourceId, targetId }) =>
      run(async () => {
        await mergeTags(sourceId, targetId)
        await recordAudit({
          actor,
          action: 'tag.merge',
          target: { type: 'tag', id: targetId },
          meta: { sourceId },
        })
        return { ok: true }
      }),
  )

  server.registerTool(
    'delete_media',
    {
      description: '删除媒体文件与记录。',
      inputSchema: z.object({ mediaId: z.string() }),
    },
    async ({ mediaId }) =>
      run(async () => {
        await deleteMedia(actor, mediaId)
        await recordAudit({ actor, action: 'media.delete', target: { type: 'upload', id: mediaId } })
        return { ok: true }
      }),
  )

  server.registerTool(
    'restore_revision',
    {
      description: '回滚到指定历史版本。只恢复 title / summary / body_md，标签与状态不变。',
      inputSchema: z.object({ postId: z.string(), revisionId: z.string() }),
    },
    async ({ postId, revisionId }) =>
      run(async () => {
        const post = await restoreRevision({ actor, postId, revisionId })
        return { id: post.id, title: post.title, status: post.status }
      }),
  )

  server.registerTool(
    'upload_image',
    {
      description:
        '上传图片。data 是 base64 编码的原始字节，mimeType 可选（按文件头校验，实际类型以文件头为准）。' +
        '返回可直接插入 Markdown 的 URL。',
      inputSchema: z.object({
        data: z.string().describe('base64 编码的图片内容'),
        mimeType: z.string().optional(),
        filename: z.string().optional(),
      }),
    },
    async ({ data, mimeType, filename }) =>
      run(async () => {
        const bytes = Buffer.from(data, 'base64')
        const media = await uploadMedia({
          actor,
          bytes,
          filename: filename ?? 'upload.png',
          mime: mimeType ?? 'image/png',
        })
        await recordAudit({
          actor,
          action: 'media.upload',
          target: { type: 'upload', id: media.id },
          meta: { url: media.url },
        })
        return { id: media.id, url: media.url, markdown: media.markdown }
      }),
  )

  server.registerTool(
    'create_category',
    {
      description: '新建分类。slug 必须显式给出；parentId 省略就是顶级分类。',
      inputSchema: z.object({
        slug: z.string().describe('小写字母、数字和连字符'),
        name: z.string(),
        parentId: z.string().nullable().optional(),
        description: z.string().optional(),
      }),
    },
    async ({ slug, name, parentId, description }) =>
      run(async () => {
        const category = await createCategory({
          parentId: parentId ?? null,
          slug,
          name,
          ...(description !== undefined ? { description } : {}),
        })
        await recordAudit({
          actor,
          action: 'category.create',
          target: { type: 'category', id: category.id },
          meta: { path: category.path },
        })
        return { id: category.id, path: category.path, slug: category.slug, name: category.name }
      }),
  )

  server.registerTool(
    'rename_category',
    {
      description: '改分类的显示名或 slug。改 slug 会批量写 301。',
      inputSchema: z.object({
        categoryId: z.string(),
        name: z.string().optional(),
        slug: z.string().optional(),
      }),
    },
    async ({ categoryId, name, slug }) =>
      run(async () => {
        const category = await renameCategory({
          id: categoryId,
          ...(name !== undefined ? { name } : {}),
          ...(slug !== undefined ? { slug } : {}),
        })
        await recordAudit({
          actor,
          action: 'category.rename',
          target: { type: 'category', id: categoryId },
          meta: { path: category.path },
        })
        return { id: category.id, path: category.path, name: category.name, slug: category.slug }
      }),
  )

  server.registerTool(
    'move_category',
    {
      description: '把分类移到另一个父分类下（parentId 传 null 移到顶级）。会批量写 301。',
      inputSchema: z.object({
        categoryId: z.string(),
        parentId: z.string().nullable(),
      }),
    },
    async ({ categoryId, parentId }) =>
      run(async () => {
        const category = await moveCategory({ id: categoryId, newParentId: parentId })
        await recordAudit({
          actor,
          action: 'category.move',
          target: { type: 'category', id: categoryId },
          meta: { path: category.path },
        })
        return { id: category.id, path: category.path, parentId: category.parentId }
      }),
  )

  server.registerTool(
    'delete_category',
    {
      description: '删除空分类。有子分类或还有文章时会被拒绝。',
      inputSchema: z.object({ categoryId: z.string() }),
    },
    async ({ categoryId }) =>
      run(async () => {
        await deleteCategory(categoryId)
        await recordAudit({
          actor,
          action: 'category.delete',
          target: { type: 'category', id: categoryId },
        })
        return { ok: true }
      }),
  )
}

/** 组装一个带全部工具的 MCP 服务器。 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: 'terra-wiki', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  registerTools(server, ctx)
  return server
}
