import { create } from 'zustand'
import { type AnyGameDefinition, type GameResult, isSeriesOver } from '@/engine'
import { deleteSave, readSave, writeSave } from '@/features/persistence/savedGames'
import { type AnySession, createSession, restoreSession } from '@/features/table/session'
import { type GamePreferences, useSettings } from './settingsStore'

export interface Series {
  readonly rounds: number
  /** Results of the finished rounds before the current one. */
  readonly completed: readonly GameResult[]
}

export interface Match {
  /** Changes with every new game or round, e.g. to remount the table. */
  readonly id: number
  readonly gameId: string
  readonly session: AnySession
  readonly preferences: GamePreferences
  readonly startedAt: number
  /** True when the match was continued from a saved game. */
  readonly resumed: boolean
  readonly series: Series
}

interface MatchStore {
  /** The running game, kept across navigation (and across reloads via saved games). */
  readonly match: Match | null
  start(game: AnyGameDefinition, preferences?: GamePreferences): Match
  /** Continues the saved game for `game`, or returns null if there is none. */
  resume(game: AnyGameDefinition): Match | null
  /** Starts the next round of the series once the current round is over. */
  nextRound(): Match | null
  clear(): void
}

export const DEFAULT_PREFERENCES: GamePreferences = { opponents: 1, difficulty: 'beginner' }

let matchCounter = 0

/** Results of all finished rounds including the current one (if it is over). */
export function seriesResults(match: Match): GameResult[] {
  const current = match.session.result
  return current ? [...match.series.completed, current] : [...match.series.completed]
}

export const isMatchFinished = (match: Match) =>
  match.session.isOver && isSeriesOver(match.series, seriesResults(match))

/** Stores the running game if the player wants games to be kept (setting "saveGames"). */
export function persistMatch(match: Match): void {
  if (!useSettings.getState().saveGames) return
  if (isMatchFinished(match)) {
    deleteSave(match.gameId)
    return
  }
  const base = {
    gameId: match.gameId,
    preferences: match.preferences,
    startedAt: match.startedAt,
  }
  if (match.session.isOver) {
    // Between two rounds: keep the series so far; the next round starts on return.
    writeSave({ ...base, series: { rounds: match.series.rounds, completed: seriesResults(match) } })
  } else {
    writeSave({ ...base, saved: match.session.toSaved(), series: match.series })
  }
}

function newMatch(
  game: AnyGameDefinition,
  preferences: GamePreferences,
  series: Series,
  startedAt = Date.now(),
): Match {
  return {
    id: ++matchCounter,
    gameId: game.id,
    session: createSession(game, preferences, useSettings.getState().playerName),
    preferences,
    startedAt,
    resumed: false,
    series,
  }
}

export const useMatch = create<MatchStore>()((set, get) => ({
  match: null,

  start(game, preferences) {
    const settings = useSettings.getState()
    const prefs = preferences ??
      settings.games[game.id] ?? {
        ...DEFAULT_PREFERENCES,
        opponents: Math.max(0, (game.players.default ?? game.players.min) - 1),
      }
    const rounds = game.supportsSeries ? Math.max(1, prefs.rounds ?? 1) : 1
    const match = newMatch(game, prefs, { rounds, completed: [] })
    // A new game replaces any saved one.
    deleteSave(game.id)
    persistMatch(match)
    set({ match })
    return match
  },

  resume(game) {
    const stored = readSave(game.id)
    if (!stored) return null
    const series: Series = stored.series ?? { rounds: 1, completed: [] }

    if (!stored.saved) {
      // Saved between two rounds: continue with the next one.
      if (isSeriesOver(series, series.completed)) {
        deleteSave(game.id)
        return null
      }
      const match = { ...newMatch(game, stored.preferences, series), resumed: true }
      persistMatch(match)
      set({ match })
      return match
    }

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
      series,
    }
    set({ match })
    return match
  },

  nextRound() {
    const current = get().match
    if (!current?.session.isOver || isMatchFinished(current)) return null
    const game = current.session.game
    const match = newMatch(game, current.preferences, {
      rounds: current.series.rounds,
      completed: seriesResults(current),
    })
    persistMatch(match)
    set({ match })
    return match
  },

  clear: () => set({ match: null }),
}))
