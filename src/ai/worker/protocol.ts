import { type AiAgent, type Difficulty, gameRegistry, Rng, type RngState } from '@/engine'

/**
 * Messages between the app and the AI worker. Everything is plain, structured-cloneable data;
 * the worker rebuilds the agent from the game registry.
 */
export interface AiRequest {
  readonly id: number
  /** Identifies one agent instance, so stateful agents keep their memory between turns. */
  readonly agentKey: string
  readonly gameId: string
  readonly difficulty: Difficulty
  readonly playerId: string
  readonly view: unknown
  readonly legalActions: readonly unknown[]
  readonly rng: RngState
}

export type AiResponse =
  | { readonly id: number; readonly ok: true; readonly action: unknown; readonly rng: RngState }
  | { readonly id: number; readonly ok: false; readonly error: string }

const MAX_AGENTS = 64
const agents = new Map<string, AiAgent<unknown, unknown>>()

function agentFor(request: AiRequest): AiAgent<unknown, unknown> {
  const cached = agents.get(request.agentKey)
  if (cached) return cached
  const game = gameRegistry.require(request.gameId)
  const agent = game.createAgent?.(request.difficulty)
  if (!agent) throw new Error(`Game "${request.gameId}" has no AI`)
  // Old sessions' agents are dropped first; a small cap is plenty for one player.
  if (agents.size >= MAX_AGENTS) agents.delete(agents.keys().next().value!)
  agents.set(request.agentKey, agent)
  return agent
}

/** Runs one AI decision. Used inside the worker and as the in-thread fallback in tests. */
export async function handleAiRequest(request: AiRequest): Promise<AiResponse> {
  try {
    const rng = new Rng(request.rng)
    const action = await agentFor(request).chooseAction({
      playerId: request.playerId,
      view: request.view,
      legalActions: request.legalActions,
      rng,
    })
    return { id: request.id, ok: true, action, rng: rng.state }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Tests only. */
export function resetWorkerAgentsForTests(): void {
  agents.clear()
}
