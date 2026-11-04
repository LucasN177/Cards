import type { MatchRecord } from '@/features/stats/types'

/** A finished match for statistics tests; each call ends one minute after the previous one. */
let clock = 1_000_000
export function makeRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  clock += 60_000
  return {
    gameId: 'mau-mau',
    startedAt: clock - 120_000,
    endedAt: clock,
    durationMs: 120_000,
    players: [
      { id: 'you', name: 'Du', kind: 'human' },
      { id: 'ai-1', name: 'Anna', kind: 'ai', difficulty: 'beginner' },
    ],
    humanId: 'you',
    outcome: 'win',
    placement: 1,
    opponents: 1,
    difficulty: 'beginner',
    scores: { you: 0, 'ai-1': 14 },
    humanScore: 0,
    scoreLabel: 'Strafpunkte',
    lowerScoreIsBetter: true,
    options: {},
    moves: 20,
    stats: { cardsPlayed: 5, cardsDrawn: 2 },
    ...overrides,
  }
}
