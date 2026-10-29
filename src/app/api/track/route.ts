import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { trackView } from '@/server/services/views'

export const dynamic = 'force-dynamic'

const VID_COOKIE = 'terra_vid'

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null)
  const postId =
    typeof (body as { postId?: unknown } | null)?.postId === 'string'
      ? ((body as { postId: string }).postId)
      : ''

  if (!postId) return new Response(null, { status: 400 })

  const store = await cookies()
  let vid = store.get(VID_COOKIE)?.value
  if (!vid) {
    vid = randomUUID()
    store.set(VID_COOKIE, vid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  await trackView({ postId, vid })

  // 不回传计数——计数由页面自己渲染，避免多一次往返。
  return new Response(null, { status: 204 })
}
