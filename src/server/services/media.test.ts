import { describe, expect, it, beforeEach } from 'vitest'
import { rm } from 'node:fs/promises'
import { resetDb, createTestUser } from '../../../tests/db'
import { uploadMedia } from './media'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

describe('media', () => {
  let actor: { kind: 'user'; id: string; role: 'admin' }

  beforeEach(async () => {
    await resetDb()
    actor = {
      kind: 'user',
      id: await createTestUser({ email: 'media@example.com', role: 'admin' }),
      role: 'admin',
    }
    await rm(process.env.UPLOAD_DIR ?? '.tmp/uploads', { recursive: true, force: true })
  })

  it('rejects svg', async () => {
    await expect(
      uploadMedia({
        actor,
        bytes: Buffer.from('<svg onload="x()"/>'),
        filename: 'a.svg',
        mime: 'image/svg+xml',
      }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects a payload whose magic bytes do not match the extension', async () => {
    const svg = Buffer.from('<svg onload="x()"/>')
    await expect(
      uploadMedia({ actor, bytes: svg, filename: 'a.png', mime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('accepts a real png and ignores the client filename', async () => {
    const out = await uploadMedia({
      actor,
      bytes: PNG,
      filename: '../../etc/passwd.png',
      mime: 'image/png',
    })
    expect(out.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[a-z0-9]+-[a-z0-9]+\.png$/)
    expect(out.url).not.toContain('passwd')
    expect(out.markdown).toBe(`![](${out.url})`)
  })

  it('rejects an empty file', async () => {
    await expect(
      uploadMedia({ actor, bytes: Buffer.alloc(0), filename: 'a.png', mime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })
})
