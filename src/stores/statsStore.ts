import { create } from 'zustand'
import { addMatch, clearMatches, listMatches } from '@/features/stats/statsDb'
import type { MatchRecord } from '@/features/stats/types'
import { useSettings } from './settingsStore'

interface StatsStore {
  /** Newest first; null until loaded. */
  readonly records: readonly MatchRecord[] | null
  readonly error: string | null
  load(): Promise<void>
  /** Adds a finished game, unless the player switched statistics off. */
  record(record: Omit<MatchRecord, 'id'>): Promise<void>
  clear(): Promise<void>
}

export const useStats = create<StatsStore>()((set, get) => ({
  records: null,
  error: null,

  async load() {
    try {
      set({ records: await listMatches(), error: null })
    } catch {
      set({ records: [], error: 'Die Statistik konnte nicht geladen werden.' })
    }
  },

  async record(record) {
    if (!useSettings.getState().recordStats) return
    try {
      const id = await addMatch(record)
      const records = get().records
      if (records) set({ records: [{ ...record, id }, ...records] })
    } catch {
      // Storage unavailable (e.g. private mode): the game still works, it is just not recorded.
    }
  },

  async clear() {
    await clearMatches()
    set({ records: [] })
  },
}))
