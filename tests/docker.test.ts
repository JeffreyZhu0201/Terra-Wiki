import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('docker packaging', () => {
  it('uses node:24-slim and runs as non-root', () => {
    const df = readFileSync('Dockerfile', 'utf8')
    expect(df).toContain('node:24-slim')
    // alpine 没有预编译的 argon2 二进制，native 模块会编不出来。
    expect(df).not.toContain('node:24-alpine')
    expect(df).toContain('USER nextjs')
  })

  it('compose defines db, migrate and app with the uploads volume', () => {
    const c = readFileSync('docker-compose.yml', 'utf8')
    expect(c).toContain('postgres:17-alpine')
    expect(c).toContain('pgdata')
    expect(c).toContain('uploads:/app/uploads')
    expect(c).toContain('service_completed_successfully')
  })

  it('migrates before the app starts', () => {
    const c = readFileSync('docker-compose.yml', 'utf8')
    const migrateIndex = c.indexOf('migrate:')
    const appIndex = c.indexOf('  app:')
    expect(migrateIndex).toBeGreaterThan(-1)
    expect(appIndex).toBeGreaterThan(migrateIndex)
  })
})
