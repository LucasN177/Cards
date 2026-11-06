import { createRandomAgent } from '@/ai'
import { parseCards, type PlayerInfo, Rng, simulateGame, type SuitedCard } from '@/engine'
import { choosePass, createHeartsAgent, determinize } from './ai'
import {
  DEFAULT_HEARTS_OPTIONS,
  type HeartsAction,
  heartsGame,
  type HeartsOptions,
  type HeartsState,
  type HeartsView,
  passTargetOf,
  playableCards,
  trickPoints,
} from '.'

const rules = heartsGame
const order = ['a', 'b', 'c', 'd']
const players: PlayerInfo[] = order.map((id) => ({ id, name: id, kind: 'ai' }))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]

/** A hand in the playing phase with the given cards (all other fields neutral). */
function playing(spec: {
  hands: Record<string, string>
  trick?: [string, string][]
  turn?: string
  tricksPlayed?: number
  taken?: Record<string, string>
  options?: Partial<HeartsOptions>
}): HeartsState {
  const empty = Object.fromEntries(order.map((p) => [p, []]))
  return {
    order,
    hands: Object.fromEntries(order.map((p) => [p, cards(spec.hands[p] ?? '')])),
    phase: 'playing',
    handNumber: 0,
    passes: Object.fromEntries(order.map((p) => [p, null])),
    received: empty,
    trick: (spec.trick ?? []).map(([player, code]) => ({ player, card: cards(code)[0]! })),
    lastTrick: null,
    turn: spec.turn ?? 'a',
    tricksPlayed: spec.tricksPlayed ?? 1,
    handTricks: [],
    taken: Object.fromEntries(order.map((p) => [p, cards(spec.taken?.[p] ?? '')])),
    scores: Object.fromEntries(order.map((p) => [p, 0])),
    handResults: [],
    moons: Object.fromEntries(order.map((p) => [p, 0])),
    events: [],
    options: { ...DEFAULT_HEARTS_OPTIONS, ...spec.options },
    rng: [1, 2, 3, 4],
  }
}

const ids = (list: readonly SuitedCard[]) => list.map((c) => c.id)

describe('setup and passing', () => {
  it('deals 13 cards each and starts with passing to the left', () => {
    const state = rules.setup({ players, options: DEFAULT_HEARTS_OPTIONS, seed: 1 })
    expect(order.map((p) => state.hands[p]!.length)).toEqual([13, 13, 13, 13])
    expect(state.phase).toBe('passing')
    expect(rules.playerView(state, 'a').passTarget).toBe('b')
  })

  it('rotates the direction: left, right, across, none', () => {
    expect(passTargetOf(order, 'a', 'left')).toBe('b')
    expect(passTargetOf(order, 'a', 'right')).toBe('d')
    expect(passTargetOf(order, 'a', 'across')).toBe('c')
    expect(passTargetOf(order, 'a', 'none')).toBeNull()
  })

  it('exchanges three cards once everybody has chosen, then the two of clubs leads', () => {
    let state = rules.setup({ players, options: DEFAULT_HEARTS_OPTIONS, seed: 2 })
    const passed: Record<string, string[]> = {}
    for (const p of order) {
      const pick = ids(state.hands[p]!.slice(0, 3))
      passed[p] = pick
      expect(rules.validateAction!(state, p, { type: 'pass', cardIds: pick })).toBeNull()
      state = rules.applyAction(state, p, { type: 'pass', cardIds: pick })
    }
    expect(state.phase).toBe('playing')
    expect(ids(state.hands['b']!)).toEqual(expect.arrayContaining(passed['a']!))
    expect(ids(rules.playerView(state, 'b').received)).toEqual(expect.arrayContaining(passed['a']!))
    expect(state.hands[state.turn]!.some((c) => c.id === '2C')).toBe(true)
    expect(rules.legalActions(state, state.turn)).toEqual([{ type: 'play', cardId: '2C' }])
  })

  it('rejects passing anything but exactly three own cards', () => {
    const state = rules.setup({ players, options: DEFAULT_HEARTS_OPTIONS, seed: 1 })
    const hand = ids(state.hands['a']!)
    expect(
      rules.validateAction!(state, 'a', { type: 'pass', cardIds: hand.slice(0, 2) }),
    ).not.toBeNull()
    expect(
      rules.validateAction!(state, 'a', { type: 'pass', cardIds: [hand[0]!, hand[0]!, hand[1]!] }),
    ).not.toBeNull()
    expect(
      rules.validateAction!(state, 'a', {
        type: 'pass',
        cardIds: ids(state.hands['b']!).slice(0, 3),
      }),
    ).not.toBeNull()
  })

  it('skips passing without the variant', () => {
    const state = rules.setup({
      players,
      options: { ...DEFAULT_HEARTS_OPTIONS, passing: false },
      seed: 1,
    })
    expect(state.phase).toBe('playing')
  })
})

