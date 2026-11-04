import { DIFFICULTIES, type Difficulty } from '@/engine'
import type { MatchRecord, Outcome } from './types'

export interface Tally {
  readonly games: number
  readonly wins: number
  readonly draws: number
  readonly losses: number
  /** 0…1, or null without games. */
  readonly winRate: number | null
}

export interface Overview extends Tally {
  readonly playTimeMs: number
  /** Consecutive results of the same kind, counted back from the latest game. */
  readonly currentStreak: { readonly outcome: Outcome; readonly length: number } | null
  readonly longestWinStreak: number
}

export interface GameStats extends Tally {
  readonly gameId: string
  readonly averagePlacement: number | null
  readonly averageScore: number | null
  readonly bestScore: number | null
  readonly scoreLabel: string
  readonly lowerScoreIsBetter: boolean
  readonly fastestWinMs: number | null
  readonly byDifficulty: Readonly<Record<Difficulty, Tally>>
  /** Sums of the game-specific numbers. */
  readonly statTotals: Readonly<Record<string, number>>
  readonly lastPlayed: number
}

const average = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length

export function tally(records: readonly MatchRecord[]): Tally {
  const wins = records.filter((r) => r.outcome === 'win').length
  const draws = records.filter((r) => r.outcome === 'draw').length
  return {
    games: records.length,
    wins,
    draws,
    losses: records.length - wins - draws,
    winRate: records.length === 0 ? null : wins / records.length,
  }
}

/** Records in any order; streaks are computed chronologically. */
export function overview(records: readonly MatchRecord[]): Overview {
  const chronological = [...records].sort((a, b) => a.endedAt - b.endedAt)
  let longestWinStreak = 0
  let run = 0
  for (const record of chronological) {
    run = record.outcome === 'win' ? run + 1 : 0
    longestWinStreak = Math.max(longestWinStreak, run)
  }

  let currentStreak: Overview['currentStreak'] = null
  const latest = chronological.at(-1)
  if (latest) {
    let length = 0
    for (let i = chronological.length - 1; i >= 0; i--) {
      if (chronological[i]!.outcome !== latest.outcome) break
      length++
    }
    currentStreak = { outcome: latest.outcome, length }
  }

  return {
    ...tally(records),
    playTimeMs: records.reduce((sum, r) => sum + r.durationMs, 0),
    currentStreak,
    longestWinStreak,
  }
}

export function statsForGame(gameId: string, records: readonly MatchRecord[]): GameStats {
  const mine = records.filter((r) => r.gameId === gameId)
  const lowerScoreIsBetter = mine[0]?.lowerScoreIsBetter ?? false
  const scores = mine.map((r) => r.humanScore)
  const wins = mine.filter((r) => r.outcome === 'win')

  const statTotals: Record<string, number> = {}
  for (const record of mine) {
    for (const [key, value] of Object.entries(record.stats)) {
      statTotals[key] = (statTotals[key] ?? 0) + value
    }
  }

  return {
    gameId,
    ...tally(mine),
    averagePlacement: average(mine.map((r) => r.placement)),
    averageScore: average(scores),
    bestScore:
      scores.length === 0 ? null : lowerScoreIsBetter ? Math.min(...scores) : Math.max(...scores),
    scoreLabel: mine[0]?.scoreLabel ?? 'Punkte',
    lowerScoreIsBetter,
    fastestWinMs: wins.length === 0 ? null : Math.min(...wins.map((r) => r.durationMs)),
    byDifficulty: Object.fromEntries(
      DIFFICULTIES.map((d) => [d, tally(mine.filter((r) => r.difficulty === d))]),
    ) as Record<Difficulty, Tally>,
    statTotals,
    lastPlayed: Math.max(0, ...mine.map((r) => r.endedAt)),
  }
}

/** Stats per played game, most recently played first. */
export function statsByGame(records: readonly MatchRecord[]): GameStats[] {
  const ids = [...new Set(records.map((r) => r.gameId))]
  return ids.map((id) => statsForGame(id, records)).sort((a, b) => b.lastPlayed - a.lastPlayed)
}

// --- Formatting --------------------------------------------------------------------------------

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 })

export const formatPercent = (value: number | null) =>
  value === null ? '–' : percent.format(value)
export const formatDecimal = (value: number | null) =>
  value === null ? '–' : decimal.format(value)
export const formatCount = (value: number) =>
  value < 10_000 ? String(value) : compact.format(value)

/** e.g. "45 s", "12 min", "3 h 05 min". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '–'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}
