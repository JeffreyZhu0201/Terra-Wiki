import { desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { postRevisions } from '../db/schema'
import { recordAudit } from '../audit'
import { DomainError } from '../errors'
import { isUuid } from '../uuid'
import { actorUserId, getPostById, updatePost, type Actor, type Post } from './posts'

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

/**
 * 某篇文章的历史版本，按时间倒序（最新在前）。
 *
 * 版本历史只对**作者本人与管理员**可见——和后台文章编辑页一个口径。
 * 规则放在 service 层，后台与 MCP 走同一段判断，不会两边跑偏。
 *
 * 看不到时报「不存在」而不是「没权限」：不该让人知道这篇草稿存在。
 */
export async function listRevisions(input: {
  postId: string
  actor: Actor
}): Promise<Revision[]> {
  const post = await getPostById(input.postId)
  if (!post) {
    throw new DomainError('not_found', '文章不存在', { id: input.postId })
  }
  if (post.authorId !== actorUserId(input.actor) && input.actor.role !== 'admin') {
    throw new DomainError('not_found', '文章不存在', { id: input.postId })
  }

  const rows = await db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, input.postId))
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