describe('playing', () => {
  it('must follow suit', () => {
    const state = playing({ hands: { b: '5C KC 3H QS' }, trick: [['a', '9C']], turn: 'b' })
    expect(ids(playableCards(state, 'b'))).toEqual(['5C', 'KC'])
  })

  it('allows discarding hearts in the first trick', () => {
    const state = playing({
      hands: { b: '3H 8D' },
      trick: [['a', '2C']],
      turn: 'b',
      tricksPlayed: 0,
    })
    expect(ids(playableCards(state, 'b'))).toEqual(['3H', '8D'])
  })

  it('forces the queen of spades whenever the player cannot follow suit', () => {
    const state = playing({ hands: { b: '3H QS 8D' }, trick: [['a', '5C']], turn: 'b' })
    expect(ids(playableCards(state, 'b'))).toEqual(['QS'])
    const firstTrick = playing({
      hands: { b: '3H QS 8D' },
      trick: [['a', '2C']],
      turn: 'b',
      tricksPlayed: 0,
    })
    expect(ids(playableCards(firstTrick, 'b'))).toEqual(['QS'])
    // Following suit still comes first, also in spades.
    const spades = playing({ hands: { b: 'QS 4S 8D' }, trick: [['a', '5S']], turn: 'b' })
    expect(ids(playableCards(spades, 'b'))).toEqual(['QS', '4S'])
  })

  it('lets hearts be led at any time', () => {
    expect(ids(playableCards(playing({ hands: { a: '3H 5C' } }), 'a'))).toEqual(['3H', '5C'])
  })

  it('gives the trick to the highest card of the led suit', () => {
    let state = playing({ hands: { a: '9C 2D', b: 'KD 4D', c: '3H 5S', d: 'JC 7D' } })
    state = rules.applyAction(state, 'a', { type: 'play', cardId: '9C' })
    state = rules.applyAction(state, 'b', { type: 'play', cardId: 'KD' })
    state = rules.applyAction(state, 'c', { type: 'play', cardId: '3H' })
    state = rules.applyAction(state, 'd', { type: 'play', cardId: 'JC' })
    expect(state.lastTrick?.winner).toBe('d')
    expect(state.turn).toBe('d')
    expect(trickPoints(state.taken['d']!)).toBe(1)
  })
})

