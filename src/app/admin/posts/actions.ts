'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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

/** 提交后带着结果跳回页面——结果走 query，页面用 Flash 渲染。 */
function back(path: string, result: { ok: boolean; message?: string }): never {
  const params = new URLSearchParams()
  if (result.ok) {
    if (result.message) params.set('ok', result.message)
  } else {
    params.set('error', result.message ?? '操作失败')
  }
  redirect(params.size > 0 ? `${path}?${params.toString()}` : path)
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

/**
 * 恢复历史版本。form action 必须是 void 返回——
 * 内联闭包也不能传给 form，只能直接引用 server function。
 */
export async function restoreRevisionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const postId = str(formData, 'postId')
  const revisionId = str(formData, 'revisionId')

  try {
    await restoreRevision({ actor: { kind: 'user', id: user.id, role: user.role }, postId, revisionId })
  } catch (error) {
    if (error instanceof DomainError) {
      back(`/admin/posts/${postId}`, { ok: false, message: error.message })
    }
    throw error
  }
  revalidatePath(`/admin/posts/${postId}`)
  back(`/admin/posts/${postId}`, { ok: true, message: '已恢复到该版本' })
}

/** 编辑器预览。复用服务端渲染器，不在客户端引入 Shiki。 */
export async function previewMarkdownAction(md: string): Promise<{ html: string; toc: TocEntry[] }> {
  await requireUser()
  return renderMarkdown(md)
}
