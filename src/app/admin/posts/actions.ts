'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/audit'
import { DomainError } from '@/server/errors'
import { renderMarkdown, type TocEntry } from '@/server/markdown/render'
import {
  archivePost,
  createPost,
  publishPost,
  unpublishPost,
  updatePost,
} from '@/server/services/posts'
import { restoreRevision } from '@/server/services/revisions'

export type PostActionResult = {
  ok: boolean
  message?: string | undefined
  postId?: string | undefined
  details?: Record<string, unknown> | undefined
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function strOrNull(formData: FormData, key: string): string | null {
  const value = str(formData, key).trim()
  return value === '' ? null : value
}

function tags(formData: FormData): string[] {
  const value = formData.get('tags')
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}

/**
 * 保存文章。新建与更新走同一个入口——
 * 传入 postId 就是更新，否则新建。
 */
export async function savePostAction(formData: FormData): Promise<PostActionResult> {
  const user = await requireUser()
  const actor = { kind: 'user' as const, id: user.id, role: user.role }
  const postId = str(formData, 'postId')

  const title = str(formData, 'title').trim()
  const bodyMd = str(formData, 'bodyMd')
  const summary = strOrNull(formData, 'summary')
  const categoryId = str(formData, 'categoryId')
  const slug = strOrNull(formData, 'slug')
  const tagNames = tags(formData)
  const expectedUpdatedAt = strOrNull(formData, 'expectedUpdatedAt')

  if (!title) return { ok: false, message: '标题不能为空' }
  if (!categoryId) return { ok: false, message: '请选择分类' }

  try {
    if (postId) {
      const post = await updatePost({
        actor,
        id: postId,
        title,
        summary,
        bodyMd,
        tags: tagNames,
        ...(slug ? { slug } : {}),
        ...(expectedUpdatedAt ? { expectedUpdatedAt: new Date(expectedUpdatedAt) } : {}),
      })
      await recordAudit({
        actor,
        action: 'post.update',
        target: { type: 'post', id: post.id },
      })
      revalidatePath(`/admin/posts/${post.id}`)
      revalidatePath('/admin/posts')
      return { ok: true, postId: post.id, message: '已保存' }
    }

    const post = await createPost({
      actor,
      categoryId,
      title,
      bodyMd,
      tags: tagNames,
      ...(summary ? { summary } : {}),
      ...(slug ? { slug } : {}),
    })
    await recordAudit({
      actor,
      action: 'post.create',
      target: { type: 'post', id: post.id },
    })
    revalidatePath('/admin/posts')
    return { ok: true, postId: post.id, message: '已创建' }
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, details: error.details }
    }
    throw error
  }
}

export async function publishAction(formData: FormData): Promise<PostActionResult> {
  return changeStatus(formData, 'publish')
}

export async function unpublishAction(formData: FormData): Promise<PostActionResult> {
  return changeStatus(formData, 'unpublish')
}

export async function archiveAction(formData: FormData): Promise<PostActionResult> {
  return changeStatus(formData, 'archive')
}

async function changeStatus(
  formData: FormData,
  mode: 'publish' | 'unpublish' | 'archive',
): Promise<PostActionResult> {
  const user = await requireUser()
  const actor = { kind: 'user' as const, id: user.id, role: user.role }
  const postId = str(formData, 'postId')

  try {
    const post =
      mode === 'publish'
        ? await publishPost({ actor, id: postId })
        : mode === 'unpublish'
          ? await unpublishPost({ actor, id: postId })
          : await archivePost({ actor, id: postId })

    await recordAudit({ actor, action: `post.${mode}`, target: { type: 'post', id: postId } })
    revalidatePath(`/admin/posts/${postId}`)
    revalidatePath('/admin/posts')
    return { ok: true, postId: post.id, message: '状态已更新' }
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, details: error.details }
    }
    throw error
  }
}

export async function restoreRevisionAction(formData: FormData): Promise<PostActionResult> {
  const user = await requireUser()
  const actor = { kind: 'user' as const, id: user.id, role: user.role }
  const postId = str(formData, 'postId')
  const revisionId = str(formData, 'revisionId')

  try {
    await restoreRevision({ actor, postId, revisionId })
    revalidatePath(`/admin/posts/${postId}`)
    return { ok: true, postId, message: '已恢复到该版本' }
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, details: error.details }
    }
    throw error
  }
}

/** 编辑器预览。复用服务端渲染器，不在客户端引入 Shiki。 */
export async function previewMarkdownAction(md: string): Promise<{ html: string; toc: TocEntry[] }> {
  await requireUser()
  return renderMarkdown(md)
}
