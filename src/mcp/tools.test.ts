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
})
