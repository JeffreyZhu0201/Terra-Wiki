import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// CI 必须与 AGENTS.md 的「完成的定义」一致：typecheck + test。
// 仓库没有 linter，所以这里也不该出现 lint 步骤。
describe('ci workflow', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

  it('runs on pushes to main and develop and on pull requests', () => {
    expect(ci).toContain('branches: [main, develop]')
    expect(ci).toContain('pull_request:')
  })

  it('runs the same checks as the definition of done', () => {
    expect(ci).toContain('pnpm typecheck')
    expect(ci).toContain('pnpm test')
    expect(ci).not.toContain('pnpm lint')
  })

  it('provides the test database on port 55432', () => {
    expect(ci).toContain('postgres:17-alpine')
    expect(ci).toContain('55432:5432')
    expect(ci).toContain('TEST_DATABASE_URL')
  })
})
