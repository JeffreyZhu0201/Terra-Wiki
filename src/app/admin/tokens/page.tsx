import { redirect } from 'next/navigation'
import { Flash } from '@/components/admin/Flash'
import { TokenList } from '@/components/admin/TokenList'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listMcpTokens } from '@/server/services/tokens'

export const dynamic = 'force-dynamic'

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminTokensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/admin')

  const dict = getDictionary(await getLocale())
  const query = await searchParams
  const tokens = await listMcpTokens()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-ink">{dict.adminTokens}</h1>
      </header>

      <Flash ok={one(query.ok)} error={one(query.error)} />

      <TokenList
        tokens={tokens.map((token) => ({
          id: token.id,
          name: token.name,
          authorName: token.authorName,
          canPublish: token.canPublish,
          lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
          revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
          createdAt: token.createdAt.toISOString(),
        }))}
        labels={{
          name: dict.adminTokenName,
          canPublish: dict.adminTokenCanPublish,
          issue: dict.adminTokenIssue,
          plaintext: dict.adminTokenPlaintext,
          plaintextHint: dict.adminTokenPlaintextHint,
          saved: dict.adminTokenSaved,
          close: dict.adminTokenClose,
          revoke: dict.adminRevoke,
          revoked: dict.adminTokenRevoked,
          neverUsed: dict.adminTokenNever,
          createdAt: dict.adminTokenCreated,
          lastUsedAt: dict.adminTokenLastUsed,
          author: dict.adminColumnAuthor,
        }}
      />
    </div>
  )
}
