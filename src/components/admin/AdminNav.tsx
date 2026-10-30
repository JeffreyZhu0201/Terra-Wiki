import Link from 'next/link'

export type AdminNavItem = {
  href: string
  label: string
}

/** 后台左侧导航。平台管理项只有 admin 能看到。 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  return (
    <nav aria-label="Admin" className="text-sm">
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block border-l-2 border-transparent py-1 pl-3 text-ink-muted hover:border-rule hover:text-ink"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
