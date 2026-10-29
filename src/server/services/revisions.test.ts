import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../../tests/db'
import { createCategory } from './categories'
import { createPost, getPostById, updatePost } from './posts'
import { listRevisions, restoreRevision } from './revisions'

type Actor = { kind: 'user'; id: string; role: 'admin' }

let actor: Actor = { kind: 'user', id: '', role: 'admin' }

describe('revisions', () => {
  beforeEach(async () => {
    await resetDb()
    const { db } = await import('../db/client')

    actor.id = (await db.query.users.findFirst())!.id
  })

  it('snapshots content changes only', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    await updatePost({ actor, id: post.id, bodyMd: 'y' })
    await updatePost({ actor, id: post.id, title: 'B' })

    const revs = await listRevisions(post.id)
    // 建文章不算一次修改，所以是 2 条而不是 3 条。
    expect(revs).toHaveLength(2)
    // 快照存的是"改之前"的内容，最新一条就是上次改动前的样子。
    expect(revs[0]?.bodyMd).toBe('y')
    expect(revs[1]?.bodyMd).toBe('x')
    expect(revs[0]?.title).toBe('A')
  })

  it('does not snapshot a status change', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const { publishPost } = await import('./posts')
    await publishPost({ actor, id: post.id })

    expect(await listRevisions(post.id)).toHaveLength(0)
  })

  it('restores content but keeps tags and status', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({
      actor,
      categoryId: cat.id,
      title: 'A',
      bodyMd: 'v1',
      tags: ['mcp'],
    })
    await updatePost({ actor, id: post.id, bodyMd: 'v2' })
    const rev = (await listRevisions(post.id))[0]!
    await restoreRevision({ actor, postId: post.id, revisionId: rev.id })

    const after = await getPostById(post.id)
    expect(after?.bodyMd).toBe('v1')
    expect(after?.status).toBe('draft')

    // 恢复本身也是一次内容修改，所以又多了一条版本。
    expect(await listRevisions(post.id)).toHaveLength(2)
  })

  it('rejects a revision belonging to another post', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const a = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const b = await createPost({ actor, categoryId: cat.id, title: 'B', bodyMd: 'y' })
    await updatePost({ actor, id: a.id, bodyMd: 'a2' })
    const rev = (await listRevisions(a.id))[0]!

    await expect(
      restoreRevision({ actor, postId: b.id, revisionId: rev.id }),
    ).rejects.toThrow()
  })
})
