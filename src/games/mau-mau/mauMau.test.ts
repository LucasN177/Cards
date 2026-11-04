import { createRandomAgent } from '@/ai'
import {
  type AiAgent,
  parseCards,
  type PlayerInfo,
  Rng,
  simulateGame,
  type Suit,
  SUITS,
} from '@/engine'
import { createMauMauAgent, determinize, inferMissingSuits } from './ai'
import {
  DEFAULT_MAU_MAU_OPTIONS,
  handPoints,
  type MauMauAction,
  mauMauGame,
  type MauMauOptions,
  type MauMauState,
  type MauMauView,
} from '.'

const rules = mauMauGame
const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'abcdef'[i]!, name: 'abcdef'[i]!, kind: 'ai' }))

/** Builds a hand-crafted situation. Hands and piles are card codes, e.g. "7H QS". */
function situation(spec: {
  hands: Record<string, string>
  top: string
  stock?: string
  discardBelow?: string
  turn?: string
  options?: Partial<MauMauOptions>
  wish?: MauMauState['wish']
  pendingDraw?: number
}): MauMauState {
  const order = Object.keys(spec.hands)
  return {
    order,
    hands: Object.fromEntries(order.map((id) => [id, parseCards(spec.hands[id]!)])),
    stock: parseCards(spec.stock ?? ''),
    discard: [...parseCards(spec.discardBelow ?? ''), ...parseCards(spec.top)],
    turn: spec.turn ?? order[0]!,
    direction: 1,
    wish: spec.wish ?? null,
    pendingDraw: spec.pendingDraw ?? 0,
    drawnCardId: null,
    idleTurns: 0,
    winner: null,
    events: [],
    log: [],
    options: { ...DEFAULT_MAU_MAU_OPTIONS, ...spec.options },
    rng: [1, 2, 3, 4],
  }
}

const play = (cardId: string, wish?: Suit) =>
  wish ? { type: 'play' as const, cardId, wish } : { type: 'play' as const, cardId }
const legalCards = (state: MauMauState, player = state.turn) =>
  rules
    .legalActions(state, player)
    .flatMap((a) => (a.type === 'play' ? [a.cardId] : []))
    .filter((id, i, all) => all.indexOf(id) === i)
const totalCards = (s: MauMauState) =>
  s.stock.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0)

describe('setup', () => {
  it('deals a full 32-card deck', () => {
    const state = rules.setup({ players: players(4), options: DEFAULT_MAU_MAU_OPTIONS, seed: 1 })
    expect(totalCards(state)).toBe(32)
    expect(Object.values(state.hands).every((h) => h.length === 5)).toBe(true)
    expect(state.discard).toHaveLength(1)
    expect(state.order).toContain(state.turn)
  })

  it('reduces the hand size when many players would empty the deck', () => {
    const options = { ...DEFAULT_MAU_MAU_OPTIONS, handSize: 7 }
    const state = rules.setup({ players: players(6), options, seed: 1 })
    expect(state.hands['a']).toHaveLength(4)
    expect(state.stock.length).toBeGreaterThan(0)
  })
})

describe('playing cards', () => {
  it('allows matching suit or rank', () => {
    const state = situation({ hands: { a: '9H KS 9C 8D', b: '7C' }, top: 'KH' })
    expect(legalCards(state)).toEqual(['9H', 'KS'])
  })

  it('lets a jack go on anything and asks for a wish', () => {
    const state = situation({ hands: { a: 'JC 8D', b: '7C' }, top: 'KH' })
    const jackPlays = rules.legalActions(state, 'a').filter((a) => a.type === 'play')
    expect(jackPlays.map((a) => (a.type === 'play' ? a.wish : null))).toEqual([...SUITS])

    const next = rules.applyAction(state, 'a', play('JC', 'diamonds'))
    expect(next.wish).toBe('diamonds')
    expect(legalCards({ ...next, hands: { ...next.hands, b: parseCards('7D 7C') } })).toEqual([
      '7D',
    ])
  })

  it('forbids jack on jack unless the variant allows it', () => {
    const hands = { a: 'JC', b: '7C' }
    expect(legalCards(situation({ hands, top: 'JH' }))).toEqual([])
    expect(legalCards(situation({ hands, top: 'JH', options: { jackOnJack: true } }))).toEqual([
      'JC',
    ])
  })

  it('wins with the last card', () => {
    const state = situation({ hands: { a: '9H', b: '7C 10S' }, top: 'KH' })
    const end = rules.applyAction(state, 'a', play('9H'))
    expect(rules.isTerminal(end)).toBe(true)
    const result = rules.result(end)
    expect(result.winners).toEqual(['a'])
    expect(result.ranking).toEqual(['a', 'b'])
    expect(result.scores).toEqual({ a: 0, b: 17 })
  })
})

