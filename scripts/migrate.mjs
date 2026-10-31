// 容器启动时的自动迁移脚本：替代独立的 migrate 镜像。
// 只依赖 drizzle-orm（运行时依赖）与 pg，不引入 drizzle-kit；
// 与 drizzle-kit migrate 共用同一张 drizzle.__drizzle_migrations 记录表，可无缝接管。
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL 未设置，拒绝执行')
  process.exit(1)
}

// 兼容两种运行位置：本地仓库根（scripts/..）与镜像内 /app
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  await migrate(drizzle(pool), { migrationsFolder: join(repoRoot, 'drizzle') })
  console.log('[migrate] 迁移完成')
} catch (error) {
  console.error('[migrate] 迁移失败：', error)
  process.exit(1)
} finally {
  await pool.end()
}
