import Link from 'next/link'
import { buildMonthGrid, dayKey, intensityLevel } from '@/lib/calendar'

type Labels = {
  title: string
  prevMonth: string
  nextMonth: string
  today: string
  todayMark: string
  weekdays: string[]
}

/**
 * 发布日历：按月展示发文量的热力网格。
 * 纯服务端渲染——切月与点日筛选都走 URL 参数，没有客户端脚本。
 * 配色在 globals.css 的 --color-cal-* 上，亮色白→黑、暗色反向。
 */
export function PublishCalendar({
  year,
  month,
  counts,
  selectedDay,
  labels,
  dayHref,
  monthHref,
}: {
  year: number
  month: number
  counts: Map<string, number>
  selectedDay: string | null
  labels: Labels
  dayHref: (day: string) => string
  monthHref: (year: number, month: number) => string
}) {
  const { weeks } = buildMonthGrid(year, month)
  const todayKey = dayKey(new Date())
  const monthMax = weeks
    .flat()
    .reduce((max, day) => (day ? Math.max(max, counts.get(day) ?? 0) : max), 0)

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }

  return (
    <nav aria-label={labels.title} className="publish-calendar">
      <div className="calendar-head">
        <Link href={monthHref(prev.year, prev.month)} aria-label={labels.prevMonth} rel="prev">
          ‹
        </Link>
        <p className="calendar-month">
          {year} · {String(month).padStart(2, '0')}
        </p>
        <Link href={monthHref(next.year, next.month)} aria-label={labels.nextMonth} rel="next">
          ›
        </Link>
      </div>

      <div className="calendar-grid" role="grid">
        {labels.weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} aria-hidden="true" className="calendar-weekday">
            {weekday}
          </span>
        ))}

        {weeks
          .flat()
          .map((day, index) =>
            day ? (
              <CalendarCell
                key={day}
                day={day}
                count={counts.get(day) ?? 0}
                level={intensityLevel(counts.get(day) ?? 0, monthMax)}
                isToday={day === todayKey}
                isSelected={day === selectedDay}
                href={dayHref(day)}
                todayLabel={labels.today}
                todayMark={labels.todayMark}
              />
            ) : (
              <span key={`pad-${index}`} aria-hidden="true" className="calendar-pad" />
            ),
          )}
      </div>
    </nav>
  )
}

function CalendarCell({
  day,
  count,
  level,
  isToday,
  isSelected,
  href,
  todayLabel,
  todayMark,
}: {
  day: string
  count: number
  level: number
  isToday: boolean
  isSelected: boolean
  href: string
  todayLabel: string
  todayMark: string
}) {
  const classes = ['calendar-cell']
  if (isToday) classes.push('is-today')
  if (isSelected) classes.push('is-selected')

  return (
    <Link
      href={href}
      role="gridcell"
      aria-label={`${day}${count > 0 ? ` · ${count}` : ''}${isToday ? ` · ${todayLabel}` : ''}`}
      aria-current={isToday ? 'date' : undefined}
      data-level={level}
      className={classes.join(' ')}
    >
      {/* 今天不显示日期数字，直接标「今 / Now」，扫一眼就知道橙圈在哪一天。 */}
      {isToday ? todayMark : Number(day.slice(8))}
    </Link>
  )
}