describe('special cards', () => {
  it('7: the next player draws two, or answers with a seven', () => {
    const state = situation({
      hands: { a: '7H 8C', b: '7S 9D', c: 'KD QD' },
      top: 'KH',
      stock: 'AC AD AH AS 10C 10D',
    })
    const afterSeven = rules.applyAction(state, 'a', play('7H'))
    expect(afterSeven.turn).toBe('b')
    expect(afterSeven.pendingDraw).toBe(2)
    expect(legalCards(afterSeven)).toEqual(['7S'])

    const stacked = rules.applyAction(afterSeven, 'b', play('7S'))
    expect(stacked.pendingDraw).toBe(4)
    expect(legalCards(stacked)).toEqual([])

    const drawn = rules.applyAction(stacked, 'c', { type: 'draw' })
    expect(drawn.hands['c']).toHaveLength(6)
    expect(drawn.pendingDraw).toBe(0)
    expect(drawn.turn).toBe('a')
  })

  it('7 without stacking cannot be answered', () => {
    const state = situation({
      hands: { a: '7H 8C', b: '7S 9D' },
      top: 'KH',
      stock: 'AC AD',
      options: { stackSevens: false },
    })
    const afterSeven = rules.applyAction(state, 'a', play('7H'))
    expect(rules.legalActions(afterSeven, 'b')).toEqual([{ type: 'draw' }])
  })

  it('8: skips the next player', () => {
    const three = situation({ hands: { a: '8H 9C', b: 'KD', c: 'QD' }, top: 'KH' })
    expect(rules.applyAction(three, 'a', play('8H')).turn).toBe('c')
    const two = situation({ hands: { a: '8H 9C', b: 'KD' }, top: 'KH' })
    expect(rules.applyAction(two, 'a', play('8H')).turn).toBe('a')
  })

  it('9: reverses the direction when enabled', () => {
    const hands = { a: '9H 9C', b: 'KD', c: 'QD' }
    expect(rules.applyAction(situation({ hands, top: 'KH' }), 'a', play('9H')).turn).toBe('b')
    const reversed = rules.applyAction(
      situation({ hands, top: 'KH', options: { nineReverses: true } }),
      'a',
      play('9H'),
    )
    expect(reversed.direction).toBe(-1)
    expect(reversed.turn).toBe('c')
  })
})

describe('drawing', () => {
  it('may play a drawn card that fits, or pass', () => {
    const state = situation({ hands: { a: '9C', b: 'KD' }, top: 'KH', stock: '10H AS' })
    const drawn = rules.applyAction(state, 'a', { type: 'draw' })
    expect(drawn.turn).toBe('a')
    expect(drawn.drawnCardId).toBe('10H')
    expect(rules.legalActions(drawn, 'a')).toEqual([play('10H'), { type: 'pass' }])
    expect(rules.applyAction(drawn, 'a', { type: 'pass' }).turn).toBe('b')
  })

  it('ends the turn when the drawn card does not fit', () => {
    const state = situation({ hands: { a: '9C', b: 'KD' }, top: 'KH', stock: '8S AS' })
    const drawn = rules.applyAction(state, 'a', { type: 'draw' })
    expect(drawn.turn).toBe('b')
    expect(drawn.drawnCardId).toBeNull()
  })

  it('reshuffles the discard pile into an empty stock', () => {
    const state = situation({ hands: { a: '9C', b: 'KD' }, top: 'KH', discardBelow: '8S 7D QC' })
    const drawn = rules.applyAction(state, 'a', { type: 'draw' })
    expect(drawn.discard.map((c) => c.id)).toEqual(['KH'])
    expect(drawn.stock).toHaveLength(2)
    expect(drawn.events[0]).toEqual({ type: 'reshuffled' })
    expect(totalCards(drawn)).toBe(totalCards(state))
  })

  it('does not offer drawing from an exhausted deck while a card can be played', () => {
    const state = situation({ hands: { a: '9H', b: 'KD' }, top: 'KH' })
    expect(rules.legalActions(state, 'a')).toEqual([play('9H')])
  })

  it('ends in a stalemate when nobody can play or draw', () => {
    let state = situation({ hands: { a: '9C 10S', b: 'QD' }, top: 'KH' })
    state = rules.applyAction(state, 'a', { type: 'draw' })
    expect(rules.isTerminal(state)).toBe(false)
    state = rules.applyAction(state, 'b', { type: 'draw' })
    expect(rules.isTerminal(state)).toBe(true)
    expect(rules.result(state).winners).toEqual(['b'])
  })
})

