import { createHash } from 'node:crypto'

/** 全项目唯一的 sha256 实现。token 与访客标识都先哈希再入库。 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
