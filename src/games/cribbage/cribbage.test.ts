import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createCribbageAgent } from './ai'
import {
  type CribbageAction,
  cribbageGame,
  type CribbageState,
  DEFAULT_CRIBBAGE_OPTIONS,
  peggingItems,
  scoreHand,
  totalOf,
} from './index'

const rules = cribbageGame
const cards = (codes: string) => (codes ? (parseCards(codes) as SuitedCard[]) : [])
const card = (code: string) => cards(code)[0]!
const infos = (ids: string[]): PlayerInfo[] => ids.map((id) => ({ id, name: id, kind: 'ai' }))
const show = (hand: string, starter: string, crib = false) =>
  totalOf(scoreHand(cards(hand), card(starter), crib))
const peg = (codes: string) => totalOf(peggingItems(cards(codes)))

const apply = (s: CribbageState, ...moves: [string, CribbageAction][]) =>
  moves.reduce((acc, [p, a]) => {
    const error = rules.validateAction!(acc, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(acc, p, a)
  }, s)

/** Two players in the play: `a` deals, so `b` leads. */
function playing(spec: {
  a: string
  b: string
  starter?: string
  scores?: [number, number]
}): CribbageState {
  const s = rules.setup({ players: infos(['a', 'b']), options: DEFAULT_CRIBBAGE_OPTIONS, seed: 1 })
  return {
    ...s,
    dealer: 'a',
    hands: { a: cards(spec.a), b: cards(spec.b) },
    kept: { a: cards(spec.a), b: cards(spec.b) },
    crib: cards('2C 3C 9D 10D'),
    starter: card(spec.starter ?? 'KD'),
    phase: 'play',
    turn: 'b',
    scores: spec.scores ?? [0, 0],
  }
}

describe('counting the show', () => {
  it('counts fifteens, pairs and runs', () => {
    // 4-5-6-6 with a king: three fifteens, a pair and a double run.
    expect(show('4C 5D 6H 6S', 'KC')).toBe(14)
    expect(show('5H 5C 5S JD', '5D')).toBe(29)
    expect(show('AC 3D 7H 9S', 'QC')).toBe(0)
  })

  it('counts a four-card flush in the hand but only a five-card flush in the crib', () => {
    expect(show('2H 4H 8H 10H', 'KC')).toBe(4)
    expect(show('2H 4H 8H 10H', 'KC', true)).toBe(0)
    expect(show('2H 4H 8H 10H', 'KH', true)).toBe(5)
  })

  it('counts nobs: the jack of the starter suit', () => {
    expect(scoreHand(cards('JD AC 3S 7H'), card('9D')).find((i) => i.kind === 'nobs')).toBeDefined()
  })
})

describe('pegging', () => {
  it('scores fifteen, thirty-one, pairs and runs', () => {
    expect(peg('5C KD')).toBe(2)
    expect(peg('10C 10D JH')).toBe(0)
    expect(peg('7C 7D')).toBe(2)
    expect(peg('7C 7D 7H')).toBe(6)
    expect(peg('3C 5D 4H')).toBe(3)
    expect(peg('3C 5D 4H 6S')).toBe(4)
    expect(peg('KC QD 8H 3S')).toBe(2)
    expect(peg('9C 9D 9H 4C')).toBe(2)
  })

  it('gives a go to the last player when nobody can play, then starts a new series', () => {
    // b: 10, a: K (20), b: 9 (29) – a cannot play: go, b has no card left that fits either.
    let s = playing({ a: 'KC 2D 3D 4D', b: '10C 9C QH KH' })
    s = apply(s, ['b', { type: 'play', cardId: '10C' }], ['a', { type: 'play', cardId: 'KC' }])
    s = apply(s, ['b', { type: 'play', cardId: '9C' }])
    // a may still play the 2 (31): 31 scores two.
    s = apply(s, ['a', { type: 'play', cardId: '2D' }])
    expect(s.scores).toEqual([2, 0])
    expect(s.count).toBe(0)
    // After 31 the next player leads.
    expect(s.turn).toBe('b')
  })

  it('scores one for the go and one for the last card', () => {
    let s = playing({ a: 'KC QC', b: 'JD 10D' })
    s = apply(s, ['b', { type: 'play', cardId: 'JD' }], ['a', { type: 'play', cardId: 'KC' }])
    s = apply(s, ['b', { type: 'play', cardId: '10D' }])
    // 30: a cannot play – go for b, new series led by a.
    expect(s.scores).toEqual([0, 1])
    expect(s.turn).toBe('a')
    s = apply(s, ['a', { type: 'play', cardId: 'QC' }])
    // a played the last card (+1), then the show is counted and a new hand is dealt.
    expect(s.results).toHaveLength(1)
    expect(s.results[0]!.pegging).toEqual([1, 1])
    expect(s.phase).toBe('crib')
  })

  it('ends the game the moment a side reaches the target', () => {
    let s = playing({ a: 'KC 2D', b: '5C 3D', scores: [119, 0] })
    s = apply(s, ['b', { type: 'play', cardId: '5C' }], ['a', { type: 'play', cardId: 'KC' }])
    expect(s.phase).toBe('over')
    expect(rules.result(s).winners).toEqual(['a'])
  })
})

describe('the crib', () => {
  it('collects the discards, cuts the starter and lets the dealer give last', () => {
    const s = rules.setup({
      players: infos(['a', 'b']),
      options: DEFAULT_CRIBBAGE_OPTIONS,
      seed: 3,
    })
    const first = s.turn
    expect(first).not.toBe(s.dealer)
    expect(
      rules.validateAction!(s, first, { type: 'crib', cardIds: [s.hands[first]![0]!.id] }),
    ).toMatch(/genau 2/)
    const give = (st: CribbageState, p: string) =>
      apply(st, [p, { type: 'crib', cardIds: st.hands[p]!.slice(0, 2).map((c) => c.id) }])
    const after = give(give(s, first), s.dealer)
    expect(after.crib).toHaveLength(4)
    expect(after.starter).not.toBeNull()
    expect(after.phase).toBe('play')
    expect(after.turn).toBe(first)
  })

  it('deals five cards and one crib card from the deck with three players', () => {
    const s = rules.setup({
      players: infos(['a', 'b', 'c']),
      options: DEFAULT_CRIBBAGE_OPTIONS,
      seed: 2,
    })
    expect(Object.values(s.hands).map((h) => h.length)).toEqual([5, 5, 5])
    expect(s.crib).toHaveLength(1)
  })
})

describe('AI', () => {
  it('plays whole games with 2, 3 and 4 players', { timeout: 60_000 }, async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (const n of [2, 3, 4]) {
      for (let seed = 0; seed < 3; seed++) {
        const ids = ['a', 'b', 'c', 'd'].slice(0, n)
        const { result, session } = await simulateGame(cribbageGame, {
          players: infos(ids),
          agents: Object.fromEntries(
            ids.map((p, i) => [p, createCribbageAgent(levels[(i + seed) % 3]!)]),
          ),
          options: { targetScore: 61 },
          seed,
          maxMoves: 5000,
        })
        expect(Math.max(...Object.values(result.scores))).toBeGreaterThanOrEqual(61)
        const state = session.state as CribbageState
        expect(state.results.length).toBeGreaterThan(0)
      }
    }
  })
})
