import { type Card, parseCards, type PlayerInfo, simulateGame } from '@/engine'
import { createCanastaAgent } from './ai'
import {
  type CanastaAction,
  canastaGame,
  type CanastaOptions,
  type CanastaState,
  DEFAULT_CANASTA_OPTIONS,
  type Meld,
  meldProblem,
  minimumFor,
  sideOf,
} from './index'

const rules = canastaGame
const four = ['a', 'b', 'c', 'd']
const infos = (ids: string[]): PlayerInfo[] => ids.map((id) => ({ id, name: id, kind: 'ai' }))
const cards = (codes: string) => (codes ? (parseCards(codes) as Card[]) : [])
const meld = (rank: Meld['rank'], codes: string): Meld => ({ rank, cards: cards(codes) })

/** Four players (a & c against b & d); `a` is on turn. */
function state(spec: {
  hands: Partial<Record<string, string>>
  melds?: [Meld[], Meld[]]
  discard?: string
  stock?: string
  phase?: CanastaState['phase']
  scores?: [number, number]
  options?: Partial<CanastaOptions>
}): CanastaState {
  const s = rules.setup({ players: infos(four), options: DEFAULT_CANASTA_OPTIONS, seed: 1 })
  return {
    ...s,
    hands: Object.fromEntries(four.map((p) => [p, cards(spec.hands[p] ?? '4C 5C 6C')])),
    melds: spec.melds ?? [[], []],
    redThrees: [[], []],
    discard: cards(spec.discard ?? ''),
    stock: cards(spec.stock ?? '9C 9D 9H 9S 10C 10D'),
    phase: spec.phase ?? 'play',
    turn: 'a',
    meldedBeforeTurn: (spec.melds?.[0].length ?? 0) > 0,
    scores: spec.scores ?? [0, 0],
    options: { ...DEFAULT_CANASTA_OPTIONS, targetScore: 0, ...spec.options },
  }
}

