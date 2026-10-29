import { desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { postRevisions } from '../db/schema'
import { recordAudit } from '../audit'
import { DomainError } from '../errors'
import { isUuid } from '../uuid'
import { updatePost, type Actor, type Post } from './posts'

export type Revision = {
  id: string
  postId: string
  title: string
  summary: string | null
  bodyMd: string
  authorId: string
  source: 'human' | 'agent'
  createdAt: Date
}

/** 某篇文章的历史版本，按时间倒序（最新在前）。 */
export async function listRevisions(postId: string): Promise<Revision[]> {
  const rows = await db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt))

  return rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    title: row.title,
    summary: row.summary,
    bodyMd: row.bodyMd,
    authorId: row.authorId,
    source: row.source,
    createdAt: row.createdAt,
  }))
}

/**
 * 回滚到某个历史版本。
 * 只恢复内容字段（title / summary / bodyMd）——
 * 标签、分类、状态保持当前值，因为它们不是那次编辑的一部分。
 */
export async function restoreRevision(input: {
  actor: Actor
  postId: string
  revisionId: string
}): Promise<Post> {
  if (!isUuid(input.revisionId)) {
    throw new DomainError('not_found', '这个版本不存在', { revisionId: input.revisionId })
  }
  const revision = (
    await db.select().from(postRevisions).where(eq(postRevisions.id, input.revisionId))
  )[0]
  if (!revision || revision.postId !== input.postId) {
    throw new DomainError('not_found', '这个版本不存在', { revisionId: input.revisionId })
  }

  const post = await updatePost({
    actor: input.actor,
    id: input.postId,
    title: revision.title,
    summary: revision.summary,
    bodyMd: revision.bodyMd,
  })

  await recordAudit({
    actor: input.actor,
    action: 'revision.restore',
    target: { type: 'post', id: input.postId },
    meta: { revisionId: revision.id },
  })

  return post
}
