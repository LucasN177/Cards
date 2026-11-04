import type { GameResult, PlayerId } from '../core/types'

/**
 * A series ("Match") of several rounds of the same game. Scores add up over the rounds; who has
 * the best total after the last round wins the series. Pure functions, used by the UI layer.
 */
export interface SeriesConfig {
  /** Number of rounds; 1 = a single game. */
  readonly rounds: number
}

export interface Standing {
  readonly player: PlayerId
  readonly total: number
  readonly roundsWon: number
}

/** Higher totals win unless the game counts penalty points (`lowerScoreIsBetter`). */
const lowerIsBetter = (results: readonly GameResult[]) =>
  results.some((result) => result.lowerScoreIsBetter)

/** Totals per player, best first. */
export function seriesStandings(
  players: readonly PlayerId[],
  results: readonly GameResult[],
): Standing[] {
  const lower = lowerIsBetter(results)
  return players
    .map((player) => ({
      player,
      total: results.reduce((sum, result) => sum + (result.scores[player] ?? 0), 0),
      roundsWon: results.filter((result) => result.winners.includes(player)).length,
    }))
    .sort((a, b) => {
      const byTotal = lower ? a.total - b.total : b.total - a.total
      return byTotal !== 0 ? byTotal : b.roundsWon - a.roundsWon
    })
}

export const isSeriesOver = (config: SeriesConfig, results: readonly GameResult[]) =>
  results.length >= config.rounds

/** Everybody tied for the best total (and the same number of rounds won). */
export function seriesWinners(
  players: readonly PlayerId[],
  results: readonly GameResult[],
): PlayerId[] {
  const standings = seriesStandings(players, results)
  const best = standings[0]
  if (!best) return []
  return standings
    .filter((s) => s.total === best.total && s.roundsWon === best.roundsWon)
    .map((s) => s.player)
}
