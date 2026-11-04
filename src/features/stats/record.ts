import type { PlayerId } from '@/engine'
import type { AnySession } from '@/features/table/session'
import type { MatchRecord, Outcome } from './types'

/** Turns a finished session into a history record from the human player's point of view. */
export function buildMatchRecord(
  session: AnySession,
  humanId: PlayerId,
  startedAt: number,
  endedAt = Date.now(),
): Omit<MatchRecord, 'id'> | null {
  const result = session.result
  if (!result) return null

  const ranking =
    result.ranking ??
    [...session.players]
      .map((p) => p.id)
      .sort((a, b) => (result.scores[b] ?? 0) - (result.scores[a] ?? 0))
  const won = result.winners.includes(humanId)
  const outcome: Outcome = won ? (result.winners.length > 1 ? 'draw' : 'win') : 'loss'
  const ai = session.players.filter((p) => p.kind === 'ai')

  return {
    gameId: session.game.id,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    players: session.players,
    humanId,
    outcome,
    placement: ranking.indexOf(humanId) + 1,
    opponents: ai.length,
    difficulty: ai[0]?.difficulty ?? null,
    scores: result.scores,
    humanScore: result.scores[humanId] ?? 0,
    scoreLabel: result.scoreLabel ?? 'Punkte',
    lowerScoreIsBetter: result.lowerScoreIsBetter ?? false,
    options: session.options as Record<string, unknown>,
    moves: session.history.length,
    stats:
      session.game.summarize?.({
        history: session.history,
        finalState: session.state,
        player: humanId,
      }) ?? {},
  }
}
