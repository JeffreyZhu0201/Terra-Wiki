import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'

export default async function NotFound() {
  const dict = getDictionary(await getLocale())

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center text-ink">
      <h1 className="font-serif text-3xl">{dict.notFound}</h1>
      <p className="mt-2 text-sm text-ink-muted">{dict.notFoundHint}</p>
      <Link href="/" className="mt-6 text-sm text-accent underline underline-offset-4">
        {dict.backHome}
      </Link>
    </div>
  )
}
