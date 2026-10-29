import { sql } from 'drizzle-orm'
import { db } from '../src/server/db/client'
import { users } from '../src/server/db/schema'

/** argon2id of 'correct-horse-battery' —— 测试专用，固定不变以保证可重复。 */
const TEST_ADMIN_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$xdNxKKPEzzk0ufwgZOKcpg$bn4FVqO9xQiGzxhj6ulkcu7oO5KpTSDtnlRm8z+Sfsw'

/** TRUNCATE 顺序无关紧要（CASCADE 会处理外键），但列全避免漏表。 */
const TABLES = [
  'post_view_visitors',
  'post_view_daily',
  'post_revisions',
  'post_tags',
  'posts',
  'tags',
  'categories',
  'uploads',
  'mcp_tokens',
  'audit_logs',
  'redirects',
  'site_settings',
  'sessions',
  'users',
] as const

/** 清空全部业务表并重新灌入一个管理员。 */
export async function resetDb(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`))
  await db.insert(users).values({
    email: 'admin@example.com',
    passwordHash: TEST_ADMIN_HASH,
    name: 'Test Admin',
    role: 'admin',
  })
}

/** 再建一个用户，返回它的 id。测试里需要区分多个作者时用。 */
export async function createTestUser(input: {
  email: string
  role?: 'admin' | 'author'
}): Promise<string> {
  const row = (
    await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: TEST_ADMIN_HASH,
        name: input.email,
        role: input.role ?? 'author',
      })
      .returning()
  )[0]
  if (!row) throw new Error('测试用户创建失败')
  return row.id
}
