import { parseCards, type PlayerInfo, Rng, simulateGame, type SuitedCard } from '@/engine'
import { createHoldemAgent, equity, preflopStrength } from './ai'
import {
  blindsFor,
  DEFAULT_HOLDEM_OPTIONS,
  evaluate,
  type HoldemAction,
  holdemGame,
  type HoldemState,
  handName,
} from './index'

const rules = holdemGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const infos = (ids: string[]): PlayerInfo[] => ids.map((id) => ({ id, name: id, kind: 'ai' }))
const name = (codes: string) => handName(evaluate(cards(codes)))

/** Applies one move by whoever is on turn. */
const act = (s: HoldemState, action: HoldemAction) => apply(s, [s.turn, action])

const apply = (s: HoldemState, ...moves: [string, HoldemAction][]) =>
  moves.reduce((acc, [p, a]) => {
    const error = rules.validateAction!(acc, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(acc, p, a)
  }, s)

/** A fresh game where we choose the hole cards and the deck (dealt from the end). */
function rigged(
  ids: string[],
  hole: Record<string, string>,
  board: string,
  stacks?: Record<string, number>,
) {
  const s = rules.setup({
    players: infos(ids),
    options: { ...DEFAULT_HOLDEM_OPTIONS, handLimit: 30 },
    seed: 1,
  })
  // Deck: board cards with burns in between, popped from the end.
  const b = cards(board)
  const burn = cards('2S')
  const deck = [b[4]!, burn[0]!, b[3]!, burn[0]!, b[2]!, b[1]!, b[0]!, burn[0]!].filter(Boolean)
  return {
    ...s,
    hole: Object.fromEntries(Object.entries(hole).map(([p, h]) => [p, cards(h)])),
    deck,
    ...(stacks ? { stacks: { ...s.stacks, ...stacks } } : {}),
  } as HoldemState
}

describe('hand ranking', () => {
  it('names and orders the categories', () => {
    expect(name('AS KS QS JS 10S 2D 3C')).toBe('Royal Flush')
    expect(name('9S 8S 7S 6S 5S AD AC')).toBe('Straight Flush')
    expect(name('7C 7D 7H 7S KD 2C 3H')).toBe('Vierling')
    expect(name('7C 7D 7H KS KD 2C 3H')).toBe('Full House')
    expect(name('2H 9H JH KH AH 3C 4D')).toBe('Flush')
    expect(name('AS 2D 3C 4H 5S 9D KC')).toBe('Straße')
    expect(name('7C 7D 7H AS KD 2C 3H')).toBe('Drilling')
    expect(name('7C 7D KH KS 2D 3C 4H')).toBe('Zwei Paare')
    expect(name('7C 7D AH KS 2D 3C 9H')).toBe('Ein Paar')
    expect(name('7C 9D AH KS 2D 3C 4H')).toBe('Höchste Karte')
  })

  it('compares kickers, the wheel and the best five of seven', () => {
    const score = (c: string) => evaluate(cards(c))
    expect(score('AS AD KC 9H 4D 3C 2S')).toBeGreaterThan(score('AS AD QC JH 4D 3C 2S'))
    // The wheel (A-2-3-4-5) is the lowest straight.
    expect(score('6S 2D 3C 4H 5S 9D KC')).toBeGreaterThan(score('AS 2D 3C 4H 5S 9D KC'))
    // Two trips make a full house with the higher one.
    expect(name('7C 7D 7H KS KD KC 3H')).toBe('Full House')
    expect(score('KS KD KC 7C 7D 7H 3H')).toBeGreaterThan(score('7C 7D 7H QS QD 2C 3H'))
    // Three pairs: only the best two count, the third gives the kicker.
    expect(score('AS AD KC KH QD QC 2S')).toBe(score('AS AD KC KH QD 3C 2S'))
  })
})

describe('betting', () => {
  it('posts the blinds; the player after the big blind starts', () => {
    const s = rules.setup({
      players: infos(['a', 'b', 'c', 'd']),
      options: DEFAULT_HOLDEM_OPTIONS,
      seed: 2,
    })
    const order = s.order
    const i = order.indexOf(s.button)
    const sb = order[(i + 1) % 4]!
    const bb = order[(i + 2) % 4]!
    expect(s.bets[sb]).toBe(10)
    expect(s.bets[bb]).toBe(20)
    expect(s.turn).toBe(order[(i + 3) % 4])
    expect(rules.legalActions(s, s.turn)).toContainEqual({ type: 'fold' })
  })

  it('heads-up: the button is the small blind and acts first before the flop', () => {
    const s = rules.setup({ players: infos(['a', 'b']), options: DEFAULT_HOLDEM_OPTIONS, seed: 3 })
    expect(s.bets[s.button]).toBe(10)
    expect(s.turn).toBe(s.button)
  })

  it('gives the big blind the option and enforces the minimum raise', () => {
    let s = rules.setup({
      players: infos(['a', 'b', 'c']),
      options: DEFAULT_HOLDEM_OPTIONS,
      seed: 4,
    })
    const first = s.turn
    expect(rules.validateAction!(s, first, { type: 'raise', to: 30 })).toMatch(/mindestens 40/)
    s = apply(s, [first, { type: 'call' }])
    s = apply(s, [s.turn, { type: 'call' }])
    // The big blind may still raise although everybody only called.
    expect(rules.legalActions(s, s.turn).some((a) => a.type === 'raise')).toBe(true)
    s = apply(s, [s.turn, { type: 'raise', to: 60 }])
    expect(s.lastRaise).toBe(40)
    expect(rules.validateAction!(s, s.turn, { type: 'raise', to: 90 })).toMatch(/mindestens 100/)
  })

  it('gives the pot to the last player when everybody else folds', () => {
    let s = rules.setup({
      players: infos(['a', 'b', 'c']),
      options: { ...DEFAULT_HOLDEM_OPTIONS, handLimit: 30 },
      seed: 5,
    })
    s = act(act(s, { type: 'fold' }), { type: 'fold' })
    const result = s.results[0]!
    expect(Object.keys(result.shown)).toHaveLength(0)
    // Only the blinds changed hands.
    expect(Object.values(result.net).reduce((a, b) => a + b, 0)).toBe(0)
    expect(Math.max(...Object.values(result.net))).toBe(10)
  })

  it('splits the pot on equal hands', () => {
    // Both play the board (a straight).
    let s = rigged(['a', 'b'], { a: '2C 3D', b: '2D 3C' }, '10S JD QC KH AS')
    s = act(act(s, { type: 'call' }), { type: 'check' })
    for (let i = 0; i < 3; i++) s = act(act(s, { type: 'check' }), { type: 'check' })
    const result = s.results[0]!
    expect(result.pots[0]!.winners).toHaveLength(2)
    expect(result.net).toEqual({ a: 0, b: 0 })
  })

  it('builds side pots for a short all-in', () => {
    // c is all-in for 100 with the best hand; a and b keep betting.
    let s = rigged(['a', 'b', 'c'], { a: 'KC KD', b: 'QC QD', c: 'AC AD' }, '2H 7S 9D 4C 3S', {
      a: 1000,
      b: 1000,
      c: 100,
    })
    const all = (p: string) => s.bets[p]! + s.stacks[p]!
    // The blinds were posted before the stacks were set: c has 100 plus any blind.
    const cTotal = s.contributed['c']! + 100
    for (let step = 0; step < 20 && s.results.length === 0; step++) {
      const p = s.turn
      const raise = rules.legalActions(s, p).find((a) => a.type === 'raise' && a.to === all(p))
      s = apply(s, [p, raise ?? (s.currentBet > s.bets[p]! ? { type: 'call' } : { type: 'check' })])
    }
    const result = s.results[0]!
    // Main pot (three times c's chips) to c's aces, the side pot to a's kings.
    expect(result.pots[0]).toMatchObject({ amount: 3 * cTotal, winners: ['c'] })
    expect(result.pots[1]!.winners).toEqual(['a'])
    // b put in a few chips more than a (blinds) and gets only those back.
    expect(result.net['b']).toBeLessThan(-900)
    expect(Object.values(result.net).reduce((x, y) => x + y, 0)).toBe(0)
  })
})

describe('game flow', () => {
  it('raises the blinds by half every ten hands', () => {
    expect([0, 9, 10, 20, 30].map((h) => blindsFor(h, DEFAULT_HOLDEM_OPTIONS).big)).toEqual([
      20, 20, 30, 50, 70,
    ])
    expect(blindsFor(30, { ...DEFAULT_HOLDEM_OPTIONS, risingBlinds: false }).big).toBe(20)
  })

  it('ends when the human is out of chips', () => {
    const players: PlayerInfo[] = [
      { id: 'me', name: 'Ich', kind: 'human' },
      { id: 'x', name: 'x', kind: 'ai' },
      { id: 'y', name: 'y', kind: 'ai' },
    ]
    let s = rules.setup({ players, options: DEFAULT_HOLDEM_OPTIONS, seed: 9 })
    // "me" goes all-in every time and is out sooner or later (or wins everything).
    for (let i = 0; i < 5000 && s.phase !== 'over'; i++) {
      const p = s.turn
      const actions = rules.legalActions(s, p)
      const allIn = actions.filter((a) => a.type === 'raise').at(-1)
      const action =
        p === 'me'
          ? (allIn ?? actions.find((a) => a.type === 'call') ?? actions[0]!)
          : actions.find((a) => a.type === 'call' || a.type === 'check')!
      s = rules.applyAction(s, p, action)
    }
    expect(s.phase).toBe('over')
    expect(s.stacks['me'] === 0 || s.order.filter((p) => s.stacks[p]! > 0).length === 1).toBe(true)
  })
})

describe('AI', () => {
  it('estimates equity and starting hands sensibly', () => {
    const rng = Rng.fromSeed(1)
    expect(equity(cards('AS AD'), [], 1, 600, rng)).toBeGreaterThan(0.8)
    expect(equity(cards('7C 2D'), [], 1, 600, rng)).toBeLessThan(0.4)
    expect(preflopStrength(cards('AS AD'))).toBeGreaterThan(preflopStrength(cards('KS QS')))
    expect(preflopStrength(cards('KS QS'))).toBeGreaterThan(preflopStrength(cards('7C 2D')))
  })

  it('plays whole games without losing chips', { timeout: 60_000 }, async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (const n of [2, 4, 9]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`)
      const { session } = await simulateGame(rules, {
        players: infos(ids),
        agents: Object.fromEntries(ids.map((p, i) => [p, createHoldemAgent(levels[i % 3]!)])),
        options: { ...DEFAULT_HOLDEM_OPTIONS, handLimit: 30 },
        seed: n,
        maxMoves: 20_000,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      expect(Object.values(s.stacks).reduce((a, b) => a + b, 0)).toBe(n * 1000)
    }
  })

  it(
    'levels: the expert wins chips from intermediates, the beginner loses',
    { timeout: 120_000 },
    async () => {
      const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
      const net = async (level: 'beginner' | 'expert') => {
        let total = 0
        for (let seed = 0; seed < 40; seed++) {
          const { session } = await simulateGame(rules, {
            players: infos(ids),
            agents: Object.fromEntries(
              ids.map((p, i) => [p, createHoldemAgent(i === 0 ? level : 'intermediate')]),
            ),
            options: { ...DEFAULT_HOLDEM_OPTIONS, handLimit: 30 },
            seed: 4000 + seed,
            maxMoves: 20_000,
          })
          total += session.state.stacks['p0']! - 1000
        }
        return total / 40
      }
      expect(await net('beginner')).toBeLessThan(-150)
      expect(await net('expert')).toBeGreaterThan(50)
    },
  )
})
