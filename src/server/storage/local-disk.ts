import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Storage } from './types'

const UPLOAD_ROOT = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')

/** key 形如 2026/10/lz3k9a-x8f2q —— 文件名随机，内容不可变，可以长缓存。 */
function generateKey(ext: string): string {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const stamp = Date.now().toString(36)
  const random = randomBytes(3).toString('hex')
  return `${year}/${month}/${stamp}-${random}.${ext}`
}

export const LocalDiskStorage: Storage = {
  async put(bytes: Buffer, _mime: string, ext: string) {
    const key = generateKey(ext)
    const target = join(/*turbopackIgnore: true*/ UPLOAD_ROOT(), key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    return { storedPath: key, url: `/uploads/${key}` }
  },

  async delete(storedPath: string) {
    await rm(join(/*turbopackIgnore: true*/ UPLOAD_ROOT(), storedPath), { force: true })
  },
}
