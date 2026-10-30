import { restoreRevisionAction } from '@/app/admin/posts/actions'
import { getDictionary, getLocale } from '@/i18n'
import type { Revision } from '@/server/services/revisions'

export async function RevisionList({ postId, revisions }: { postId: string; revisions: Revision[] }) {
  const dict = getDictionary(await getLocale())

  if (revisions.length === 0) {
    return <p className="text-sm text-ink-muted">{dict.adminNoItems}</p>
  }

  return (
    <ul className="divide-y divide-rule border-t border-rule">
      {revisions.map((revision) => (
        <li key={revision.id} className="flex items-center gap-4 py-2.5 text-sm">
          <span className="w-40 shrink-0 font-mono text-xs text-ink-muted">
            {revision.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
          </span>
          <span className="w-16 shrink-0 font-mono text-xs text-ink-muted">
            {revision.source === 'agent' ? dict.adminSourceAgent : dict.adminSourceHuman}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink">{revision.title}</span>
          <span className="shrink-0 font-mono text-xs text-ink-muted">
            {revision.bodyMd.length} {dict.adminWordCount}
          </span>
          {/* action 必须是 server function 引用——内联闭包不能传给 Client Component。 */}
          <form action={restoreRevisionAction} className="shrink-0">
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="revisionId" value={revision.id} />
            <button
              type="submit"
              className="font-mono text-xs text-accent underline underline-offset-4"
            >
              {dict.adminRestore}
            </button>
          </form>
        </li>
      ))}
    </ul>
  )
}
