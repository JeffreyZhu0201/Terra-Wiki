import { redirect } from 'next/navigation'
import {
  createUserAction,
  setUserDisabledAction,
  setUserRoleAction,
} from '@/app/admin/actions'
import { Flash } from '@/components/admin/Flash'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listUsers } from '@/server/services/users'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const members = await listUsers()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminTeam}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left font-mono text-xs uppercase tracking-wider text-ink-muted">
            <th className="py-2 pr-4 font-normal">{dict.adminName}</th>
            <th className="py-2 pr-4 font-normal">{dict.adminEmail}</th>
            <th className="py-2 pr-4 font-normal">{dict.adminRole}</th>
            <th className="py-2 font-normal">{dict.adminColumnActions}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-rule align-top">
              <td className="py-2.5 pr-4">
                {member.name}
                {member.disabledAt ? (
                  <span className="ml-2 font-mono text-xs text-danger">
                    {dict.adminDisabled}
                  </span>
                ) : null}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{member.email}</td>
              <td className="py-2.5 pr-4">
                <form action={setUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={member.id} />
                  <select
                    name="role"
                    defaultValue={member.role}
                    className="border border-rule bg-surface px-2 py-1 text-ink"
                  >
                    <option value="author">{dict.adminRoleAuthor}</option>
                    <option value="admin">{dict.adminRoleAdmin}</option>
                  </select>
                  <button
                    type="submit"
                    className="border border-rule px-2 py-1 hover:border-accent hover:text-accent"
                  >
                    {dict.adminSave}
                  </button>
                </form>
              </td>
              <td className="py-2.5">
                <form action={setUserDisabledAction}>
                  <input type="hidden" name="id" value={member.id} />
                  <input
                    type="hidden"
                    name="disabled"
                    value={member.disabledAt ? 'false' : 'true'}
                  />
                  <button
                    type="submit"
                    disabled={member.id === user.id}
                    title={member.id === user.id ? dict.adminCannotDisableSelf : undefined}
                    className="font-mono text-xs text-danger underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40 disabled:text-ink-muted disabled:no-underline"
                  >
                    {member.disabledAt ? dict.adminEnable : dict.adminDisable}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={createUserAction} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminEmail}</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminName}</span>
          <input
            name="name"
            required
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminPassword}</span>
          <input
            name="password"
            type="password"
            required
            minLength={12}
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{dict.adminRole}</span>
          <select
            name="role"
            defaultValue="author"
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 text-ink"
          >
            <option value="author">{dict.adminRoleAuthor}</option>
            <option value="admin">{dict.adminRoleAdmin}</option>
          </select>
        </label>
        <button type="submit" className="bg-accent px-3 py-2 text-paper hover:bg-accent-hover">
          {dict.adminNewUser}
        </button>
      </form>
    </div>
  )
}
