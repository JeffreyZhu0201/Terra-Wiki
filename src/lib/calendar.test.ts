import { describe, expect, it } from 'vitest'
import {
  buildMonthGrid,
  dayKey,
  intensityLevel,
  monthRange,
  parseDayKey,
  parseMonthParam,
} from './calendar'

describe('calendar', () => {
  it('formats a local day key', () => {
    expect(dayKey(new Date(2026, 9, 30))).toBe('2026-10-30')
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('parses day keys and rejects garbage', () => {
    expect(parseDayKey('2026-10-30')).toEqual(new Date(2026, 9, 30))
    expect(parseDayKey('2026-10-3')).toBeNull()
    expect(parseDayKey(undefined)).toBeNull()
    expect(parseDayKey('2026-13-01')).toBeNull()
  })

  it('builds a Monday-first grid for October 2026', () => {
    // 2026-10-01 是周四 → 前面空 3 格（一、二、三）
    const { weeks, leading } = buildMonthGrid(2026, 10)
    expect(leading).toBe(3)
    expect(weeks[0]?.slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0]?.[3]).toBe('2026-10-01')
    expect(weeks.at(-1)?.filter(Boolean).at(-1)).toBe('2026-10-31')
    for (const week of weeks) expect(week).toHaveLength(7)
  })

  it('spans five or six weeks without leftover cells', () => {
    const { weeks } = buildMonthGrid(2026, 2)
    expect(weeks.length).toBeGreaterThanOrEqual(4)
    expect(weeks.length).toBeLessThanOrEqual(6)
    const days = weeks.flat().filter((d): d is string => d !== null)
    expect(days[0]).toBe('2026-02-01')
    expect(days.at(-1)).toBe('2026-02-28')
  })

  it('scales intensity to the month peak in four levels', () => {
    expect(intensityLevel(0, 5)).toBe(0)
    expect(intensityLevel(5, 5)).toBe(4)
    expect(intensityLevel(1, 5)).toBe(1)
    expect(intensityLevel(3, 5)).toBe(3)
    expect(intensityLevel(4, 5)).toBe(4)
    expect(intensityLevel(2, 0)).toBe(0)
  })

  it('gives a half-open month range', () => {
    const [from, to] = monthRange(2026, 10)
    expect(dayKey(from)).toBe('2026-10-01')
    expect(dayKey(to)).toBe('2026-11-01')
  })

  it('parses the month query param', () => {
    expect(parseMonthParam('2026-10')).toEqual({ year: 2026, month: 10 })
    expect(parseMonthParam(['2026-10', 'x'])).toEqual({ year: 2026, month: 10 })
    expect(parseMonthParam('2026-13')).toBeNull()
    expect(parseMonthParam('2026/10')).toBeNull()
    expect(parseMonthParam(undefined)).toBeNull()
  })
})