describe('scoring', () => {
  /** Plays the last trick so the hand gets scored. */
  function finishHand(taken: Record<string, string>, options?: Partial<HeartsOptions>) {
    const state = playing({
      hands: { a: '2C', b: '3C', c: '4C', d: '5C' },
      taken,
      tricksPlayed: 12,
      options: { targetScore: 0, ...options },
    })
    let next = state
    for (const p of order)
      next = rules.applyAction(next, p, { type: 'play', cardId: next.hands[p]![0]!.id })
    return next
  }
  const allHearts = '2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH'

  it('counts one point per heart and 13 for the queen of spades', () => {
    const end = finishHand({ a: '2H 3H', b: 'QS', c: '4H' })
    expect(end.phase).toBe('over')
    expect(end.handResults[0]).toEqual({ a: 2, b: 13, c: 1, d: 0 })
    expect(rules.result(end)).toMatchObject({ winners: ['d'], lowerScoreIsBetter: true })
  })

  it('shoots the moon: 26 for everybody else, or −26 for the shooter', () => {
    expect(finishHand({ a: `${allHearts} QS` }).handResults[0]).toEqual({
      a: 0,
      b: 26,
      c: 26,
      d: 26,
    })
    expect(finishHand({ a: `${allHearts} QS` }, { shootTheMoon: 'self' }).handResults[0]).toEqual({
      a: -26,
      b: 0,
      c: 0,
      d: 0,
    })
  })

  it('subtracts ten for the jack of diamonds with that variant', () => {
    expect(finishHand({ b: 'JD 2H' }, { jackOfDiamonds: true }).handResults[0]).toMatchObject({
      b: -9,
    })
    expect(finishHand({ b: 'JD 2H' }).handResults[0]).toMatchObject({ b: 1 })
  })

  it('deals a new hand until somebody reaches the target score', () => {
    const state = playing({
      hands: { a: '2C', b: '3C', c: '4C', d: '5C' },
      taken: { b: 'QS' },
      tricksPlayed: 12,
      options: { targetScore: 50 },
    })
    let next = state
    for (const p of order)
      next = rules.applyAction(next, p, { type: 'play', cardId: next.hands[p]![0]!.id })
    expect(next.phase).toBe('passing')
    expect(next.handNumber).toBe(1)
    expect(next.scores['b']).toBe(13)
    expect(order.every((p) => next.hands[p]!.length === 13)).toBe(true)
    expect(rules.playerView(next, 'a').passTarget).toBe('d') // second hand passes right
  })
})

describe('AI', () => {
  it('passes the queen of spades and high hearts', () => {
    expect(choosePass(cards('QS 3S AH KH 2C 4C 5D 6D 7D 8D 9C 10C JC'))).toEqual(['QS', 'AH', 'KH'])
  })

  it('builds hidden worlds that respect voids and passed cards', () => {
    const state = rules.setup({
      players,
      options: { ...DEFAULT_HEARTS_OPTIONS, passing: false },
      seed: 3,
    })
    const view: HeartsView = {
      ...rules.playerView(state, 'a'),
      voids: { a: [], b: ['spades'], c: [], d: [] },
      passedTo: { player: 'c', cards: cards('KH') },
    }
    const rng = Rng.fromSeed(1)
    for (let i = 0; i < 30; i++) {
      const world = determinize(view, 'a', rng)
      expect(order.map((p) => world.hands[p]!.length)).toEqual([13, 13, 13, 13])
      expect(world.hands['b']!.some((c) => c.suit === 'spades')).toBe(false)
      const all = order.flatMap((p) => ids(world.hands[p]!))
      expect(new Set(all).size).toBe(52)
    }
  })
})

describe('simulation', () => {
  const random = () => createRandomAgent<HeartsView, HeartsAction>()

  it(
    'plays whole games to the target score without breaking the rules',
    { timeout: 60_000 },
    async () => {
      for (let seed = 0; seed < 15; seed++) {
        const { result, session } = await simulateGame(heartsGame, {
          players,
          agents: Object.fromEntries(
            order.map((p, i) => [p, i % 2 ? random() : createHeartsAgent('intermediate')]),
          ),
          seed,
        })
        const state = session.state
        expect(Math.max(...order.map((p) => state.scores[p]!))).toBeGreaterThanOrEqual(100)
        // Every hand hands out exactly 26 points (or 78 after a moon shot).
        for (const hand of state.handResults) {
          expect([26, 78]).toContain(order.reduce((sum, p) => sum + hand[p]!, 0))
        }
        expect(result.winners.length).toBeGreaterThan(0)
      }
    },
  )

  async function averagePoints(make: () => ReturnType<typeof createHeartsAgent>, hands: number) {
    let points = 0
    for (let seed = 0; seed < hands; seed++) {
      const { session } = await simulateGame(heartsGame, {
        players,
        agents: {
          a: make(),
          b: createHeartsAgent('intermediate'),
          c: createHeartsAgent('intermediate'),
          d: createHeartsAgent('intermediate'),
        },
        options: { targetScore: 0 },
        seed: 1000 + seed,
      })
      points += session.state.scores['a']!
    }
    return points / hands
  }

  // A fair share is 6.5 points per hand; deterministic seeds keep these stable.
  it(
    'the beginner takes clearly more points than the intermediate AI',
    { timeout: 60_000 },
    async () => {
      expect(await averagePoints(() => createHeartsAgent('beginner'), 60)).toBeGreaterThan(8)
    },
  )

  it('the expert takes fewer points than the intermediate AI', { timeout: 120_000 }, async () => {
    expect(await averagePoints(() => createHeartsAgent('expert'), 30)).toBeLessThan(6.5)
  })
})

