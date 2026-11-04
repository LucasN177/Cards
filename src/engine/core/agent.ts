import type { Rng } from './rng'
import type { PlayerId } from './types'

export interface AiDecisionContext<V, A> {
  readonly playerId: PlayerId
  /** What this player is allowed to see. Agents never get the full game state. */
  readonly view: V
  /** Never empty when an agent is asked to decide. */
  readonly legalActions: readonly A[]
  /** Deterministic per session, so AI-only games are reproducible. */
  readonly rng: Rng
}

/** Contract every computer opponent implements. Concrete strategies live in `src/ai`. */
export interface AiAgent<V, A> {
  readonly name: string
  chooseAction(context: AiDecisionContext<V, A>): A | Promise<A>
  /** Optional human-readable reason for the last decision. */
  explain?(context: AiDecisionContext<V, A>, action: A): string
}
