import type { GameResult, SavedGame } from '@/engine'
import type { GamePreferences } from '@/stores/settingsStore'

/**
 * Running games are kept in localStorage: they are small (seed + move list) and written
 * synchronously, so nothing is lost when the app is closed right after a move.
 */
const PREFIX = 'cards:save:'

export interface StoredSeries {
  readonly rounds: number
  readonly completed: readonly GameResult[]
}

export interface StoredGame {
  readonly version: 1
  readonly gameId: string
  /** The round in progress; missing between two rounds of a series. */
  readonly saved?: SavedGame<object, unknown>
  readonly series?: StoredSeries
  readonly preferences: GamePreferences
  readonly startedAt: number
  readonly updatedAt: number
}

const keyOf = (gameId: string) => `${PREFIX}${gameId}`

export function writeSave(game: Omit<StoredGame, 'version' | 'updatedAt'>): void {
  const stored: StoredGame = { version: 1, ...game, updatedAt: Date.now() }
  try {
    localStorage.setItem(keyOf(game.gameId), JSON.stringify(stored))
  } catch {
    // Storage full or blocked (private mode) – the game simply is not resumable.
  }
}

export function readSave(gameId: string): StoredGame | null {
  try {
    const raw = localStorage.getItem(keyOf(gameId))
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredGame
    // Saves from before series support have no top-level gameId.
    const id = stored.gameId ?? stored.saved?.gameId
    return stored.version === 1 && id === gameId && (stored.saved || stored.series)
      ? { ...stored, gameId: id }
      : null
  } catch {
    return null
  }
}

export function deleteSave(gameId: string): void {
  try {
    localStorage.removeItem(keyOf(gameId))
  } catch {
    // ignore
  }
}

/** Ids of all games with a saved, unfinished match. */
export function listSaves(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .map((key) => key.slice(PREFIX.length))
  } catch {
    return []
  }
}

export function deleteAllSaves(): void {
  for (const gameId of listSaves()) deleteSave(gameId)
}
