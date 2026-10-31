/** 发布日历的纯函数：网格生成与热力分级，与数据库无关，便于单测。 */

/** 本地时区的 YYYY-MM-DD。与页面展示、URL 参数同一口径。 */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 解析 YYYY-MM-DD；非法输入返回 null。按服务器本地时区落到当天 0 点。 */
export function parseDayKey(key: string | undefined | null): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const date = new Date(`${key}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export type MonthGrid = {
  /** 6 行 × 7 列（可能 5 行）；null 表示月外补位。周一起始。 */
  weeks: (string | null)[][]
  /** 当月第一天在网格前的空位（0-6）。 */
  leading: number
}

/** 生成某月的日历网格，周一为一周首日，返回按周分组的 day key。 */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // JS 的 getDay()：周日=0。转成周一起始的偏移。
  const leading = (first.getDay() + 6) % 7

  const cells: (string | null)[] = []
  for (let i = 0; i < leading; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(dayKey(new Date(year, month - 1, d)))

  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { weeks, leading }
}

/** 某月 [第一天, 下月第一天) 的本地时间区间，供按日统计用。 */
export function monthRange(year: number, month: number): [Date, Date] {
  return [new Date(year, month - 1, 1), new Date(year, month, 1)]
}

/** 解析 YYYY-MM；非法输入返回 null。 */
export function parseMonthParam(
  value: string | string[] | undefined,
): { year: number; month: number } | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null
  const [year, month] = raw.split('-').map(Number)
  if (!year || !month || month < 1 || month > 12) return null
  return { year, month }
}

/** 0（无发文）到 4（当月最多）的热力等级，按当月峰值等分四档。 */
export function intensityLevel(count: number, monthMax: number): number {
  if (count <= 0 || monthMax <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / monthMax) * 4)))
}
