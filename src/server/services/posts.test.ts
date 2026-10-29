import { describe, expect, it, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { resetDb, createTestUser } from '../../../tests/db'
import { db } from '../db/client'
import { postRevisions } from '../db/schema'
import { createCategory } from './categories'
import { createPost, listPosts, publishPost, updatePost } from './posts'

let author: { kind: 'user'; id: string; role: 'author' } = { kind: 'user', id: '', role: 'author' }

describe('posts', () => {
  beforeEach(async () => {
    await resetDb()
    const user = await db.query.users.findFirst()
    author = { kind: 'user', id: user!.id, role: 'author' }
  })

  it('creates a draft and returns the generated slug', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({
      actor: author,
      categoryId: cat.id,
      title: '用 MCP 发布博客',
      bodyMd: '# hi',
    })
    expect(post.status).toBe('draft')
    expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('rejects a slug that already exists in the same category', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor: author, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    await expect(
      createPost({ actor: author, categoryId: cat.id, slug: 'hello', title: 'B', bodyMd: 'y' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('refuses a post in a category that already has child categories', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createCategory({ parentId: cat.id, slug: 'rust', name: 'Rust' })
    await expect(
      createPost({ actor: author, categoryId: cat.id, slug: 'anything', title: 'A', bodyMd: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('refuses a category slug that a sibling post already uses', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor: author, categoryId: cat.id, slug: 'rust', title: 'A', bodyMd: 'x' })
    await expect(createCategory({ parentId: cat.id, slug: 'rust', name: 'Rust' })).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('writes a revision only when content fields change', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    await updatePost({ actor: author, id: post.id, bodyMd: 'y' })
    const revs = await db.select().from(postRevisions).where(eq(postRevisions.postId, post.id))
    expect(revs.length).toBe(1)
  })

  it('refuses a stale update instead of overwriting', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const stale = new Date(post.updatedAt.getTime() - 1000)
    await expect(
      updatePost({ actor: author, id: post.id, bodyMd: 'y', expectedUpdatedAt: stale }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('lets a token publish only when canPublish is true', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const token = {
      kind: 'token',
      id: 't1',
      authorId: author.id,
      role: 'author',
      canPublish: false,
    } as const
    await expect(publishPost({ actor: token, id: post.id })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('hides other authors drafts from a plain author', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const mine = await createPost({ actor: author, categoryId: cat.id, title: 'mine', bodyMd: 'x' })
    const otherId = await createTestUser({ email: 'other@example.com' })
    const other = { kind: 'user', id: otherId, role: 'author' } as const
    const theirs = await createPost({ actor: other, categoryId: cat.id, title: 'theirs', bodyMd: 'y' })

    const visible = await listPosts({ actor: author, status: 'draft' })
    const ids = visible.items.map((item) => item.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
  })

  it('aggregates a category page over the whole subtree', async () => {
    const guide = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const rust = await createCategory({ parentId: guide.id, slug: 'rust', name: 'Rust' })
    const post = await createPost({ actor: author, categoryId: rust.id, title: 'A', bodyMd: 'x' })
    await publishPost({ actor: author, id: post.id })

    const listed = await listPosts({ actor: author, categoryPathPrefix: 'guide' })
    expect(listed.items.map((item) => item.id)).toContain(post.id)
    expect(listed.total).toBe(1)
  })

  it('attaches tags to a post', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({
      actor: author,
      categoryId: cat.id,
      title: 'A',
      bodyMd: 'x',
      tags: ['MCP', 'Next.js'],
    })
    await publishPost({ actor: author, id: post.id })
    const listed = await listPosts({ actor: author })
    expect(listed.items[0]?.tags.map((tag) => tag.slug).sort()).toEqual(['mcp', 'next-js'])
  })
})
