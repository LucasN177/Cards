import { createRandomAgent } from '@/ai'
import { highCardGame, type HighCardAction, type HighCardView } from '../testing/highCardGame'
import type { AiAgent } from './agent'
import { GameOverError, IllegalActionError, NotYourTurnError } from './errors'
import { GameSession } from './session'
import type { PlayerInfo } from './types'

const human: PlayerInfo = { id: 'me', name: 'Me', kind: 'human' }
const bot = (id: string): PlayerInfo => ({ id, name: id, kind: 'ai', difficulty: 'beginner' })
const random = () => createRandomAgent<HighCardView, HighCardAction>()

function createSession(seed = 1) {
  return new GameSession(highCardGame, {
    players: [human, bot('b1'), bot('b2')],
    seed,
    agents: { b1: random(), b2: random() },
  })
}

const firstLegal = (session: ReturnType<typeof createSession>, player = 'me') =>
  session.legalActions(player)[0]!

describe('GameSession', () => {
  it('validates player count, unique ids and missing agents', () => {
    expect(() => new GameSession(highCardGame, { players: [human] })).toThrow(/2–4 players/)
    expect(() => new GameSession(highCardGame, { players: [human, human] })).toThrow(/unique/)
    expect(() => new GameSession(highCardGame, { players: [human, bot('b1')] })).toThrow(
      /No AI agent/,
    )
  })

  it('merges options with the defaults', () => {
    const session = new GameSession(highCardGame, {
      players: [human, { ...human, id: 'you' }],
      options: { handSize: 5 },
    })
    expect(session.options.handSize).toBe(5)
    expect(session.view('me').hand).toHaveLength(5)
  })

  it('deals the same cards for the same seed', () => {
    expect(createSession(5).state).toEqual(createSession(5).state)
    expect(createSession(5).state).not.toEqual(createSession(6).state)
  })

  it('only shows a player their own hand', () => {
    const view = createSession().view('me')
    expect(view.hand).toHaveLength(3)
    expect(view).not.toHaveProperty('hands')
    expect(view.handSizes).toEqual({ me: 3, b1: 3, b2: 3 })
  })

  it('enforces turn order and legal actions', () => {
    const session = createSession()
    expect(session.legalActions('b1')).toEqual([])
    expect(() => session.dispatch('b1', firstLegal(session, 'me'))).toThrow(NotYourTurnError)
    expect(() => session.dispatch('me', { type: 'play', cardId: 'nope' })).toThrow(
      IllegalActionError,
    )
    session.dispatch('me', firstLegal(session))
    expect(session.currentPlayer).toBe('b1')
    expect(session.isAiTurn).toBe(true)
  })

  it('lets AI players move until a human is due', async () => {
    const session = createSession()
    session.dispatch('me', firstLegal(session))
    const moves = await session.runAi()
    expect(moves).toBeGreaterThan(0)
    expect(session.isOver || session.currentPlayer === 'me').toBe(true)
  })

  it('plays a whole game to a result and rejects moves afterwards', async () => {
    const session = createSession(3)
    while (!session.isOver) {
      if (session.currentPlayer === 'me') session.dispatch('me', firstLegal(session))
      else await session.runAi()
    }
    const result = session.result!
    expect(Object.values(result.scores).reduce((a, b) => a + b)).toBe(3)
    expect(result.winners.length).toBeGreaterThan(0)
    expect(session.currentPlayer).toBeNull()
    expect(() => session.dispatch('me', { type: 'play', cardId: 'x' })).toThrow(GameOverError)
  })

  it('undoes the last human move including the AI replies', async () => {
    const session = createSession()
    const initial = session.state
    expect(session.canUndo).toBe(false)

    session.dispatch('me', firstLegal(session))
    await session.runAi()
    expect(session.history.length).toBeGreaterThan(1)

    expect(session.undo()).toBe(true)
    expect(session.state).toBe(initial)
    expect(session.history).toHaveLength(0)
    expect(session.undo()).toBe(false)
  })

  it('refuses undo when the game forbids it', () => {
    const session = new GameSession(
      { ...highCardGame, allowUndo: false },
      { players: [human, { ...human, id: 'you' }], seed: 1 },
    )
    session.dispatch('me', firstLegal(session))
    expect(session.canUndo).toBe(false)
    expect(session.undo()).toBe(false)
  })

  it('discards an AI move when the game changed while it was thinking', async () => {
    let release!: () => void
    const slow: AiAgent<HighCardView, HighCardAction> = {
      name: 'slow',
      chooseAction: async ({ legalActions }) => {
        await new Promise<void>((resolve) => (release = resolve))
        return legalActions[0]!
      },
    }
    const session = new GameSession(highCardGame, {
      players: [human, bot('b1')],
      seed: 1,
      agents: { b1: slow },
    })
    session.dispatch('me', firstLegal(session))
    const pending = session.playAiTurn()
    session.undo()
    release()
    expect(await pending).toBeNull()
    expect(session.currentPlayer).toBe('me')
  })

  it('saves and restores a game by replaying its moves', async () => {
    const session = createSession(9)
    session.dispatch('me', firstLegal(session))
    await session.runAi()

    const saved = JSON.parse(JSON.stringify(session.toSaved()))
    const restored = GameSession.restore(highCardGame, saved, { b1: random(), b2: random() })
    expect(restored.state).toEqual(session.state)
    expect(restored.history).toHaveLength(session.history.length)
    expect(() => GameSession.restore({ ...highCardGame, id: 'other' }, saved)).toThrow(/belongs to/)
  })

  it('notifies subscribers on every change', async () => {
    const session = createSession()
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)
    const version = session.version

    session.dispatch('me', firstLegal(session))
    await session.playAiTurn()
    session.undo()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(session.version).toBe(version + 3)

    unsubscribe()
    session.dispatch('me', firstLegal(session))
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
