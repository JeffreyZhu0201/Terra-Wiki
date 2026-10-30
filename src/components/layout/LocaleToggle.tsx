'use client'

import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, type Locale } from '@/i18n/locale'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'EN' },
]

export function LocaleToggle({ current }: { current: Locale }) {
  const router = useRouter()

  function switchTo(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label="Switch language">
      {LOCALES.map((locale) => (
        <button
          key={locale.value}
          type="button"
          onClick={() => switchTo(locale.value)}
          aria-current={locale.value === current}
          className={
            locale.value === current
              ? 'px-1.5 py-1 text-ink underline decoration-accent decoration-2 underline-offset-4'
              : 'px-1.5 py-1 text-ink-muted hover:text-ink'
          }
        >
          {locale.label}
        </button>
      ))}
    </div>
  )
}
