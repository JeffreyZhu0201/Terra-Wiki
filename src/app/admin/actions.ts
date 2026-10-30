'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth/session'
import { destroySession } from '@/server/auth/session'
import { DomainError } from '@/server/errors'
import { recordAudit } from '@/server/audit'
import {
  createCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
} from '@/server/services/categories'
import { mergeTags, renameTag } from '@/server/services/tags'
import { deleteMedia, uploadMedia } from '@/server/services/media'
import { createUser, setUserDisabled, setUserRole } from '@/server/services/users'
import { createMcpToken, revokeMcpToken } from '@/server/services/tokens'
import { updateSettings } from '@/server/services/settings'
import type { SessionUser } from '@/server/auth/session'

/** 表单 action 的结果。带错误信息时页面会显示横幅。 */
export type ActionResult = {
  ok: boolean
  message?: string | undefined
  token?: string | undefined
  /** 上传成功后返回可用的图片地址。 */
  urls?: string[] | undefined
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function strOrNull(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value === '' ? null : value
}

function back(path: string, result: ActionResult): never {
  const params = new URLSearchParams()
  if (result.ok) {
    if (result.message) params.set('ok', result.message)
  } else {
    params.set('error', result.message ?? '操作失败')
  }
  redirect(params.size > 0 ? `${path}?${params.toString()}` : path)
}

async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new DomainError('forbidden', '仅管理员可执行此操作')
  }
  return user
}

async function run(
  path: string,
  action: () => Promise<void>,
  successMessage?: string,
): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof DomainError) {
      back(path, { ok: false, message: error.message })
    }
    throw error
  }
  back(path, { ok: true, message: successMessage })
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/login')
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const parentId = strOrNull(formData, 'parentId')

  await run(
    '/admin/categories',
    async () => {
      const category = await createCategory({
        parentId,
        slug: str(formData, 'slug'),
        name: str(formData, 'name'),
        ...(str(formData, 'description') ? { description: str(formData, 'description') } : {}),
      })
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'category.create',
        target: { type: 'category', id: category.id },
        meta: { path: category.path },
      })
    },
    '分类已创建',
  )
}

export async function renameCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')
  const name = str(formData, 'name')
  const slug = str(formData, 'slug')

  await run(
    '/admin/categories',
    async () => {
      const category = await renameCategory({
        id,
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
      })
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'category.rename',
        target: { type: 'category', id },
        meta: { path: category.path },
      })
    },
    '分类已更新',
  )
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')
  const parentId = strOrNull(formData, 'parentId')

  await run(
    '/admin/categories',
    async () => {
      const category = await moveCategory({ id, newParentId: parentId })
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'category.move',
        target: { type: 'category', id },
        meta: { path: category.path },
      })
    },
    '分类已移动',
  )
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')

  await run(
    '/admin/categories',
    async () => {
      await deleteCategory(id)
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'category.delete',
        target: { type: 'category', id },
      })
    },
    '分类已删除',
  )
}

export async function renameTagAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = str(formData, 'id')

  await run(
    '/admin/tags',
    async () => {
      await renameTag(id, str(formData, 'name'))
      await recordAudit({
        actor: { kind: 'user', id: user.id, role: user.role },
        action: 'tag.rename',
        target: { type: 'tag', id },
      })
    },
    '标签已重命名',
  )
}

export async function mergeTagsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const sourceId = str(formData, 'sourceId')
  const targetId = str(formData, 'targetId')

  await run(
    '/admin/tags',
    async () => {
      await mergeTags(sourceId, targetId)
      await recordAudit({
        actor: { kind: 'user', id: user.id, role: user.role },
        action: 'tag.merge',
        target: { type: 'tag', id: targetId },
        meta: { sourceId },
      })
    },
    '标签已合并',
  )
}

/**
 * 上传图片。返回结果而不是跳转——媒体库页面和编辑器都用它，
 * 客户端要拿到返回的 URL 才能插入 Markdown。
 */
export async function uploadMediaAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const actor = { kind: 'user' as const, id: user.id, role: user.role }
  const files = formData
    .getAll('file')
    .filter((item): item is File => item instanceof File && item.size > 0)

  if (files.length === 0) return { ok: false, message: '没有选择文件' }

  try {
    const urls: string[] = []
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer())
      const media = await uploadMedia({ actor, bytes, filename: file.name, mime: file.type })
      await recordAudit({
        actor,
        action: 'media.upload',
        target: { type: 'upload', id: media.id },
        meta: { url: media.url },
      })
      urls.push(media.url)
    }
    revalidatePath('/admin/media')
    return { ok: true, urls, message: `已上传 ${urls.length} 个文件` }
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message }
    throw error
  }
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = str(formData, 'id')

  await run(
    '/admin/media',
    async () => {
      await deleteMedia({ kind: 'user', id: user.id, role: user.role }, id)
      await recordAudit({
        actor: { kind: 'user', id: user.id, role: user.role },
        action: 'media.delete',
        target: { type: 'upload', id },
      })
    },
    '文件已删除',
  )
}

export async function createUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()

  await run(
    '/admin/team',
    async () => {
      const user = await createUser({
        email: str(formData, 'email'),
        name: str(formData, 'name'),
        password: str(formData, 'password'),
        role: str(formData, 'role') === 'admin' ? 'admin' : 'author',
      })
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'user.create',
        target: { type: 'user', id: user.id },
      })
    },
    '成员已创建',
  )
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')

  await run(
    '/admin/team',
    async () => {
      await setUserRole(id, str(formData, 'role') === 'admin' ? 'admin' : 'author')
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'user.role',
        target: { type: 'user', id },
      })
    },
    '角色已更新',
  )
}

/** 停用 / 启用成员。停用会踢掉该成员的所有会话。 */
export async function setUserDisabledAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')
  const disabled = str(formData, 'disabled') === 'true'

  await run(
    '/admin/team',
    async () => {
      await setUserDisabled(id, disabled)
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: disabled ? 'user.disable' : 'user.enable',
        target: { type: 'user', id },
      })
    },
    disabled ? '成员已停用' : '成员已启用',
  )
}

/** 签发 Token。明文只在这次响应里返回。 */
export async function createTokenAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const canPublish = formData.get('canPublish') === 'on'

  try {
    const created = await createMcpToken({
      actor: { kind: 'user', id: admin.id, role: admin.role },
      name: str(formData, 'name'),
      canPublish,
    })
    await recordAudit({
      actor: { kind: 'user', id: admin.id, role: admin.role },
      action: 'token.create',
      target: { type: 'token', id: created.id },
      meta: { canPublish },
    })
    revalidatePath('/admin/tokens')
    return { ok: true, token: created.token, message: 'Token 已签发' }
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message }
    throw error
  }
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = str(formData, 'id')

  await run(
    '/admin/tokens',
    async () => {
      await revokeMcpToken(id)
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'token.revoke',
        target: { type: 'token', id },
      })
    },
    'Token 已吊销',
  )
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()

  await run(
    '/admin/settings',
    async () => {
      await updateSettings({
        siteName: str(formData, 'siteName'),
        siteDescription: str(formData, 'siteDescription'),
        siteUrl: str(formData, 'siteUrl'),
        rssTitle: str(formData, 'rssTitle'),
      })
      await recordAudit({
        actor: { kind: 'user', id: admin.id, role: admin.role },
        action: 'settings.update',
        target: { type: 'settings', id: 'site' },
      })
    },
    '设置已保存',
  )
}
