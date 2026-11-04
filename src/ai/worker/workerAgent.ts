import type { AiAgent, AnyGameDefinition, Difficulty } from '@/engine'
import type { AiRequest, AiResponse } from './protocol'

/** The part of `Worker` the client needs; tests pass an in-thread stand-in. */
export interface WorkerLike {
  postMessage(message: AiRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<AiResponse>) => void): void
  addEventListener(type: 'error', listener: (event: Event) => void): void
}

/** Sends AI requests to the worker and matches the answers by id. */
export class AiWorkerClient {
  private readonly worker: WorkerLike
  private readonly pending = new Map<number, (response: AiResponse) => void>()
  private nextId = 1
  /** Set once the worker failed to start or crashed; callers then think on the main thread. */
  broken = false

  constructor(worker: WorkerLike) {
    this.worker = worker
    worker.addEventListener('message', (event) => {
      const resolve = this.pending.get(event.data.id)
      this.pending.delete(event.data.id)
      resolve?.(event.data)
    })
    worker.addEventListener('error', () => {
      this.broken = true
      for (const [id, resolve] of this.pending) {
        resolve({ id, ok: false, error: 'AI worker crashed' })
      }
      this.pending.clear()
    })
  }

  request(request: Omit<AiRequest, 'id'>): Promise<AiResponse> {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker.postMessage({ ...request, id })
    })
  }
}

let shared: AiWorkerClient | null = null

/** The app-wide AI worker, or null where web workers are unavailable (tests, old browsers). */
export function getAiWorker(): AiWorkerClient | null {
  if (shared?.broken) return null
  if (shared) return shared
  if (typeof Worker === 'undefined') return null
  try {
    shared = new AiWorkerClient(
      new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module', name: 'cards-ai' }),
    )
  } catch {
    return null
  }
  return shared
}

let agentCounter = 0

/**
 * An agent that decides in the AI worker and keeps the session's random sequence intact (the
 * worker continues from the session's RNG state and hands the new state back). Falls back to
 * thinking on the main thread whenever the worker is unavailable or fails.
 */
export function createWorkerAgent<V, A>(
  game: AnyGameDefinition,
  difficulty: Difficulty,
  client: AiWorkerClient | null = getAiWorker(),
): AiAgent<V, A> {
  let local: AiAgent<V, A> | undefined
  const localAgent = () => {
    local ??= game.createAgent!(difficulty) as unknown as AiAgent<V, A>
    return local
  }
  const agentKey = `${game.id}:${difficulty}:${Date.now().toString(36)}:${++agentCounter}`

  return {
    name: `${game.name} (${difficulty})`,
    async chooseAction(context) {
      if (!client || client.broken) return localAgent().chooseAction(context)
      const response = await client.request({
        agentKey,
        gameId: game.id,
        difficulty,
        playerId: context.playerId,
        view: context.view,
        legalActions: context.legalActions,
        rng: context.rng.state,
      })
      if (!response.ok) {
        console.warn('AI worker failed, deciding on the main thread:', response.error)
        return localAgent().chooseAction(context)
      }
      context.rng.state = response.rng
      return response.action as A
    },
  }
}
