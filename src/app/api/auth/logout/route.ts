import { NextResponse } from 'next/server'
import { destroySession } from '@/server/auth/session'

export async function POST(): Promise<NextResponse> {
  await destroySession()
  return NextResponse.json({ ok: true })
}
