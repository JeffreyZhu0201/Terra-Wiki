import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/**
 * 测试环境默认值。生产用 .env 里的真值，测试用这里的固定值——
 * 盐和密钥必须是测试专用的，否则测试数据会和生产哈希混在一起。
 */
const DEFAULT_TEST_DATABASE_URL = 'postgres://terra:terra@localhost:55432/terra_test'

process.env.TEST_DATABASE_URL ??= DEFAULT_TEST_DATABASE_URL
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL
process.env.VID_SALT ??= 'test-vid-salt'
process.env.MCP_TOKEN_SALT ??= 'test-token-salt'
process.env.SESSION_SECRET ??= 'test-session-secret'
process.env.UPLOAD_DIR ??= fileURLToPath(new URL('../.tmp/uploads', import.meta.url))

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

// 迁移目录还不存在时跳过——脚手架阶段先有测试基座，schema 在下一步落地。
if (existsSync(migrationsFolder)) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  try {
    await migrate(drizzle(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}
