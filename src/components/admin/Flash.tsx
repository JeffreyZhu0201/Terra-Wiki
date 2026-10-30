/**
 * 操作结果横幅。后台 action 用 `?ok=` / `?error=` 回跳，
 * 页面读出来显示在这里。
 */
export function Flash({ ok, error }: { ok?: string | undefined; error?: string | undefined }) {
  if (ok) {
    return (
      <p className="border border-rule bg-surface px-3 py-2 text-sm text-success" role="status">
        {ok}
      </p>
    )
  }
  if (error) {
    return (
      <p className="border border-danger px-3 py-2 text-sm text-danger" role="alert">
        {error}
      </p>
    )
  }
  return null
}