const apply = (s: CanastaState, ...moves: [string, CanastaAction][]) =>
  moves.reduce((acc, [p, a]) => {
    const error = rules.validateAction!(acc, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(acc, p, a)
  }, s)
const problem = (s: CanastaState, a: CanastaAction) => rules.validateAction!(s, 'a', a)

describe('cards and melds', () => {
  it('checks melds: two naturals, at most three wild cards, one rank', () => {
    expect(meldProblem('K', cards('KC KD KH'))).toBeNull()
    expect(meldProblem('K', cards('KC KD 2H'))).toBeNull()
    expect(meldProblem('K', cards('KC 2D JKR'))).toMatch(/zwei natürliche/)
    expect(meldProblem('K', cards('KC KD KH KS 2C 2D 2H 2S'))).toMatch(/Höchstens 3/)
    expect(meldProblem('K', cards('KC KD QH'))).toMatch(/eines Werts/)
    expect(meldProblem('3', cards('3C 3S 3C:1'))).toBeNull()
    expect(meldProblem('3', cards('3C 3S 2C'))).toMatch(/ohne Joker/)
  })

  it('needs 15, 50, 90 or 120 points for the first meld', () => {
    expect([-10, 0, 1500, 3000].map(minimumFor)).toEqual([15, 50, 90, 120])
  })

  it('deals 11 / 13 / 15 cards and lays out red threes at once', () => {
    for (const [n, size] of [
      [4, 11],
      [3, 13],
      [2, 15],
    ] as const) {
      for (let seed = 0; seed < 10; seed++) {
        const ids = four.slice(0, n)
        const s = rules.setup({ players: infos(ids), options: DEFAULT_CANASTA_OPTIONS, seed })
        expect(ids.every((p) => s.hands[p]!.length === size)).toBe(true)
        const all = ids.flatMap((p) => s.hands[p]!)
        expect(
          all.some(
            (c) => c.kind === 'suited' && c.rank === '3' && ['hearts', 'diamonds'].includes(c.suit),
          ),
        ).toBe(false)
        const top = s.discard.at(-1)!
        expect(top.kind === 'joker' || (top.kind === 'suited' && top.rank === '2')).toBe(false)
      }
    }
  })

  it('makes partners across the table with four players', () => {
    expect(four.map((p) => sideOf(four, p))).toEqual([0, 1, 0, 1])
    expect(['a', 'b', 'c'].map((p) => sideOf(['a', 'b', 'c'], p))).toEqual([0, 1, 2])
  })
})

describe('melding', () => {
  it('requires the minimum for the first meld', () => {
    const s = state({ hands: { a: '4C 4D 4H 5C 5D 5H 9C' } })
    // 4-4-4 and 5-5-5: 30 points, not enough for 50.
    expect(
      problem(s, {
        type: 'meld',
        groups: [
          { rank: '4', cardIds: ['4C', '4D', '4H'] },
          { rank: '5', cardIds: ['5C', '5D', '5H'] },
        ],
      }),
    ).toMatch(/50 Punkte/)
    const rich = state({ hands: { a: 'AC AD AH KC KD 2C 9C 8D' } })
    const after = apply(rich, [
      'a',
      {
        type: 'meld',
        groups: [
          { rank: 'A', cardIds: ['AC', 'AD', 'AH'] },
          { rank: 'K', cardIds: ['KC', 'KD', '2C'] },
        ],
      },
    ])
    expect(after.melds[0]).toHaveLength(2)
    expect(after.hasMelded['a']).toBe(true)
  })

  it('adds to the side’s meld; one meld per rank', () => {
    const s = state({ hands: { a: 'KH 9C 8D' }, melds: [[meld('K', 'KC KD KS')], []] })
    const after = apply(s, ['a', { type: 'meld', groups: [{ rank: 'K', cardIds: ['KH'] }] }])
    expect(after.melds[0]![0]!.cards).toHaveLength(4)
  })

  it('goes out only with a canasta; black threes only when going out', () => {
    const s = state({ hands: { a: '9C 9D 9H 4S' }, melds: [[meld('K', 'KC KD KS')], []] })
    expect(
      problem(s, { type: 'meld', groups: [{ rank: '9', cardIds: ['9C', '9D', '9H'] }] }),
    ).toMatch(/Canasta/)
    const ready = state({
      hands: { a: '9C 9D 9H 3C 3S 3C:1 4S' },
      melds: [[meld('K', 'KC KD KS KH KC:1 KD:1 2C')], []],
    })
    expect(
      problem(ready, { type: 'meld', groups: [{ rank: '3', cardIds: ['3C', '3S', '3C:1'] }] }),
    ).toMatch(/Ausmachen/)
    const out = apply(
      ready,
      [
        'a',
        {
          type: 'meld',
          groups: [
            { rank: '9', cardIds: ['9C', '9D', '9H'] },
            { rank: '3', cardIds: ['3C', '3S', '3C:1'] },
          ],
        },
      ],
      ['a', { type: 'discard', cardId: '4S' }],
    )
    const result = out.results[0]!
    expect(result.wentOut).toBe('a')
    // Mixed canasta 300 + going out 100 + cards (K×6 60, 2 20, 9×3 30, 3×3 15), minus the
    // partner's 4-5-6 of clubs (15).
    expect(result.sides[0]).toMatchObject({
      canastas: 300,
      goingOut: 100,
      total: 300 + 100 + 125 - 15,
    })
  })

  it('scores a natural canasta 500, red threes and a concealed going out', () => {
    const s = state({
      hands: { a: 'QC QD QH QS QC:1 QD:1 QH:1 5S' },
      melds: [[], []],
      scores: [0, 0],
    })
    const out = apply(
      { ...s, redThrees: [cards('3H'), []] },
      [
        'a',
        {
          type: 'meld',
          groups: [{ rank: 'Q', cardIds: ['QC', 'QD', 'QH', 'QS', 'QC:1', 'QD:1', 'QH:1'] }],
        },
      ],
      ['a', { type: 'discard', cardId: '5S' }],
    )
    expect(out.results[0]).toMatchObject({ wentOut: 'a', concealed: true })
    expect(out.results[0]!.sides[0]).toMatchObject({ canastas: 500, redThrees: 100, goingOut: 200 })
    // b & d melded nothing: their cards in hand count against them.
    expect(out.results[0]!.sides[1]!.total).toBeLessThan(0)
  })
})

describe('the discard pile', () => {
  it('can be taken with a natural pair, and the top card must be melded', () => {
    const s = state({ hands: { a: 'KC KD AC AD AH 4S' }, discard: '6C 7D KH', phase: 'draw' })
    const after = apply(s, [
      'a',
      {
        type: 'takePile',
        groups: [
          { rank: 'K', cardIds: ['KC', 'KD'] },
          { rank: 'A', cardIds: ['AC', 'AD', 'AH'] },
        ],
      },
    ])
    expect(after.melds[0]!.find((m) => m.rank === 'K')!.cards).toHaveLength(3)
    expect(after.hands['a']!.map((c) => c.id).sort()).toEqual(['4S', '6C', '7D'])
    expect(after.discard).toEqual([])
  })

  it('is frozen by a wild card: a natural pair is needed', () => {
    const melded: [Meld[], Meld[]] = [[meld('A', 'AC AD AH')], []]
    const unfrozen = state({
      hands: { a: 'KC 2D 4S 5S' },
      melds: melded,
      discard: '6C KH',
      phase: 'draw',
    })
    expect(
      problem(unfrozen, { type: 'takePile', groups: [{ rank: 'K', cardIds: ['KC', '2D'] }] }),
    ).toBeNull()
    const frozen = { ...unfrozen, discard: cards('6C 2H KH') }
    expect(
      problem(frozen, { type: 'takePile', groups: [{ rank: 'K', cardIds: ['KC', '2D'] }] }),
    ).toMatch(/eingefroren/)
  })

  it('is blocked by a black three or a wild card on top', () => {
    const s = state({ hands: { a: '3C 3S 4S' }, discard: '6C 3C:1', phase: 'draw' })
    expect(problem(s, { type: 'takePile', groups: [] })).toMatch(/schwarze Drei/)
  })

  it('variant: always frozen', () => {
    const melded: [Meld[], Meld[]] = [[meld('K', 'KC KD KS')], []]
    const s = state({
      hands: { a: 'KH 4S 5S' },
      melds: melded,
      discard: '6C KD:1',
      phase: 'draw',
      options: { alwaysFrozen: true },
    })
    expect(problem(s, { type: 'takePile', groups: [] })).toMatch(/eingefroren/)
  })
})

describe('AI', () => {
  it('plays whole games with 2, 3 and 4 players', { timeout: 60_000 }, async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (const n of [2, 3, 4]) {
      for (let seed = 0; seed < 4; seed++) {
        const ids = four.slice(0, n)
        const { session, result } = await simulateGame(canastaGame, {
          players: infos(ids),
          agents: Object.fromEntries(
            ids.map((p, i) => [p, createCanastaAgent(levels[(i + seed) % 3]!)]),
          ),
          options: { ...DEFAULT_CANASTA_OPTIONS, targetScore: 2500 },
          seed,
          maxMoves: 30_000,
        })
        expect(session.state.phase).toBe('over')
        expect(Math.max(...session.state.scores)).toBeGreaterThanOrEqual(2500)
        expect(result.winners.length).toBeGreaterThan(0)
        // All 108 cards are still there.
        const s = session.state
        const total =
          Object.values(s.hands).reduce((a, h) => a + h.length, 0) +
          s.stock.length +
          s.discard.length +
          s.melds.flat().reduce((a, m) => a + m.cards.length, 0) +
          s.redThrees.flat().length
        expect(total).toBe(108)
      }
    }
  })

  it(
    'levels: the beginner side loses clearly; the expert side is not worse',
    { timeout: 60_000 },
    async () => {
      const average = async (level: 'beginner' | 'intermediate' | 'expert') => {
        let diff = 0
        for (let seed = 0; seed < 300; seed++) {
          const { session } = await simulateGame(canastaGame, {
            players: infos(four),
            agents: Object.fromEntries(
              four.map((p, i) => [p, createCanastaAgent(i % 2 === 0 ? level : 'intermediate')]),
            ),
            options: { ...DEFAULT_CANASTA_OPTIONS, targetScore: 0 },
            seed: 3000 + seed,
            maxMoves: 3000,
          })
          const r = session.state.results[0]!
          diff += r.sides[0]!.total - r.sides[1]!.total
        }
        return diff / 300
      }
      expect(await average('beginner')).toBeLessThan(-800)
      expect(await average('expert')).toBeGreaterThan(-100)
    },
  )
})
