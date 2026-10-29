import { LocalDiskStorage } from './local-disk'
import type { Storage } from './types'

export type { Storage }
export const storage: Storage = LocalDiskStorage