describe('view', () => {
  it('hides other hands and the stock', () => {
    const state = situation({ hands: { a: '9C', b: 'KD QD' }, top: 'KH', stock: 'AS' })
    const view = rules.playerView(state, 'a')
    expect(view.hand.map((c) => c.id)).toEqual(['9C'])
    expect(view.handSizes).toEqual({ a: 1, b: 2 })
    expect(view).not.toHaveProperty('hands')
    expect(view).not.toHaveProperty('stock')
  })
})

describe('simulation', () => {
  const random = () => createRandomAgent<MauMauView, MauMauAction>()

  it('finishes hundreds of random games with every variant without losing cards', async () => {
    for (let seed = 0; seed < 300; seed++) {
      const count = 2 + (seed % 5)
      const options: MauMauOptions = {
        handSize: 5 + (seed % 3),
        sevenDrawsTwo: seed % 2 === 0,
        stackSevens: seed % 3 !== 0,
        eightSkips: seed % 4 !== 0,
        nineReverses: seed % 5 === 0,
        jackOnJack: seed % 6 === 0,
      }
      const ps = players(count)
      const { session } = await simulateGame(mauMauGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p) => [p.id, random()])),
        options,
        seed,
        maxMoves: 5000,
      })
      expect(totalCards(session.state)).toBe(32)
    }
  })

  type Agent = AiAgent<MauMauView, MauMauAction>
  async function winRate(make: () => Agent, opponent: () => Agent, games: number) {
    let wins = 0
    for (let seed = 0; seed < games; seed++) {
      const { result } = await simulateGame(mauMauGame, {
        players: players(2),
        agents: { a: make(), b: opponent() },
        seed,
      })
      if (result.winners.includes('a')) wins++
    }
    return wins / games
  }

  // Win rates are deterministic for fixed seeds; thresholds leave room below the measured values.
  it('beginner AI beats random play', async () => {
    expect(await winRate(() => createMauMauAgent('beginner'), random, 200)).toBeGreaterThan(0.8)
  })

  it('intermediate AI beats the beginner', async () => {
    const rate = await winRate(
      () => createMauMauAgent('intermediate'),
      () => createMauMauAgent('beginner'),
      300,
    )
    expect(rate).toBeGreaterThan(0.55)
  })

  it('expert AI beats the beginner', { timeout: 30_000 }, async () => {
    const rate = await winRate(
      () => createMauMauAgent('expert', { budget: 300 }),
      () => createMauMauAgent('beginner'),
      80,
    )
    expect(rate).toBeGreaterThan(0.55)
  })

  it('scores remaining cards as penalty points', () => {
    expect(handPoints(parseCards('7H JC AS QD'))).toBe(7 + 20 + 11 + 3)
  })
})

describe('expert knowledge', () => {
  it('learns which suits a player is missing from public draws', () => {
    const missing = inferMissingSuits([
      { type: 'drew', player: 'b', count: 1, penalty: false, refused: 'hearts' },
      { type: 'drew', player: 'b', count: 1, penalty: false, refused: 'clubs' },
      { type: 'played', player: 'b', card: parseCards('9C')[0]! },
      { type: 'drew', player: 'c', count: 1, penalty: false, refused: 'spades' },
      { type: 'drew', player: 'c', count: 2, penalty: true },
    ])
    expect([...missing.get('b')!]).toEqual(['hearts'])
    expect(missing.get('c')!.size).toBe(0)
  })

  it('builds consistent hidden worlds from a player view', () => {
    const state = situation({
      hands: { a: '9C 10S', b: 'QD KD AD', c: '8H' },
      top: 'KH',
      stock: 'AS 7C 7D',
      discardBelow: '9H 10H',
    })
    const view = mauMauGame.playerView(
      {
        ...state,
        log: [
          { type: 'played', player: 'b', card: parseCards('10H')[0]! },
          { type: 'drew', player: 'b', count: 1, penalty: false, refused: 'spades' },
        ],
      },
      'a',
    )
    const rng = Rng.fromSeed(1)
    for (let i = 0; i < 50; i++) {
      const world = determinize(view, 'a', rng)
      expect(totalCards(world)).toBe(32)
      expect(
        new Set(
          Object.values(world.hands)
            .flat()
            .map((c) => c.id),
        ).size,
      ).toBe(6)
      expect(world.hands['a']!.map((c) => c.id)).toEqual(['9C', '10S'])
      expect(world.hands['b']).toHaveLength(3)
      expect(world.stock).toHaveLength(3)
      // Publicly played cards stay in the discard pile; b showed no spades.
      expect(world.discard.map((c) => c.id)).toContain('10H')
      expect(
        world.hands['b']!.some((c) => c.kind === 'suited' && c.suit === 'spades' && c.rank !== 'J'),
      ).toBe(false)
    }
  })
})
