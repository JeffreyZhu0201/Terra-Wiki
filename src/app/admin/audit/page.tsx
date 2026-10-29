import { redirect } from 'next/navigation'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { listAuditLogs } from '@/server/audit'
import { requireUser } from '@/server/auth/session'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const action = one(query.action)

  const entries = await listAuditLogs({ ...(action ? { action } : {}), limit: 200 })
  // 过滤器选项来自已有日志——action 是自由文本，没法穷举。
  const actions = [...new Set(entries.map((entry) => entry.action))].sort()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminAudit}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminColumnActions}</span>
          <select
            name="action"
            defaultValue={action ?? ''}
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 font-mono text-ink"
          >
            <option value="">{dict.adminAllStatuses}</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="border border-rule px-3 py-1.5 hover:border-accent">
          {dict.searchQuery}
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left font-mono text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-2 pr-4 font-normal">{dict.adminColumnUpdated}</th>
              <th className="py-2 pr-4 font-normal">{dict.adminColumnAuthor}</th>
              <th className="py-2 pr-4 font-normal">{dict.adminColumnActions}</th>
              <th className="py-2 font-normal">{dict.adminColumnCategory}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-rule align-top">
                <td className="py-2 pr-4 font-mono text-xs text-ink-muted">
                  {entry.createdAt.toISOString().slice(0, 19).replace('T', ' ')}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {entry.actorType}:{entry.actorId.slice(0, 8)}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
                <td className="py-2 font-mono text-xs text-ink-muted">
                  {entry.targetType}:{entry.targetId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
