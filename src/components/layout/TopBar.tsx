import Link from 'next/link'
import { LocaleToggle } from './LocaleToggle'
import { ThemeToggle } from './ThemeToggle'
import { getDictionary, getLocale } from '@/i18n'
import type { CategoryNode } from '@/server/services/categories'
import { getSettings } from '@/server/services/settings'

export async function TopBar({ tree }: { tree: CategoryNode[] }) {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const settings = await getSettings()

  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-6 px-5">
        <Link href="/" className="font-serif text-lg tracking-wide text-ink">
          {settings.siteName}
        </Link>

        <nav className="hidden items-center gap-4 text-sm md:flex">
          {tree.map((node) => (
            <Link key={node.id} href={`/${node.path}`} className="text-ink-muted hover:text-ink">
              {node.name}
            </Link>
          ))}
        </nav>

        <form action="/search" role="search" className="ml-auto">
          <input
            type="search"
            name="q"
            placeholder={dict.searchPlaceholder}
            aria-label={dict.navSearch}
            className="w-36 border border-rule bg-surface px-2.5 py-1 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-accent sm:w-56"
          />
        </form>

        <ThemeToggle />
        <LocaleToggle current={locale} />
      </div>
    </header>
  )
}
