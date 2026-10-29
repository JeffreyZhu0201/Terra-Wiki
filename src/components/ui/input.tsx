import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  )
}
