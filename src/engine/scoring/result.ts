import type { GameResult, PlayerId } from '../core/types'

/**
 * True when the winners belong to more than one side. Partners (`result.teams`) who win
 * together are one side, so two winners of the same team are a win, not a tie.
 */
export function isTie(winners: readonly PlayerId[], teams?: GameResult['teams']): boolean {
  const sides = new Set(
    winners.map((p) => {
      const team = teams?.findIndex((t) => t.includes(p)) ?? -1
      return team >= 0 ? `team:${team}` : `player:${p}`
    }),
  )
  return sides.size > 1
}
