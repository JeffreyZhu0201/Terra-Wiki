import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from './client'

describe('schema', () => {
  it('has pg_trgm extension and trigram indexes', async () => {
    const ext = await db.execute(sql`select extname from pg_extension where extname = 'pg_trgm'`)
    expect(ext.rows.length).toBe(1)
    const idx = await db.execute(sql`select indexname from pg_indexes where indexname like '%_trgm'`)
    expect(idx.rows.map(r => r.indexname).sort()).toEqual([
      'posts_body_trgm', 'posts_summary_trgm', 'posts_title_trgm',
    ])
  })

  it('enforces unique top-level category slug', async () => {
    const names = await db.execute(sql`select indexname from pg_indexes where tablename='categories'`)
    expect(names.rows.map(r => r.indexname)).toContain('categories_top_level_slug_unique')
  })
})
