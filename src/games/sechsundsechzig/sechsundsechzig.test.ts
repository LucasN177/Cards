import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createSechsundsechzigAgent } from './ai'
import {
  beats,
  DEFAULT_66_OPTIONS,
  playableCards,
  type SechsundsechzigAction,
  sechsundsechzigGame,
  type SechsundsechzigState,
} from './index'

const rules = sechsundsechzigGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const players: PlayerInfo[] = [
  { id: 'a', name: 'A', kind: 'human' },
  { id: 'b', name: 'B', kind: 'ai' },
]

/** a leads; trump is hearts. The stock's last card is the trump card. */
function table(
  a: string,
  b: string,
  stock = '9C JC QC 9D',
  extra: Partial<SechsundsechzigState> = {},
): SechsundsechzigState {
  const state = rules.setup({ players, options: DEFAULT_66_OPTIONS, seed: 1 })
  return {
    ...state,
    hands: { a: cards(a), b: cards(b) },
    stock: [...cards(stock), cards('JH')[0]!],
    trump: 'hearts',
    turn: 'a',
    leader: 'a',
    ...extra,
  }
}

const apply = (state: SechsundsechzigState, ...moves: [string, SechsundsechzigAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal`)
    return rules.applyAction(s, p, a)
  }, state)
const play = (cardId: string, meld = false): SechsundsechzigAction =>
  meld ? { type: 'play', cardId, meld: true } : { type: 'play', cardId }

describe('tricks', () => {
  it('is won by the higher card of the led suit or a trump; 10 ranks above the king', () => {
    const [ten, king, nineH, aceS] = cards('10S KS 9H AS')
    expect(beats(ten!, king!, 'hearts')).toBe(true)
    expect(beats(nineH!, aceS!, 'hearts')).toBe(true)
    expect(beats(king!, aceS!, 'hearts')).toBe(false)
  })

  it('counts card points, the winner draws first', () => {
    const s = apply(table('AS 9C', 'KS 10D'), ['a', play('AS')], ['b', play('KS')])
    expect(s.points['a']).toBe(15)
    expect(s.turn).toBe('a')
    expect(s.hands['a']!.map((c) => c.id)).toContain('9C')
    expect(s.hands['b']!.map((c) => c.id)).toContain('JC')
  })

  it('needs no suit following while the stock is open, but strict rules after closing', () => {
    const open = apply(table('AS', 'KD 10S 9H'), ['a', play('AS')])
    expect(playableCards(open, 'b')).toHaveLength(3)
    const closed = apply(table('AS 9C', 'KD 10S 9H'), ['a', { type: 'close' }], ['a', play('AS')])
    // Must follow suit (the 10 does not beat the ace, but it is the only spade).
    expect(playableCards(closed, 'b').map((c) => c.id)).toEqual(['10S'])
    const trumpOnly = apply(table('AS 9C', 'KD 9H'), ['a', { type: 'close' }], ['a', play('AS')])
    expect(playableCards(trumpOnly, 'b').map((c) => c.id)).toEqual(['9H'])
  })
})

describe('melds and the trump card', () => {
  it('counts a marriage only after the first trick won', () => {
    let s = apply(table('KS QS 9C', 'AS 10D 9D'), ['a', play('QS', true)])
    expect(s.points['a']).toBe(0)
    expect(s.pending['a']).toBe(20)
    s = apply(s, ['b', play('9D')])
    // a wins with the queen (b did not follow): 3 + 0 + 20.
    expect(s.points['a']).toBe(23)
  })

  it('counts 40 for the trump marriage', () => {
    const s = apply(table('KH QH 9C', 'AS 10D 9D', undefined, { tricksWon: { a: 1, b: 0 } }), [
      'a',
      play('KH', true),
    ])
    expect(s.points['a']).toBe(40)
  })

  it('swaps the trump nine for the face-up trump card', () => {
    const s = apply(table('9H AS', 'KS 10D'), ['a', { type: 'exchange' }])
    expect(s.hands['a']!.map((c) => c.id)).toContain('JH')
    expect(s.stock.at(-1)!.id).toBe('9H')
  })
})

describe('ending a hand', () => {
  it('ends at 66 and gives 2 game points when the other has less than 33', () => {
    const s = apply(
      table('AS 10S', 'KS 9D', undefined, { points: { a: 52, b: 10 }, tricksWon: { a: 2, b: 1 } }),
      ['a', play('AS')],
      ['b', play('KS')],
    )
    expect(s.handResults[0]).toMatchObject({ winner: 'a', gamePoints: 2 })
  })

  it('gives 3 game points when the other has no trick', () => {
    const s = apply(
      table('AS 10S', 'KS 9D', undefined, { points: { a: 55, b: 0 }, tricksWon: { a: 2, b: 0 } }),
      ['a', play('AS')],
      ['b', play('KS')],
    )
    expect(s.handResults[0]!.gamePoints).toBe(3)
  })

  it('punishes a closer who does not reach 66', () => {
    let s = table('AS', 'KS', '', { tricksWon: { a: 1, b: 1 }, points: { a: 20, b: 30 } })
    s = { ...s, stock: cards('9C JC QC JH') }
    s = apply(s, ['a', { type: 'close' }], ['a', play('AS')], ['b', play('KS')])
    expect(s.handResults[0]).toMatchObject({ winner: 'b', gamePoints: 2, reason: 'closeFailed' })
  })

  it('lets the last trick decide (with 10 extra) when nobody reaches 66', () => {
    const s = apply(
      table('9S', 'JS', '', { points: { a: 40, b: 50 }, tricksWon: { a: 5, b: 6 }, stock: [] }),
      ['a', play('9S')],
      ['b', play('JS')],
    )
    expect(s.handResults[0]).toMatchObject({ winner: 'b', reason: 'lastTrick', gamePoints: 1 })
    expect(s.handResults[0]!.points['b']).toBe(62)
  })
})

describe('simulation', () => {
  it('plays full matches with all AI levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 60; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session, result } = await simulateGame(sechsundsechzigGame, {
        players: ps,
        agents: {
          a: createSechsundsechzigAgent(levels[seed % 3]!),
          b: createSechsundsechzigAgent(levels[(seed + 1) % 3]!),
        },
        options: { target: 7, closing: seed % 2 === 0 },
        seed,
      })
      expect(session.state.phase).toBe('over')
      expect(Math.max(...Object.values(result.scores))).toBeGreaterThanOrEqual(7)
      for (const hand of session.state.handResults)
        expect(hand.points['a']! + hand.points['b']!).toBeLessThanOrEqual(120 + 10 + 40 + 60)
    }
  })
})
