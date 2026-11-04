import { create } from 'zustand'
import type { AnyGameDefinition } from '@/engine'
import { type AnySession, createSession } from '@/features/table/session'
import { type GamePreferences, useSettings } from './settingsStore'

export interface Match {
  /** Changes with every new game, e.g. to remount the table. */
  readonly id: number
  readonly gameId: string
  readonly session: AnySession
}

interface MatchStore {
  /** The running game. Kept across navigation; persistence across reloads comes in phase 4. */
  readonly match: Match | null
  start(game: AnyGameDefinition, preferences?: GamePreferences): Match
  clear(): void
}

export const DEFAULT_PREFERENCES: GamePreferences = { opponents: 1, difficulty: 'beginner' }

let matchCounter = 0

export const useMatch = create<MatchStore>()((set) => ({
  match: null,
  start(game, preferences) {
    const settings = useSettings.getState()
    const prefs = preferences ??
      settings.games[game.id] ?? {
        ...DEFAULT_PREFERENCES,
        opponents: Math.max(0, game.players.min - 1),
      }
    const match = {
      id: ++matchCounter,
      gameId: game.id,
      session: createSession(game, prefs, settings.playerName),
    }
    set({ match })
    return match
  },
  clear: () => set({ match: null }),
}))
