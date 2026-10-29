import { LoginForm } from '@/components/auth/LoginForm'
import { bootstrapAdmin } from '@/server/services/auth'

// 登录页依赖运行时的库状态（是否有初始管理员），不能被静态预渲染。
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  await bootstrapAdmin()

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <LoginForm />
    </main>
  )
}
