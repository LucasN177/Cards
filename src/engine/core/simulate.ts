import type { AiAgent } from './agent'
import type { GameDefinition } from './game'
import { GameSession } from './session'
import type { GameResult, PlayerId, PlayerInfo } from './types'

export interface SimulationConfig<V, A, O> {
  readonly players: readonly PlayerInfo[]
  readonly agents: Readonly<Record<PlayerId, AiAgent<V, A>>>
  readonly options?: Partial<O>
  readonly seed?: number
  readonly maxMoves?: number
}

export interface SimulationOutcome<S, A, O extends object, V> {
  readonly result: GameResult
  readonly moves: number
  readonly session: GameSession<S, A, O, V>
}

/**
 * Plays a complete game with AI agents only. Used for rule tests (thousands of random games must
 * never break) and later for benchmarking AI strategies against each other.
 */
export async function simulateGame<S, A, O extends object, V>(
  game: GameDefinition<S, A, O, V>,
  config: SimulationConfig<V, A, O>,
): Promise<SimulationOutcome<S, A, O, V>> {
  const human = config.players.find((p) => p.kind !== 'ai' || !config.agents[p.id])
  if (human) throw new Error(`Simulation needs an AI agent for every player ("${human.id}")`)

  const session = new GameSession(game, config)
  const moves = await session.runAi(config.maxMoves)
  const result = session.result
  if (!result) throw new Error(`${game.name} did not reach a terminal state`)
  return { result, moves, session }
}