describe('32 cards and the Durchmarsch at 51', () => {
  const short = { deck: 'piquet32' as const }

  it('deals eight cards each from 7 to ace; the club 7 opens', () => {
    const state = rules.setup({
      players,
      options: { ...DEFAULT_HEARTS_OPTIONS, ...short, passing: false },
      seed: 4,
    })
    expect(order.map((p) => state.hands[p]!.length)).toEqual([8, 8, 8, 8])
    const all = order.flatMap((p) => state.hands[p]!)
    expect(all.every((c) => !['2', '3', '4', '5', '6'].includes(c.rank))).toBe(true)
    expect(ids(playableCards(state, state.turn))).toEqual(['7C'])
  })

  /** Plays the last of eight tricks so the hand gets scored. */
  function finishShortHand(taken: Record<string, string>, options: Partial<HeartsOptions> = {}) {
    let next = playing({
      hands: { a: '7C', b: '8C', c: '9C', d: '10C' },
      taken,
      tricksPlayed: 7,
      options: { targetScore: 0, ...short, ...options },
    })
    for (const p of order)
      next = rules.applyAction(next, p, { type: 'play', cardId: next.hands[p]![0]!.id })
    return next
  }
  const shortHearts = '7H 8H 9H 10H JH QH KH AH'

  it('counts the queen of spades as 8 with 32 cards', () => {
    expect(finishShortHand({ a: '7H', b: 'QS' }).handResults[0]).toEqual({ a: 1, b: 8, c: 0, d: 0 })
  })

  it('ends the hand after eight tricks; a Durchmarsch is worth 16', () => {
    expect(finishShortHand({ a: `${shortHearts} QS` }).handResults[0]).toEqual({
      a: 0,
      b: 16,
      c: 16,
      d: 16,
    })
  })

  it('gives 16 for a Durchmarsch when playing to 51 – with either deck', () => {
    expect(finishShortHand({ a: `${shortHearts} QS` }, { targetScore: 51 }).handResults[0]).toEqual(
      { a: 0, b: 16, c: 16, d: 16 },
    )
    const long = playing({
      hands: { a: '2C', b: '3C', c: '4C', d: '5C' },
      taken: { a: '2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH QS' },
      tricksPlayed: 12,
      options: { targetScore: 51, shootTheMoon: 'self' },
    })
    let next = long
    for (const p of order)
      next = rules.applyAction(next, p, { type: 'play', cardId: next.hands[p]![0]!.id })
    expect(next.handResults[0]).toEqual({ a: -16, b: 0, c: 0, d: 0 })
  })

  it('plays whole games with 32 cards to 51', async () => {
    for (let seed = 0; seed < 10; seed++) {
      const { session } = await simulateGame(heartsGame, {
        players,
        agents: Object.fromEntries(order.map((p) => [p, createHeartsAgent('intermediate')])),
        options: { ...short, targetScore: 51 },
        seed,
      })
      expect(session.state.phase).toBe('over')
      for (const hand of session.state.handResults)
        expect([16, 48]).toContain(order.reduce((sum, p) => sum + hand[p]!, 0))
    }
  })
})
