import type { AiAgent } from './agent'
import type { Difficulty, GameOptionField, GameResult, GameSetup, PlayerId } from './types'

/**
 * The contract every card game implements. The engine only ever talks to games through it,
 * so adding a game never requires touching the engine.
 *
 * All functions must be pure and deterministic: the same state and action always produce the same
 * next state. Randomness after setup has to go through an `Rng` whose state is stored in `S`.
 *
 * @typeParam S Full game state (serializable, treated as immutable).
 * @typeParam A Player action (serializable).
 * @typeParam O Rule options / variants.
 * @typeParam V What a single player may see of the state (hidden cards removed).
 */
export interface GameDefinition<S, A, O extends object = Record<string, never>, V = S> {
  /** Stable, URL-safe id, e.g. `mau-mau`. Used for routing, saves and statistics. */
  readonly id: string
  readonly name: string
  readonly players: { readonly min: number; readonly max: number }
  readonly defaultOptions: O
  /** Rule variants the player can change before a game (keys of `O`). */
  readonly optionFields?: readonly GameOptionField[]
  /** Whether players may take back moves. Default: true. */
  readonly allowUndo?: boolean
  /** Several rounds can be played as one series with added-up scores (e.g. Mau-Mau). */
  readonly supportsSeries?: boolean

  setup(setup: GameSetup<O>): S

  /** Whose turn it is, or `null` once the game is over. */
  currentPlayer(state: S): PlayerId | null

  legalActions(state: S, player: PlayerId): readonly A[]

  /**
   * Returns an error message if `action` is not allowed, otherwise `null`. Implement it when the
   * set of legal actions is too large to enumerate cheaply (e.g. melds in Rommé). By default the
   * engine checks that the action structurally equals one of `legalActions`.
   */
  validateAction?(state: S, player: PlayerId, action: A): string | null

  /** Applies an action that has already been validated. Must not mutate `state`. */
  applyAction(state: S, player: PlayerId, action: A): S

  /** The part of the state `player` is allowed to see. Must hide other players' cards. */
  playerView(state: S, player: PlayerId): V

  isTerminal(state: S): boolean

  /** Final result; only called when `isTerminal` is true. */
  result(state: S): GameResult

  /** Default AI for a difficulty level. */
  createAgent?(difficulty: Difficulty): AiAgent<V, A>

  /** Short text for logs and move history. */
  describeAction?(action: A): string

  /** Game-specific numbers shown in the statistics (keys returned by `summarize`). */
  readonly statFields?: readonly { readonly key: string; readonly label: string }[]

  /** Computes `statFields` for `player` from a finished game's move history. */
  summarize?(game: {
    readonly history: readonly {
      readonly player: PlayerId
      readonly action: A
      readonly stateBefore: S
    }[]
    readonly finalState: S
    readonly player: PlayerId
  }): Readonly<Record<string, number>>
}

/** Type-erased game definition, e.g. for the registry. */
// Method syntax in GameDefinition keeps parameters bivariant, so every concrete game fits here.
export type AnyGameDefinition = GameDefinition<unknown, unknown, object, unknown>

/** Identity helper that gives full type inference when declaring a game. */
export function defineGame<S, A, O extends object = Record<string, never>, V = S>(
  game: GameDefinition<S, A, O, V>,
): GameDefinition<S, A, O, V> {
  return game
}
