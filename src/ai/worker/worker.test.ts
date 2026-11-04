import { type AiAgent, type PlayerInfo, Rng, simulateGame } from '@/engine'
import { registerGames } from '@/games'
import { mauMauGame, type MauMauAction, type MauMauView } from '@/games/mau-mau'
import { createMauMauAgent } from '@/games/mau-mau/ai'
import {
  type AiRequest,
  type AiResponse,
  handleAiRequest,
  resetWorkerAgentsForTests,
} from './protocol'
import { AiWorkerClient, createWorkerAgent, type WorkerLike } from './workerAgent'

registerGames()

/** In-thread stand-in for the real worker: same protocol, answered asynchronously. */
class FakeWorker implements WorkerLike {
  private onMessage: ((event: MessageEvent<AiResponse>) => void) | null = null
  private onError: ((event: Event) => void) | null = null
  requests = 0
  fail = false
  addEventListener(type: 'message' | 'error', listener: never) {
    if (type === 'message') this.onMessage = listener
    else this.onError = listener
  }
  postMessage(request: AiRequest) {
    this.requests++
    if (this.fail) {
      queueMicrotask(() =>
        this.onMessage?.({ data: { id: request.id, ok: false, error: 'boom' } } as never),
      )
      return
    }
    // Structured clone, like a real worker boundary.
    void handleAiRequest(structuredClone(request)).then((response) =>
      this.onMessage?.({ data: structuredClone(response) } as MessageEvent<AiResponse>),
    )
  }
  crash() {
    this.onError?.(new Event('error'))
  }
}

const players: PlayerInfo[] = [
  { id: 'a', name: 'a', kind: 'ai', difficulty: 'intermediate' },
  { id: 'b', name: 'b', kind: 'ai', difficulty: 'intermediate' },
]

afterEach(() => resetWorkerAgentsForTests())

describe('AI worker', () => {
  it('plays exactly the same game as agents on the main thread', async () => {
    for (const seed of [1, 2, 3]) {
      const local = await simulateGame(mauMauGame, {
        players,
        agents: { a: createMauMauAgent('intermediate'), b: createMauMauAgent('intermediate') },
        seed,
      })
      const client = new AiWorkerClient(new FakeWorker())
      const viaWorker = await simulateGame(mauMauGame, {
        players,
        agents: {
          a: createWorkerAgent<MauMauView, MauMauAction>(mauMauGame, 'intermediate', client),
          b: createWorkerAgent<MauMauView, MauMauAction>(mauMauGame, 'intermediate', client),
        },
        seed,
      })
      expect(viaWorker.session.toSaved().actions).toEqual(local.session.toSaved().actions)
    }
  })

  it('hands the advanced random state back to the session', async () => {
    const state = mauMauGame.setup({ players, options: mauMauGame.defaultOptions, seed: 5 })
    const view = mauMauGame.playerView(state, state.turn)
    const legalActions = mauMauGame.legalActions(state, state.turn)
    const rng = Rng.fromSeed(9)
    const expected = Rng.fromSeed(9)
    await createMauMauAgent('intermediate').chooseAction({
      playerId: 'a',
      view,
      legalActions,
      rng: expected,
    })

    const agent: AiAgent<MauMauView, MauMauAction> = createWorkerAgent(
      mauMauGame,
      'intermediate',
      new AiWorkerClient(new FakeWorker()),
    )
    await agent.chooseAction({ playerId: 'a', view, legalActions, rng })
    expect(rng.state).toEqual(expected.state)
  })

  it('falls back to the main thread when the worker fails or crashes', async () => {
    const worker = new FakeWorker()
    const client = new AiWorkerClient(worker)
    const agent = createWorkerAgent<MauMauView, MauMauAction>(mauMauGame, 'beginner', client)
    const state = mauMauGame.setup({ players, options: mauMauGame.defaultOptions, seed: 4 })
    const view = mauMauGame.playerView(state, state.turn)
    const legalActions = mauMauGame.legalActions(state, state.turn)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    worker.fail = true
    const action = await agent.chooseAction({
      playerId: state.turn,
      view,
      legalActions,
      rng: Rng.fromSeed(1),
    })
    expect(legalActions).toContainEqual(action)
    expect(warn).toHaveBeenCalled()

    worker.fail = false
    worker.crash()
    expect(client.broken).toBe(true)
    const before = worker.requests
    await agent.chooseAction({ playerId: state.turn, view, legalActions, rng: Rng.fromSeed(1) })
    expect(worker.requests).toBe(before)
  })

  it('thinks on the main thread when there is no worker at all', async () => {
    const agent = createWorkerAgent<MauMauView, MauMauAction>(mauMauGame, 'beginner', null)
    const state = mauMauGame.setup({ players, options: mauMauGame.defaultOptions, seed: 2 })
    const legalActions = mauMauGame.legalActions(state, state.turn)
    const action = await agent.chooseAction({
      playerId: state.turn,
      view: mauMauGame.playerView(state, state.turn),
      legalActions,
      rng: Rng.fromSeed(3),
    })
    expect(legalActions).toContainEqual(action)
  })

  it('reports unknown games as an error response', async () => {
    const response = await handleAiRequest({
      id: 7,
      agentKey: 'x',
      gameId: 'nope',
      difficulty: 'beginner',
      playerId: 'a',
      view: {},
      legalActions: [],
      rng: [1, 2, 3, 4],
    })
    expect(response).toMatchObject({ id: 7, ok: false })
  })
})
