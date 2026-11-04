import type { Difficulty, PlayerId, PlayerInfo } from '@/engine'

export type Outcome = 'win' | 'loss' | 'draw'

/** One finished game, as stored in the local match history. */
export interface MatchRecord {
  readonly id?: number
  readonly gameId: string
  readonly startedAt: number
  readonly endedAt: number
  readonly durationMs: number
  readonly players: readonly PlayerInfo[]
  readonly humanId: PlayerId
  readonly outcome: Outcome
  /** 1 = best. */
  readonly placement: number
  readonly opponents: number
  readonly difficulty: Difficulty | null
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly humanScore: number
  readonly scoreLabel: string
  readonly lowerScoreIsBetter: boolean
  readonly options: Readonly<Record<string, unknown>>
  readonly moves: number
  /** Game-specific numbers from `GameDefinition.summarize`. */
  readonly stats: Readonly<Record<string, number>>
}
