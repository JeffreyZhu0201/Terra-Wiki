import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/server/auth/constants'

/**
 * /admin 的乐观检查：没有会话 cookie 就跳登录页。
 * 真正的校验（查库、比对过期）在 admin layout 里做，proxy 只做快速拦截。
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
