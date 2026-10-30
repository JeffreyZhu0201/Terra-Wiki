import Link from 'next/link'
import { PostList } from '@/components/article/PostList'
import { PublishCalendar } from '@/components/layout/PublishCalendar'
import { getDictionary, getLocale } from '@/i18n'
import { dayKey, monthRange, parseDayKey, parseMonthParam } from '@/lib/calendar'
import { listCategoryTree } from '@/server/services/categories'
import { countPostsByDay, listPosts, PUBLIC_ACTOR } from '@/server/services/posts'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function HomePage({ searchParams }: Props) {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const query = await searchParams

  const now = new Date()
  const month = parseMonthParam(query.month) ?? { year: now.getFullYear(), month: now.getMonth() + 1 }
  const selectedDay = parseDayKey(Array.isArray(query.day) ? query.day[0] : query.day)
  const selectedDayKey = selectedDay ? dayKey(selectedDay) : null

  const [from, to] = monthRange(month.year, month.month)
  const [latest, featured, tree, settings, counts] = await Promise.all([
    selectedDay
      ? listPosts({ actor: PUBLIC_ACTOR, day: selectedDayKey!, limit: 20 })
      : listPosts({ actor: PUBLIC_ACTOR, limit: 20 }),
    listPosts({ actor: PUBLIC_ACTOR, featured: true, limit: 5 }),
    listCategoryTree(),
    getSettings(),
    countPostsByDay(from, to),
  ])

  const monthHref = (year: number, m: number) => {
    const params = new URLSearchParams({ month: `${year}-${String(m).padStart(2, '0')}` })
    return `/?${params}`
  }
  const dayHref = (day: string) =>
    selectedDayKey === day
      ? monthHref(month.year, month.month)
      : `${monthHref(month.year, month.month)}&day=${day}`

  return (
    <div className="grid gap-x-12 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <section className="mb-14">
          <h1 className="font-serif text-4xl leading-tight text-ink">{settings.siteName}</h1>
        </section>

        {selectedDay ? (
          <section className="mb-8 flex flex-wrap items-center gap-3 border border-rule bg-surface px-4 py-2 text-sm">
            <span className="font-mono text-xs text-ink-muted">
              {selectedDayKey} · {latest.total} {dict.calendarSelectedDay}
            </span>
            <Link href={monthHref(month.year, month.month)} className="text-accent hover:underline">
              {dict.calendarClearFilter}
            </Link>
          </section>
        ) : null}

        {!selectedDay && featured.items.length > 0 ? (
          <section className="mb-12">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
              {dict.homeFeatured}
            </h2>
            <PostList items={featured.items} total={featured.total} />
          </section>
        ) : null}

        <section className="mb-12">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
            {selectedDay ? dict.calendarSelectedDay : dict.homeLatest}
          </h2>
          <PostList items={latest.items} total={latest.total} />
        </section>

        {!selectedDay ? (
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
              {dict.homeCategories}
            </h2>
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {tree.map((node) => (
                <li key={node.id}>
                  <Link href={`/${node.path}`} className="text-ink hover:text-accent">
                    {node.name}
                    <span className="ml-2 font-mono text-xs text-ink-muted">{node.postCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/*
        右栏 fixed 钉在视口：日历放右上角。
        pt-8 与正文、左栏的顶 padding 一致，三栏内容同一水平线起头。
        grid 第二列保留宽度占位，正文列不会被日历压到。
      */}
      <aside className="fixed right-[max(1.25rem,calc((100vw-1440px)/2+1.25rem))] top-14 hidden w-64 flex-col justify-start pt-8 xl:flex">
        <PublishCalendar
          year={month.year}
          month={month.month}
          counts={counts}
          selectedDay={selectedDayKey}
          labels={{
            title: dict.calendarTitle,
            prevMonth: dict.calendarPrevMonth,
            nextMonth: dict.calendarNextMonth,
            today: dict.calendarToday,
            weekdays: Array.from(dict.calendarWeekdays),
          }}
          dayHref={dayHref}
          monthHref={monthHref}
        />
      </aside>
    </div>
  )
}
