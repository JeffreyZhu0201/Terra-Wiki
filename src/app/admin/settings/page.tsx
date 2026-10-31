import { redirect } from 'next/navigation'
import { resetSettingAction, updateSettingsAction } from '@/app/admin/actions'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { getSettings, listStoredSettingKeys, type SettingKey } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const SETTING_FIELDS: SettingKey[] = [
  'siteName',
  'siteDescription',
  'siteUrl',
  'rssTitle',
  'siteKeywords',
  'siteFooter',
]

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const [settings, storedKeys] = await Promise.all([getSettings(), listStoredSettingKeys()])

  /** 每项标出当前值来自 DB 还是 env——env 只是初始值，改完存进 DB。 */
  function source(key: SettingKey): string {
    return storedKeys.has(key) ? dict.adminSettingsFromDb : dict.adminSettingsFromEnv
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminSettings}</h1>
        <p className="mt-1 text-sm text-ink-muted">{dict.adminSettingsFromEnv}</p>
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

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsKeywords}</span>
          <input
            name="siteKeywords"
            defaultValue={settings.siteKeywords}
            placeholder="rust, mcp, typescript"
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 font-mono text-ink"
          />
          <span className="mt-1 block font-mono text-xs text-ink-muted">
            {dict.adminSettingsKeywordsHint}
          </span>
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminSettingsFooter}</span>
          <input
            name="siteFooter"
            defaultValue={settings.siteFooter}
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink"
          />
        </label>

        <div className="flex items-center gap-4">
          <button type="submit" className="bg-accent px-3 py-2 text-paper hover:bg-accent-hover">
            {dict.adminSaveSettings}
          </button>
          <span className="font-mono text-xs text-ink-muted">{source('siteName')}</span>
        </div>
      </form>

      <section className="max-w-xl">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.adminSettingsReset}
        </h2>
        <ul className="divide-y divide-rule border border-rule bg-surface">
          {SETTING_FIELDS.map((key) => (
            <li key={key} className="flex items-center gap-4 p-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{key}</span>
              <span className="font-mono text-xs text-ink-muted">{source(key)}</span>
              {storedKeys.has(key) ? (
                <form action={resetSettingAction}>
                  <input type="hidden" name="key" value={key} />
                  <button
                    type="submit"
                    className="font-mono text-xs text-accent underline underline-offset-4"
                  >
                    {dict.adminSettingsReset}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
