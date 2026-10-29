import { desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { uploads } from '../db/schema'
import { DomainError } from '../errors'
import { storage } from '../storage'
import { actorUserId, type Actor } from './posts'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * 按文件头判断真实类型。扩展名和 MIME 都能伪造，
 * 字节头不会——这是唯一能信的东西。
 */
const SIGNATURES: { mime: string; ext: string; matches: (bytes: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    ext: 'png',
    matches: (bytes) =>
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    matches: (bytes) => bytes.subarray(0, 4).toString('latin1') === 'GIF8',
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (bytes) =>
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
]

export type UploadedMedia = {
  id: string
  url: string
  markdown: string
}

export async function uploadMedia(input: {
  actor: Actor
  bytes: Buffer
  filename: string
  mime: string
}): Promise<UploadedMedia> {
  if (input.bytes.byteLength === 0) {
    throw new DomainError('invalid', '文件是空的')
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new DomainError('invalid', '文件超过 10MB 上限', { maxBytes: MAX_BYTES })
  }

  const signature = SIGNATURES.find((candidate) => candidate.matches(input.bytes))
  if (!signature) {
    throw new DomainError('invalid', '只接受 png / jpeg / webp / gif 图片', {
      declaredMime: input.mime,
    })
  }

  // 文件名由服务端生成——调用方给的名字只当显示用。
  const { storedPath, url } = await storage.put(input.bytes, signature.mime, signature.ext)

  const row = (
    await db
      .insert(uploads)
      .values({
        filename: storedPath.split('/').pop() ?? storedPath,
        storedPath,
        mime: signature.mime,
        bytes: input.bytes.byteLength,
        uploaderId: actorUserId(input.actor),
      })
      .returning()
  )[0]
  if (!row) throw new DomainError('conflict', '上传记录写入失败')

  return { id: row.id, url, markdown: `![](${url})` }
}

export async function deleteMedia(actor: Actor, id: string): Promise<void> {
  const row = (await db.select().from(uploads).where(eq(uploads.id, id)))[0]
  if (!row) throw new DomainError('not_found', '文件不存在', { id })

  await storage.delete(row.storedPath)
  await db.delete(uploads).where(eq(uploads.id, id))
}

export async function listMedia(): Promise<
  { id: string; filename: string; url: string; mime: string; bytes: number; createdAt: Date }[]
> {
  const rows = await db.select().from(uploads).orderBy(desc(uploads.createdAt)).limit(200)
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    url: `/uploads/${row.storedPath}`,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.createdAt,
  }))
}
