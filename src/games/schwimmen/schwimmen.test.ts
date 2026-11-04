import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createSchwimmenAgent } from './ai'
import {
  DEFAULT_SCHWIMMEN_OPTIONS,
  handValue,
  type SchwimmenAction,
  schwimmenGame,
  type SchwimmenOptions,
  type SchwimmenState,
} from './index'

const rules = schwimmenGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const players: PlayerInfo[] = [
  { id: 'a', name: 'A', kind: 'human' },
  { id: 'b', name: 'B', kind: 'ai' },
  { id: 'c', name: 'C', kind: 'ai' },
]

function table(
  hands: Record<string, string>,
  middle: string,
  options: Partial<SchwimmenOptions> = {},
  stock = '7H 8H 9H 7S 8S 9S',
): SchwimmenState {
  const state = rules.setup({
    players,
    options: { ...DEFAULT_SCHWIMMEN_OPTIONS, ...options },
    seed: 1,
  })
  return {
    ...state,
    hands: Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)])),
    middle: cards(middle),
    stock: cards(stock),
    turn: 'a',
  }
}

const apply = (state: SchwimmenState, ...moves: [string, SchwimmenAction][]) =>
  moves.reduce((s, [p, a]) => rules.applyAction(s, p, a), state)

describe('hand values', () => {
  it('adds up the best suit and counts three of a kind as 30½', () => {
    expect(handValue(cards('AH KH 7S'))).toBe(21)
    expect(handValue(cards('AH KH QH'))).toBe(31)
    expect(handValue(cards('7H 8S 9C'))).toBe(9)
    expect(handValue(cards('7H 7S 7C'))).toBe(30.5)
    expect(handValue(cards('AH AS AC'))).toBe(30.5)
  })
})

describe('moves', () => {
  const hands = { a: '7H 8S 9C', b: '10H JH 7C', c: 'QS KS 8D' }

  it('swaps one card with the middle', () => {
    const s = apply(table(hands, 'AH KD QC'), [
      'a',
      { type: 'swap', handCardId: '8S', middleCardId: 'AH' },
    ])
    expect(s.hands['a']!.map((c) => c.id)).toEqual(['7H', 'AH', '9C'])
    expect(s.middle.map((c) => c.id)).toEqual(['8S', 'KD', 'QC'])
    expect(s.turn).toBe('b')
  })

  it('swaps all three cards', () => {
    const s = apply(table(hands, 'AH KD QC'), ['a', { type: 'swapAll' }])
    expect(s.hands['a']!.map((c) => c.id)).toEqual(['AH', 'KD', 'QC'])
    expect(s.middle.map((c) => c.id)).toEqual(['7H', '8S', '9C'])
  })

  it('puts three new cards in the middle when everybody passed', () => {
    const s = apply(
      table(hands, 'AH KD QC'),
      ['a', { type: 'pass' }],
      ['b', { type: 'pass' }],
      ['c', { type: 'pass' }],
    )
    expect(s.middle.map((c) => c.id)).toEqual(['7H', '8H', '9H'])
    expect(s.stock).toHaveLength(3)
    expect(s.events.some((e) => e.type === 'newMiddle')).toBe(true)
  })

  it('gives every other player one more turn after a knock, then the lowest loses a life', () => {
    let s = apply(table(hands, 'AD KD QD'), ['a', { type: 'knock' }])
    expect(rules.legalActions(s, 'b').some((a) => a.type === 'knock')).toBe(false)
    s = apply(s, ['b', { type: 'pass' }], ['c', { type: 'pass' }])
    // a has 9, b 21, c 21: a loses a life and a new round is dealt.
    expect(s.lastRound).toMatchObject({ losers: ['a'], round: 1 })
    expect(s.lives['a']).toBe(2)
    expect(s.round).toBe(2)
    expect(s.hands['a']).toHaveLength(3)
  })

  it('ends the round at once with 31', () => {
    const s = apply(table(hands, 'AH KD QC'), [
      'b',
      { type: 'swap', handCardId: '7C', middleCardId: 'AH' },
    ])
    expect(s.lastRound).toMatchObject({ fireBy: 'b', losers: ['a'] })
  })

  it('can make everybody else lose a life on 31', () => {
    const s = apply(table(hands, 'AH KD QC', { fire: 'allOthers' }), [
      'b',
      { type: 'swap', handCardId: '7C', middleCardId: 'AH' },
    ])
    expect(s.lastRound!.losers).toEqual(['a', 'c'])
    expect(s.lives).toMatchObject({ a: 2, b: 3, c: 2 })
  })
})

describe('lives and swimming', () => {
  it('swims with no lives left and drops out on the next loss', () => {
    const base = table({ a: '7H 8S 9C', b: '10H JH 7C', c: 'QS KS 8D' }, 'AD KD QD')
    const knockRound = (s: SchwimmenState) =>
      apply(
        { ...s, turn: 'b', hands: base.hands, middle: base.middle, stock: base.stock },
        ['b', { type: 'knock' }],
        ['c', { type: 'pass' }],
        ['a', { type: 'pass' }],
      )
    let s: SchwimmenState = { ...base, lives: { a: 1, b: 3, c: 3 } }
    s = knockRound(s)
    expect(s.swimming['a']).toBe(true)
    expect(s.alive).toContain('a')
    s = knockRound(s)
    // The only human is out, so the game ends.
    expect(s.alive).not.toContain('a')
    expect(s.phase).toBe('over')
    expect(rules.result(s).ranking!.at(-1)).toBe('a')
  })

  it('drowns nobody when all remaining swimmers would drop out at once', () => {
    const base = table({ a: '7H 8S 9C', b: '7D 8C 9S', c: '7S 8D 9H' }, 'AD KD QD')
    const s = apply(
      { ...base, swimming: { a: true, b: true, c: true }, lives: { a: 0, b: 0, c: 0 } },
      ['a', { type: 'knock' }],
      ['b', { type: 'pass' }],
      ['c', { type: 'pass' }],
    )
    expect(s.alive).toEqual(['a', 'b', 'c'])
    expect(s.phase).toBe('playing')
  })
})

describe('simulation', () => {
  it('plays full games with all AI levels to the end', async () => {
    for (let seed = 0; seed < 60; seed++) {
      const n = 2 + (seed % 5)
      const levels = ['beginner', 'intermediate', 'expert'] as const
      const ps: PlayerInfo[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        kind: 'ai',
      }))
      const { session, result } = await simulateGame(schwimmenGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createSchwimmenAgent(levels[i % 3]!)])),
        options: { lives: seed % 2 ? 2 : 3, fire: seed % 3 ? 'lowest' : 'allOthers' },
        seed,
        maxMoves: 20_000,
      })
      expect(session.state.alive.length).toBeLessThanOrEqual(1)
      expect(result.ranking).toHaveLength(n)
    }
  })
})
