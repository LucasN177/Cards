import { create } from 'zustand'
import type { AnyGameDefinition } from '@/engine'
import { deleteSave, readSave, writeSave } from '@/features/persistence/savedGames'
import { type AnySession, createSession, restoreSession } from '@/features/table/session'
import { type GamePreferences, useSettings } from './settingsStore'

export interface Match {
  /** Changes with every new game, e.g. to remount the table. */
  readonly id: number
  readonly gameId: string
  readonly session: AnySession
  readonly preferences: GamePreferences
  readonly startedAt: number
  /** True when the match was continued from a saved game. */
  readonly resumed: boolean
}

interface MatchStore {
  /** The running game, kept across navigation (and across reloads via saved games). */
  readonly match: Match | null
  start(game: AnyGameDefinition, preferences?: GamePreferences): Match
  /** Continues the saved game for `game`, or returns null if there is none. */
  resume(game: AnyGameDefinition): Match | null
  clear(): void
}

export const DEFAULT_PREFERENCES: GamePreferences = { opponents: 1, difficulty: 'beginner' }

let matchCounter = 0

/** Stores the running game if the player wants games to be kept (setting "saveGames"). */
export function persistMatch(match: Match): void {
  if (!useSettings.getState().saveGames) return
  if (match.session.isOver) {
    deleteSave(match.gameId)
    return
  }
  writeSave({
    saved: match.session.toSaved(),
    preferences: match.preferences,
    startedAt: match.startedAt,
  })
}

export const useMatch = create<MatchStore>()((set) => ({
  match: null,

  start(game, preferences) {
    const settings = useSettings.getState()
    const prefs = preferences ??
      settings.games[game.id] ?? {
        ...DEFAULT_PREFERENCES,
        opponents: Math.max(0, game.players.min - 1),
      }
    const match: Match = {
      id: ++matchCounter,
      gameId: game.id,
      session: createSession(game, prefs, settings.playerName),
      preferences: prefs,
      startedAt: Date.now(),
      resumed: false,
    }
    // A new game replaces any saved one.
    deleteSave(game.id)
    persistMatch(match)
    set({ match })
    return match
  },

  resume(game) {
    const stored = readSave(game.id)
    if (!stored) return null
    const session = restoreSession(game, stored.saved)
    if (!session || session.isOver) {
      deleteSave(game.id)
      return null
    }
    const match: Match = {
      id: ++matchCounter,
      gameId: game.id,
      session,
      preferences: stored.preferences,
      startedAt: stored.startedAt,
      resumed: true,
    }
    set({ match })
    return match
  },

  clear: () => set({ match: null }),
}))
