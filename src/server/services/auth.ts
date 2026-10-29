import { count, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../auth/password'
import type { SessionUser } from '../auth/session'

/**
 * 首次启动时创建初始管理员。users 表非空则什么都不做。
 * 缺少环境变量时抛错——静默跳过会让人卡在"登录不了但没有任何提示"。
 */
export async function bootstrapAdmin(): Promise<void> {
  const [row] = await db.select({ value: count() }).from(users)
  if ((row?.value ?? 0) > 0) return

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('缺少 BOOTSTRAP_ADMIN_EMAIL 或 BOOTSTRAP_ADMIN_PASSWORD，无法创建初始管理员')
  }

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    name: '管理员',
    role: 'admin',
  })
}

/** 校验邮箱密码，成功返回用户，失败返回 null。停用的成员视为登录失败。 */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const row = (await db.select().from(users).where(eq(users.email, email)))[0]
  if (!row) return null
  // 停用的成员一律拒绝——密码对也不放行。
  if (row.disabledAt) return null
  if (!(await verifyPassword(password, row.passwordHash))) return null
  return { id: row.id, email: row.email, name: row.name, role: row.role }
}
