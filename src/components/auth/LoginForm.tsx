'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (response.ok) {
      router.push('/admin')
      router.refresh()
      return
    }

    const data = (await response.json().catch(() => null)) as { message?: string } | null
    setError(data?.message ?? '登录失败，请稍后重试')
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border border-rule bg-surface p-6">
      <h1 className="font-serif text-2xl text-ink">登录</h1>

      <label className="block text-sm text-ink-muted">
        邮箱
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-ink outline-none focus-visible:border-accent"
        />
      </label>

      <label className="block text-sm text-ink-muted">
        密码
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-ink outline-none focus-visible:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? '登录中' : '登录'}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  )
}
