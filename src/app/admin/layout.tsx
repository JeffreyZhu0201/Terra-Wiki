import Link from 'next/link'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { LocaleToggle } from '@/components/layout/LocaleToggle'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { logoutAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const locale = await getLocale()
  const dict = getDictionary(locale)

  const items = [
    { href: '/admin', label: dict.adminDashboard },
    { href: '/admin/posts', label: dict.adminPosts },
    ...(user.role === 'admin'
      ? [{ href: '/admin/categories', label: dict.adminCategories }]
      : []),
    { href: '/admin/tags', label: dict.adminTags },
    { href: '/admin/media', label: dict.adminMedia },
    ...(user.role === 'admin'
      ? [
          { href: '/admin/team', label: dict.adminTeam },
          { href: '/admin/audit', label: dict.adminAudit },
          { href: '/admin/settings', label: dict.adminSettings },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-5">
          <Link href="/" className="font-serif text-lg tracking-wide text-ink">
            TERRA
          </Link>
          <span className="font-mono text-xs text-ink-muted">{dict.adminDashboard}</span>

          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="font-mono text-xs text-ink-muted hover:text-ink">
              {dict.adminBackToSite}
            </Link>
            <span className="font-mono text-xs text-ink-muted">{user.name}</span>
            <ThemeToggle />
            <LocaleToggle current={locale} />
            <form action={logoutAction}>
              <button
                type="submit"
                className="border border-rule px-2 py-1 font-mono text-xs text-ink-muted hover:border-accent hover:text-ink"
              >
                {dict.adminLogout}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-10 px-5">
        <aside className="w-44 shrink-0 py-8">
          <AdminNav items={items} />
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </div>
  )
}
