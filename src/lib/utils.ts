import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 class 名称。后写的 Tailwind 冲突类覆盖先写的，
 * 避免组件内部样式被外部传入的 class 意外压掉。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
