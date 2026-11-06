import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createGinAgent } from './ai'
import {
  bestArrangement,
  cardValue,
  DEFAULT_GIN_OPTIONS,
  defend,
  finalScores,
  type GinAction,
  type GinOptions,
  ginRummyGame,
  type GinState,
  toMeld,
} from './index'

const rules = ginRummyGame
const order = ['a', 'b']
const players: PlayerInfo[] = order.map((id) => ({ id, name: id, kind: 'ai' }))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const ids = (list: readonly SuitedCard[]) => list.map((c) => c.id)

/** A hand in progress: `a` holds eleven cards and has to discard (or knock). */
function playing(hands: Record<string, string>, extra: Partial<GinState> = {}): GinState {
  const s = rules.setup({ players, options: DEFAULT_GIN_OPTIONS, seed: 1 })
  return {
    ...s,
    hands: { a: cards(hands['a']!), b: cards(hands['b']!) },
    stock: cards('2C 3C 4C 5C 6C 7C 8C 9C 10C JC'),
    discard: cards('KD'),
    phase: 'play',
    turn: 'a',
    takenDiscard: null,
    stockOnly: false,
    ...extra,
    options: { ...DEFAULT_GIN_OPTIONS, targetScore: 0, ...extra.options },
  }
}

const apply = (state: GinState, ...moves: [string, GinAction][]) =>
  moves.reduce((s, [p, a]) => {
    const error = rules.validateAction!(s, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(s, p, a)
  }, state)

describe('melds and deadwood', () => {
  it('knows sets and runs; the ace is always low', () => {
    expect(toMeld(cards('7C 7D 7S'))?.kind).toBe('set')
    expect(toMeld(cards('AH 2H 3H'))?.kind).toBe('run')
    expect(toMeld(cards('QH KH AH'))).toBeNull()
    expect(toMeld(cards('7C 7C:1 7S'))).toBeNull()
  })

  it('finds the arrangement with the least deadwood', () => {
    // 7S is wanted by both the sevens and the spade run: the run 5-6-7 plus 7C 7D 7H as set wins.
    const a = bestArrangement(cards('5S 6S 7S 7C 7D 7H KD QC'))
    expect(a.value).toBe(20)
    expect(a.melds).toHaveLength(2)
    expect(bestArrangement(cards('AC 2D 3H')).value).toBe(6)
  })

  it('lays off on the knocker’s melds, also in a chain', () => {
    const knocker = bestArrangement(cards('5H 6H 7H')).melds
    const answer = defend(cards('8H 9H KS'), knocker)
    expect(ids(answer.laidOff).sort()).toEqual(['8H', '9H'])
    expect(answer.value).toBe(10)
  })
})

describe('a hand', () => {
  it('deals ten each, turns the upcard and lets the non-dealer decide first', () => {
    const s = rules.setup({ players, options: DEFAULT_GIN_OPTIONS, seed: 3 })
    expect(order.map((p) => s.hands[p]!.length)).toEqual([10, 10])
    expect(s.discard).toHaveLength(1)
    expect(s.stock).toHaveLength(31)
    expect(s.phase).toBe('upcard')
    expect(s.turn).not.toBe(s.dealer)
  })

  it('after two passes the non-dealer draws from the stock', () => {
    let s = rules.setup({ players, options: DEFAULT_GIN_OPTIONS, seed: 3 })
    const first = s.turn
    s = apply(s, [first, { type: 'pass' }], [s.dealer, { type: 'pass' }])
    expect(s.turn).toBe(first)
    expect(s.phase).toBe('draw')
    expect(rules.legalActions(s, first)).toEqual([{ type: 'drawStock' }])
  })

  it('forbids throwing back the card just taken', () => {
    const s = playing(
      { a: '2H 3H 4H 9C 9D 9S KC QC JD 5D', b: 'AS 2S 3S 4S 5S 6S 7S 8S 9H 10H' },
      {
        phase: 'draw',
      },
    )
    const after = apply(s, ['a', { type: 'drawDiscard' }])
    expect(rules.validateAction!(after, 'a', { type: 'discard', cardId: 'KD' })).toMatch(/gleich/)
  })

  it('needs at most ten deadwood to knock', () => {
    // After discarding KC: 2-3-4 hearts, three nines, QC JD 5D = 25 deadwood.
    const s = playing({
      a: '2H 3H 4H 9C 9D 9S KC QC JD 5D AC',
      b: 'AS 2S 3S 4S 5S 6S 7S 8S 9H 10H',
    })
    expect(rules.validateAction!(s, 'a', { type: 'knock', cardId: 'KC' })).toMatch(/höchstens 10/)
  })

  it('scores a knock as the difference, after laying off', () => {
    // a: 2-3-4H, 9C 9D 9S, JC QC KC, deadwood AD = 1 after discarding 8D.
    // b: lays 5H off; deadwood 10S (10) + 6D 7D (13) = 23.
    const s = playing({
      a: '2H 3H 4H 9C 9D 9S JC QC KC AD 8D',
      b: '5H 10S 6D 7D AS 2S 3S 4S 5S 6S',
    })
    const end = apply(s, ['a', { type: 'knock', cardId: '8D' }])
    const result = end.results[0]!
    expect(result.outcome).toBe('knock')
    expect(ids(result.laidOff)).toEqual(['5H'])
    expect(result.deadwoodValue).toEqual({ a: 1, b: 23 })
    expect(result).toMatchObject({ winner: 'a', points: 22 })
  })

  it('gives gin 25 extra and allows no laying off', () => {
    // a: 2-5 hearts, three nines, J-Q-K clubs after discarding 8D. b could lay 6H off – not on gin.
    const s = playing({
      a: '2H 3H 4H 5H 9C 9D 9S JC QC KC 8D',
      b: '6H 10S QD 7D 2S 3S 4S 5S 6S 8C',
    })
    const result = apply(s, ['a', { type: 'knock', cardId: '8D' }]).results[0]!
    expect(result.outcome).toBe('gin')
    expect(result.laidOff).toEqual([])
    // b: run 2-6 spades, deadwood 6H 10S QD 7D 8C = 41.
    expect(result).toMatchObject({ winner: 'a', points: 41 + 25 })
  })

  it('rewards an undercut with 25', () => {
    // a knocks with 8 (8S); b melds 5-5-5, A-2-3 spades and 10-J-Q hearts: only 4D = 4 is left.
    const s = playing({
      a: '2C 3C 4C 9C 9D 9S JD QD KD 8S 7H',
      b: '5S 5D 5H AS 2S 3S 4D 10H JH QH',
    })
    const result = apply(s, ['a', { type: 'knock', cardId: '7H' }]).results[0]!
    expect(result.deadwoodValue).toEqual({ a: 8, b: 4 })
    expect(result).toMatchObject({ outcome: 'undercut', winner: 'b', points: 8 - 4 + 25 })
  })

  it('scores big gin with all eleven cards melded', () => {
    const s = playing({
      a: '2H 3H 4H 5H 9C 9D 9S JC QC KC 9H',
      b: '6H 10S QD 7D 2S 3S 4S 5S 6S 8C',
    })
    expect(rules.legalActions(s, 'a')).toContainEqual({ type: 'knock' })
    const result = apply(s, ['a', { type: 'knock' }]).results[0]!
    expect(result).toMatchObject({ outcome: 'bigGin', winner: 'a', points: 41 + 31 })
  })

  it('does not count a hand when only two stock cards are left', () => {
    const s = playing(
      { a: '2H 3H 4H 9C 9D 9S JC QC KC 5D 8D', b: '6H 10S QD 7D 2S 3S 4S 5S 6S 8C' },
      { stock: cards('AC 2C'), options: { ...DEFAULT_GIN_OPTIONS, targetScore: 100 } },
    )
    const end = apply(s, ['a', { type: 'discard', cardId: '8D' }])
    expect(end.results[0]).toMatchObject({ outcome: 'void', winner: null })
    expect(end.phase).toBe('upcard')
    expect(end.dealer).toBe(s.dealer)
  })

  it('Oklahoma: the upcard sets the knock limit, a spade doubles', () => {
    const options: GinOptions = { ...DEFAULT_GIN_OPTIONS, oklahoma: true }
    for (let seed = 0; seed < 20; seed++) {
      const s = rules.setup({ players, options, seed })
      const up = s.discard[0]!
      expect(s.knockLimit).toBe(up.rank === 'A' ? 0 : cardValue(up))
      expect(s.doubled).toBe(up.suit === 'spades')
    }
  })
})

describe('game end', () => {
  it('adds game bonus, 25 per hand won and doubles a shutout', () => {
    const s = playing({ a: '2H', b: '3H' }, { options: { ...DEFAULT_GIN_OPTIONS } })
    const base = { ...s, options: DEFAULT_GIN_OPTIONS }
    expect(finalScores({ ...base, scores: { a: 110, b: 40 }, handsWon: { a: 3, b: 2 } })).toEqual({
      a: 110 + 75 + 100,
      b: 40 + 50,
    })
    expect(finalScores({ ...base, scores: { a: 104, b: 0 }, handsWon: { a: 4, b: 0 } })).toEqual({
      a: (104 + 100 + 100) * 2,
      b: 0,
    })
  })
})

describe('AI', () => {
  it('plays whole games to 100 without breaking the rules', { timeout: 60_000 }, async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 9; seed++) {
      const { session, result } = await simulateGame(ginRummyGame, {
        players,
        agents: {
          a: createGinAgent(levels[seed % 3]!),
          b: createGinAgent(levels[(seed + 1) % 3]!),
        },
        seed,
        maxMoves: 20_000,
      })
      expect(session.state.phase).toBe('over')
      expect(Math.max(...order.map((p) => session.state.scores[p]!))).toBeGreaterThanOrEqual(100)
      expect(result.winners).toHaveLength(1)
    }
  })

  it(
    'levels: the beginner loses clearly; the expert is not worse',
    { timeout: 60_000 },
    async () => {
      const net = async (level: 'beginner' | 'intermediate' | 'expert') => {
        let points = 0
        let hands = 0
        for (let seed = 0; seed < 600; seed++) {
          const { session } = await simulateGame(ginRummyGame, {
            players,
            agents: { a: createGinAgent(level), b: createGinAgent('intermediate') },
            options: { ...DEFAULT_GIN_OPTIONS, targetScore: 0 },
            seed: 7000 + seed,
            maxMoves: 5000,
          })
          for (const r of session.state.results) {
            if (r.outcome === 'void') continue
            hands++
            points += r.winner === 'a' ? r.points : -r.points
          }
        }
        return points / hands
      }
      expect(await net('beginner')).toBeLessThan(-2.5)
      expect(await net('expert')).toBeGreaterThan(-1.5)
    },
  )
})
