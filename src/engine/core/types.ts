export type PlayerId = string

export type PlayerKind = 'human' | 'ai'

export const DIFFICULTIES = ['beginner', 'intermediate', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface PlayerInfo {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
  /** Only relevant for AI players. */
  readonly difficulty?: Difficulty
}

export interface GameSetup<O> {
  /** Players in seating order. */
  readonly players: readonly PlayerInfo[]
  readonly options: O
  readonly seed: number
}

export interface GameResult {
  readonly scores: Readonly<Record<PlayerId, number>>
  /** More than one entry for ties or team wins; empty if nobody wins. */
  readonly winners: readonly PlayerId[]
  /** Best first. Defaults to sorting by score, highest first. */
  readonly ranking?: readonly PlayerId[]
  /** What the score means, e.g. "Strafpunkte". Defaults to "Punkte". */
  readonly scoreLabel?: string
  /** True when fewer points are better (penalty points). */
  readonly lowerScoreIsBetter?: boolean
}

/** Describes a rule option so the setup screen can render it without game-specific UI code. */
export type GameOptionField =
  | {
      readonly type: 'boolean'
      readonly key: string
      readonly label: string
      readonly description?: string
    }
  | {
      readonly type: 'choice'
      readonly key: string
      readonly label: string
      readonly description?: string
      readonly choices: readonly { readonly value: string | number; readonly label: string }[]
    }
