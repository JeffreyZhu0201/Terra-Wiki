import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestUser, resetDb } from '../../tests/db'
import { db } from '../server/db/client'
import { auditLogs, mcpTokens } from '../server/db/schema'
import { createCategory } from '../server/services/categories'
import { createMcpToken, revokeMcpToken } from '../server/services/tokens'
import { createMcpServer } from './tools'
import type { McpContext } from './context'

type TokenActor = {
  kind: 'token'
  id: string
  authorId: string
  role: 'admin' | 'author'
  canPublish: boolean
}

async function connect(ctx: McpContext): Promise<Client> {
  const server = createMcpServer(ctx)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

async function tokenContext(input: {
  canPublish: boolean
  role?: 'admin' | 'author'
}): Promise<{ ctx: McpContext; token: string }> {
  const user = (await db.query.users.findFirst())!
  const actor: TokenActor = {
    kind: 'token',
    id: 'token-id',
    authorId: user.id,
    role: input.role ?? 'author',
    canPublish: input.canPublish,
  }
  const created = await createMcpToken({
    actor: { kind: 'user', id: user.id, role: user.role },
    name: 'test',
    canPublish: input.canPublish,
  })
  return {
    ctx: { actor, tokenId: created.id },
    token: created.token,
  }
}

describe('mcp tools', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('rejects a revoked token', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await createMcpToken({
      actor: { kind: 'user', id: user.id, role: user.role },
      name: 'x',
      canPublish: true,
    })
    const { verifyMcpToken } = await import('../server/services/tokens')
    expect(await verifyMcpToken(token)).not.toBeNull()

    await revokeMcpToken((await db.select().from(mcpTokens))[0]!.id)
    expect(await verifyMcpToken(token)).toBeNull()
  })

  it('rejects an unknown token', async () => {
    const { verifyMcpToken } = await import('../server/services/tokens')
    expect(await verifyMcpToken('not-a-real-token')).toBeNull()
  })

  it('refuses to overwrite a post that changed under the agent', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: 'T', bodyMd: 'v1' },
    })
    const payload = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ) as { id: string; updatedAt: string }

    // 别人在 Agent 读完之后改了文章
    const { updatePost } = await import('../server/services/posts')
    await updatePost({ actor: ctx.actor, id: payload.id, bodyMd: 'v2' })

    const result = await client.callTool({
      name: 'update_post',
      arguments: { postId: payload.id, bodyMd: 'v3', expectedUpdatedAt: payload.updatedAt },
    })
    expect(result.isError).toBe(true)
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('他人修改')

    // 用当前的时间戳就能正常写入
    const { getPostById } = await import('../server/services/posts')
    const current = await getPostById(payload.id)
    const ok = await client.callTool({
      name: 'update_post',
      arguments: {
        postId: payload.id,
        bodyMd: 'v4',
        expectedUpdatedAt: current!.updatedAt.toISOString(),
      },
    })
    expect(ok.isError).toBeFalsy()
  })

  it('rejects an invalid expectedUpdatedAt instead of skipping the check', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: 'T', bodyMd: 'v1' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    const result = await client.callTool({
      name: 'update_post',
      arguments: { postId, bodyMd: 'v2', expectedUpdatedAt: 'not-a-date' },
    })
    expect(result.isError).toBe(true)
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('不是合法的时间')
  })

  it('tells the agent the write contract in the server instructions', async () => {
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const instructions = client.getInstructions()
    expect(instructions).toBeTruthy()
    // 关键约定必须写在 instructions 里——Agent 不读文档。
    expect(instructions).toContain('叶子分类')
    expect(instructions).toContain('can_publish')
    expect(instructions).toContain('publish_post')
  })

  it('exposes the content tool set but no platform management tools', async () => {
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort()

    expect(names).toEqual([
      'archive_post',
      'create_category',
      'create_post',
      'create_tag',
      'delete_category',
      'delete_media',
      'get_post',
      'list_categories',
      'list_media',
      'list_posts',
      'list_revisions',
      'list_tags',
      'merge_tags',
      'move_category',
      'publish_post',
      'rename_category',
      'rename_tag',
      'restore_revision',
      'search_posts',
      'unpublish_post',
      'update_post',
      'upload_image',
    ])

    // 平台管理不对 Agent 开放——给自己签 Token 属于权限提升。
    expect(names).not.toContain('create_user')
    expect(names).not.toContain('create_token')
    expect(names).not.toContain('list_audit_logs')
    expect(names).not.toContain('update_settings')
    // 没有 delete_post，软删除走 archive_post。
    expect(names).not.toContain('delete_post')
  })

  it('lists available categories when create_post gets a bad category', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const result = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: 'no-such-category', title: 'T', bodyMd: 'B' },
    })

    expect(result.isError).toBe(true)
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('availableCategories')
    expect(text).toContain(category.id)
  })

  it('rejects a status argument on create_post', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const result = await client.callTool({
      name: 'create_post',
      arguments: {
        categoryId: category.id,
        title: 'T',
        bodyMd: 'B',
        status: 'published',
      },
    })

    expect(result.isError).toBe(true)
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('status')
  })

  it('creates a draft and records the token as the audit actor', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const result = await client.callTool({
      name: 'create_post',
      arguments: {
        categoryId: category.id,
        title: 'Agent 写的草稿',
        bodyMd: '# hi',
        tags: ['mcp'],
      },
    })

    expect(result.isError).toBeFalsy()
    const payload = JSON.parse(
      (result.content as { type: 'text'; text: string }[])[0]!.text,
    ) as { id: string; status: string }
    expect(payload.status).toBe('draft')

    const logs = await db.select().from(auditLogs)
    const entry = logs.find((log) => log.action === 'post.create')
    expect(entry?.actorType).toBe('token')
  })

  it('refuses to publish when the token has no publish permission', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: 'T', bodyMd: 'B' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    const result = await client.callTool({ name: 'publish_post', arguments: { postId } })
    expect(result.isError).toBe(true)
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('发布权限')
  })

  it('publishes when the token has publish permission', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: true })
    const client = await connect(ctx)

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: 'T', bodyMd: 'B' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    const result = await client.callTool({ name: 'publish_post', arguments: { postId } })
    expect(result.isError).toBeFalsy()
  })

  it('does not show another author draft to an author token', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const otherId = await createTestUser({ email: 'other@example.com' })

    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    // 用另一个作者的身份建一篇草稿
    const other = await createMcpServer({
      actor: { kind: 'user', id: otherId, role: 'author' },
      tokenId: 'other',
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const otherClient = new Client({ name: 'other', version: '0.0.0' })
    await Promise.all([other.connect(serverTransport), otherClient.connect(clientTransport)])
    const created = await otherClient.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: '别人的草稿', bodyMd: 'x' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    const listed = await client.callTool({
      name: 'list_posts',
      arguments: { status: 'draft' },
    })
    const payload = JSON.parse(
      (listed.content as { type: 'text'; text: string }[])[0]!.text,
    ) as { items: { id: string }[] }
    expect(payload.items.map((item) => item.id)).not.toContain(postId)

    const fetched = await client.callTool({ name: 'get_post', arguments: { postId } })
    expect(fetched.isError).toBe(true)
  })

  it('does not show another author the revisions of their post', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const otherId = await createTestUser({ email: 'other@example.com' })

    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    // 用另一个作者的身份建一篇草稿，再改一次产生一个版本
    const other = await createMcpServer({
      actor: { kind: 'user', id: otherId, role: 'author' },
      tokenId: 'other',
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const otherClient = new Client({ name: 'other', version: '0.0.0' })
    await Promise.all([other.connect(serverTransport), otherClient.connect(clientTransport)])
    const created = await otherClient.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: '别人的文章', bodyMd: 'x' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string
    await otherClient.callTool({
      name: 'update_post',
      arguments: { postId, bodyMd: 'y' },
    })

    const listed = await client.callTool({
      name: 'list_revisions',
      arguments: { postId },
    })
    expect(listed.isError).toBe(true)
    const text = (listed.content as { type: 'text'; text: string }[])[0]!.text
    // 报「不存在」而不是「没权限」——不该让人知道这篇草稿存在。
    expect(text).toContain('文章不存在')
    expect(text).not.toContain('别人的文章')
  })

  it('creates a new tag on the fly', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    await client.callTool({
      name: 'create_post',
      arguments: {
        categoryId: category.id,
        title: 'T',
        bodyMd: 'B',
        tags: ['全新标签'],
      },
    })

    const { listTags } = await import('../server/services/tags')
    const tags = await listTags()
    expect(tags.map((tag) => tag.name)).toContain('全新标签')
  })

  it('sees a title changed in the admin right away', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: '旧标题', bodyMd: 'B' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    // 后台改标题（走 service 层）
    const { updatePost } = await import('../server/services/posts')
    await updatePost({ actor: ctx.actor, id: postId, title: '新标题' })

    const fetched = await client.callTool({ name: 'get_post', arguments: { postId } })
    const payload = JSON.parse(
      (fetched.content as { type: 'text'; text: string }[])[0]!.text,
    ) as { title: string }
    expect(payload.title).toBe('新标题')
  })

  it('merges tags, restores a revision and deletes media', async () => {
    const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const { ctx } = await tokenContext({ canPublish: false })
    const client = await connect(ctx)

    const { createTag } = await import('../server/services/tags')
    const source = await createTag('源标签')
    const target = await createTag('目标标签')

    const merged = await client.callTool({
      name: 'merge_tags',
      arguments: { sourceId: source.id, targetId: target.id },
    })
    expect(merged.isError).toBeFalsy()

    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title: 'T', bodyMd: 'v1' },
    })
    const postId = JSON.parse(
      (created.content as { type: 'text'; text: string }[])[0]!.text,
    ).id as string

    const { updatePost } = await import('../server/services/posts')
    await updatePost({ actor: ctx.actor, id: postId, bodyMd: 'v2' })

    const { listRevisions } = await import('../server/services/revisions')
    const revisions = await listRevisions({ postId, actor: ctx.actor })
    const restored = await client.callTool({
      name: 'restore_revision',
      arguments: { postId, revisionId: revisions[0]!.id },
    })
    expect(restored.isError).toBeFalsy()

    const { getPostById } = await import('../server/services/posts')
    expect((await getPostById(postId))?.bodyMd).toBe('v1')

    // 上传一张图再删掉
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const { uploadMedia } = await import('../server/services/media')
    const media = await uploadMedia({
      actor: ctx.actor,
      bytes: png,
      filename: 'a.png',
      mime: 'image/png',
    })

    const deleted = await client.callTool({
      name: 'delete_media',
      arguments: { mediaId: media.id },
    })
    expect(deleted.isError).toBeFalsy()
    const { listMedia } = await import('../server/services/media')
    expect((await listMedia()).map((item) => item.id)).not.toContain(media.id)
  })

  it('rejects an invalid or reserved category slug', async () => {
    const { ctx } = await tokenContext({ canPublish: false, role: 'admin' })
    const client = await connect(ctx)

    const reserved = await client.callTool({
      name: 'create_category',
      arguments: { slug: 'admin', name: '撞保留字' },
    })
    expect(reserved.isError).toBe(true)

    const invalid = await client.callTool({
      name: 'create_category',
      arguments: { slug: 'Not A Slug', name: '非法 slug' },
    })
    expect(invalid.isError).toBe(true)
  })
  it('lets only an admin token manage categories', async () => {
    const author = await tokenContext({ canPublish: false, role: 'author' })
    const authorClient = await connect(author.ctx)

    const created = await authorClient.callTool({
      name: 'create_category',
      arguments: { slug: 'by-author', name: '作者建的' },
    })
    expect(created.isError).toBe(true)
    const text = (created.content as { type: 'text'; text: string }[])[0]!.text
    expect(text).toContain('管理员')

    const admin = await tokenContext({ canPublish: false, role: 'admin' })
    const adminClient = await connect(admin.ctx)
    const ok = await adminClient.callTool({
      name: 'create_category',
      arguments: { slug: 'by-admin', name: '管理员建的' },
    })
    expect(ok.isError).toBeFalsy()
  })
})
