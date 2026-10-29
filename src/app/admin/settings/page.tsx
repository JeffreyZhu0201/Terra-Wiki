import { redirect } from 'next/navigation'
import { updateSettingsAction } from '@/app/admin/actions'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const settings = await getSettings()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminSettings}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <form action={updateSettingsAction} className="max-w-xl space-y-4 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsSiteName}</span>
          <input
            name="siteName"
            defaultValue={settings.siteName}
            required
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsDescription}</span>
          <textarea
            name="siteDescription"
            defaultValue={settings.siteDescription}
            rows={3}
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsUrl}</span>
          <input
            name="siteUrl"
            type="url"
            defaultValue={settings.siteUrl}
            required
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 font-mono text-ink"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsRssTitle}</span>
          <input
            name="rssTitle"
            defaultValue={settings.rssTitle}
            required
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink"
          />
        </label>

        <button type="submit" className="bg-accent px-3 py-2 text-paper hover:bg-accent-hover">
          {dict.adminSaveSettings}
        </button>
      </form>
    </div>
  )
}
