import Link from 'next/link'
import { getDictionary, getLocale } from '@/i18n'
import { listAuditLogs } from '@/server/audit'
import { requireUser } from '@/server/auth/session'
import { listPosts, type Actor } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const user = await requireUser()
  const dict = getDictionary(await getLocale())

  const actor: Actor = { kind: 'user', id: user.id, role: user.role }

  const [drafts, published, activity] = await Promise.all([
    listPosts({ actor, status: 'draft', limit: 20 }),
    listPosts({ actor, status: 'published', limit: 1 }),
    listAuditLogs({ ...(user.role === 'admin' ? {} : { actorId: user.id }), limit: 20 }),
  ])

  const totalRow = await listPosts({ actor: { kind: 'user', id: '', role: 'author' }, limit: 1 })

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-ink">{dict.adminDashboard}</h1>
        <Link
          href="/admin/posts/new"
          className="bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover"
        >
          {dict.adminNewPost}
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label={dict.adminTotalPosts} value={totalRow.total} />
        <Stat label={dict.adminStatusPublished} value={published.total} />
        <Stat label={dict.adminDrafts} value={drafts.total} />
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.adminDrafts}
        </h2>
        {drafts.items.length === 0 ? (
          <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {drafts.items.map((post) => (
              <li key={post.id} className="flex items-center justify-between py-3">
                <Link
                  href={`/admin/posts/${post.id}`}
                  className="text-ink hover:text-accent"
                >
                  {post.title}
                </Link>
                <span className="font-mono text-xs text-ink-muted">
                  {post.updatedAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.adminRecentActivity}
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2 font-mono text-xs">
                <span className="w-32 shrink-0 text-ink-muted">
                  {entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
                <span className="w-16 shrink-0 text-ink-muted">{entry.actorType}</span>
                <span className="text-ink">{entry.action}</span>
                <span className="truncate text-ink-muted">
                  {entry.targetType}:{entry.targetId.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-rule bg-surface px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
    </div>
  )
}
