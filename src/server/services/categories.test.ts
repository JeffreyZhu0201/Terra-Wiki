import { describe, expect, it, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { resetDb } from '../../../tests/db'
import { DomainError } from '../errors'
import { createCategory, moveCategory, renameCategory, deleteCategory } from './categories'
import { db } from '../db/client'
import { categories, redirects } from '../db/schema'

describe('categories', () => {
  beforeEach(async () => { await resetDb() })

  it('builds a materialized path', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'Rust' })
    expect(a.path).toBe('guide')
    expect(b.path).toBe('guide/rust')
    expect(b.depth).toBe(1)
  })

  it('rejects a top-level slug that collides with a reserved word', async () => {
    await expect(createCategory({ parentId: null, slug: 'admin', name: 'x' }))
      .rejects.toBeInstanceOf(DomainError)
  })

  it('rejects two top-level categories with the same slug', async () => {
    await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    await expect(createCategory({ parentId: null, slug: 'guide', name: 'b' }))
      .rejects.toMatchObject({ code: 'conflict' })
  })

  it('writes a 301 for every descendant when moving a deep subtree', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    const c = await createCategory({ parentId: b.id, slug: 'async', name: 'c' })
    const x = await createCategory({ parentId: null, slug: 'ref', name: 'x' })
    await moveCategory({ id: a.id, newParentId: x.id })
    const rows = await db.select().from(redirects)
    const froms = rows.map(r => r.fromPath).sort()
    expect(froms).toContain('/guide')
    expect(froms).toContain('/guide/rust')
    expect(froms).toContain('/guide/rust/async')
  })

  it('refuses to delete a non-empty category', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    await expect(deleteCategory(a.id)).rejects.toMatchObject({ code: 'conflict' })
    await expect(deleteCategory(b.id)).resolves.toBeUndefined()
  })

  it('rewrites descendant paths and 301s when a slug changes', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    await renameCategory({ id: a.id, slug: 'manual' })
    const rows = await db.select().from(redirects)
    const froms = rows.map(r => r.fromPath).sort()
    expect(froms).toContain('/guide')
    expect(froms).toContain('/guide/rust')
    const moved = await db.query.categories.findFirst({
      where: eq(categories.slug, 'manual'),
    })
    expect(moved?.path).toBe('manual')
    const child = await db.query.categories.findFirst({
      where: eq(categories.slug, 'rust'),
    })
    expect(child?.path).toBe('manual/rust')
  })
})
