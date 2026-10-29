import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { createTag, listTags, mergeTags } from './tags'

describe('tags', () => {
  beforeEach(async () => { await resetDb() })

  it('normalizes slugs to lowercase', async () => {
    const tag = await createTag('NextJS')
    expect(tag.slug).toBe('nextjs')
  })

  it('is idempotent for the same name', async () => {
    const a = await createTag('mcp')
    const b = await createTag('MCP')
    expect(a.id).toBe(b.id)
  })

  it('converts a Chinese name to a pinyin slug', async () => {
    const tag = await createTag('冒烟测试')
    expect(tag.slug).toBe('mao-yan-ce-shi')
  })

  it('merges one tag into another without duplicating article links', async () => {
    const a = await createTag('mcp')
    const b = await createTag('agent')
    await mergeTags(a.id, b.id)
    const all = await listTags()
    expect(all.map((tag) => tag.slug)).toEqual(['agent'])
  })
})
