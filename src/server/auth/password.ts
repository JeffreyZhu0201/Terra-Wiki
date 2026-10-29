import { hash, verify } from '@node-rs/argon2'

/**
 * 不显式传 algorithm：该库的默认值就是 Argon2id（参数 m=19456, t=2, p=1），
 * 且 Algorithm 是 ambient const enum，在 isolatedModules 下无法安全引用。
 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

export async function verifyPassword(plain: string, hashValue: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain)
  } catch {
    // 哈希串格式不对或损坏时一律当作验证失败。
    return false
  }
}
