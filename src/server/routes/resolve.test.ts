import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { resolvePath } from './resolve'
import { createCategory } from '../services/categories'
import { createPost, publishPost } from '../services/posts'
import { db } from '../db/client'
import { redirects } from '../db/schema'

describe('route resolution', () => {
  beforeEach(async () => { await resetDb() })
  let actor: { kind: 'user'; id: string; role: 'admin' } = { kind: 'user', id: '', role: 'admin' }

  it('prefers a category path over an article', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    await publishPost({ actor, id: (await db.query.posts.findFirst())!.id })
    expect((await resolvePath(['guide']))!.kind).toBe('category')
    expect((await resolvePath(['guide', 'hello']))!.kind).toBe('post')
  })

  it('does not expose drafts publicly', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    expect(await resolvePath(['guide', 'hello'])).toBeNull()
  })

  it('returns a redirect when a path was moved', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await db.insert(redirects).values({ fromPath: '/old', toPath: '/guide', httpStatus: 301 })
    expect(await resolvePath(['old'])).toEqual({ kind: 'redirect', to: '/guide' })
  })

  it('resolves a nested article under its full category path', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const guide = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const rust = await createCategory({ parentId: guide.id, slug: 'rust', name: 'Rust' })
    const post = await createPost({ actor, categoryId: rust.id, slug: 'async', title: 'A', bodyMd: 'x' })
    await publishPost({ actor, id: post.id })
    expect((await resolvePath(['guide', 'rust']))!.kind).toBe('category')
    expect((await resolvePath(['guide', 'rust', 'async']))!.kind).toBe('post')
  })

  it('treats an empty path as home', async () => {
    expect(await resolvePath([])).toEqual({ kind: 'home' })
  })
})
