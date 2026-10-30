import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from './db'
import { db } from '../src/server/db/client'
import { auditLogs, posts } from '../src/server/db/schema'
import { recordAudit } from '../src/server/audit'
import { createCategory } from '../src/server/services/categories'
import { createPost, publishPost } from '../src/server/services/posts'
import { createTag } from '../src/server/services/tags'

describe('end to end over services', () => {
  beforeEach(async () => { await resetDb() })

  it('publishes a post and records the audit trail', async () => {
    const actor = { kind: 'user', id: (await db.query.users.findFirst())!.id, role: 'admin' } as const
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const tag = await createTag('MCP')
    const post = await createPost({ actor, categoryId: cat.id, title: '标题', bodyMd: '正文', tags: ['mcp'] })
    await recordAudit({ actor, action: 'post.create', target: { type: 'post', id: post.id } })
    await publishPost({ actor, id: post.id })

    expect((await db.select().from(auditLogs)).length).toBeGreaterThan(0)
    expect(tag.slug).toBe('mcp')

    const rows = await db.select().from(posts)
    expect(rows[0]?.status).toBe('published')
  })

  it('keeps a published post inside its own category tree', async () => {
    const actor = { kind: 'user', id: (await db.query.users.findFirst())!.id, role: 'admin' } as const
    const guide = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const rust = await createCategory({ parentId: guide.id, slug: 'rust', name: 'Rust' })
    const notes = await createCategory({ parentId: null, slug: 'notes', name: '随笔' })
    const inTree = await createPost({
      actor,
      categoryId: rust.id,
      title: '在 Rust 子树里',
      bodyMd: 'x',
    })
    await createPost({ actor, categoryId: notes.id, title: '在另一棵树里', bodyMd: 'y' })
    await publishPost({ actor, id: inTree.id })

    const { listPosts } = await import('../src/server/services/posts')
    const listed = await listPosts({ actor, categoryPathPrefix: 'guide' })
    expect(listed.items.map((item) => item.title)).toEqual(['在 Rust 子树里'])
  })
})
