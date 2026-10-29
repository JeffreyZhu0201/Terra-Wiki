import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const UPLOAD_ROOT = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  const key = path.join('/')

  // 目录穿越一律拒绝。
  if (!key || key.includes('..')) return new Response('Bad request', { status: 400 })

  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME[ext]
  if (!mime) return new Response('Not found', { status: 404 })

  try {
    const file = await readFile(join(UPLOAD_ROOT(), key))
    return new Response(new Uint8Array(file), {
      headers: {
        'content-type': mime,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
