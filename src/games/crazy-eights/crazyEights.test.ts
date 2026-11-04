import { createRandomAgent } from '@/ai'
import { parseCards, type PlayerInfo, simulateGame } from '@/engine'
import { createMauMauAgent } from '@/games/mau-mau/ai'
import {
  handPoints,
  type MauMauAction,
  type MauMauOptions,
  type MauMauState,
  type MauMauView,
  playableCards,
} from '@/games/mau-mau'
import { crazyEightsGame, DEFAULT_CRAZY_EIGHTS_OPTIONS } from '.'

const rules = crazyEightsGame
const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'abcdefg'[i]!, name: 'x', kind: 'ai' }))

function situation(spec: {
  hands: Record<string, string>
  top: string
  stock?: string
  wish?: MauMauState['wish']
  options?: Partial<MauMauOptions>
}): MauMauState {
  const order = Object.keys(spec.hands)
  return {
    order,
    hands: Object.fromEntries(order.map((id) => [id, parseCards(spec.hands[id]!)])),
    stock: parseCards(spec.stock ?? ''),
    discard: parseCards(spec.top),
    turn: order[0]!,
    direction: 1,
    wish: spec.wish ?? null,
    pendingDraw: 0,
    drawnCardId: null,
    idleTurns: 0,
    winner: null,
    events: [],
    log: [],
    options: { ...DEFAULT_CRAZY_EIGHTS_OPTIONS, ...spec.options },
    rng: [1, 2, 3, 4],
  }
}

const total = (s: MauMauState) =>
  s.stock.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0)

describe('Crazy Eights', () => {
  it('deals seven cards to two players and five to more, from 52 cards', () => {
    const two = rules.setup({ players: players(2), options: DEFAULT_CRAZY_EIGHTS_OPTIONS, seed: 1 })
    expect(two.hands['a']).toHaveLength(7)
    expect(total(two)).toBe(52)
    const four = rules.setup({
      players: players(4),
      options: DEFAULT_CRAZY_EIGHTS_OPTIONS,
      seed: 1,
    })
    expect(four.hands['a']).toHaveLength(5)
  })

  it('treats the eight as wild, also on another eight', () => {
    const state = situation({ hands: { a: '8C 2D', b: 'KD' }, top: '8H' })
    expect(playableCards(state, 'a').map((c) => c.id)).toEqual(['8C'])
    const wishes = rules.legalActions(state, 'a').filter((a) => a.type === 'play')
    expect(wishes).toHaveLength(4)
    const next = rules.applyAction(state, 'a', { type: 'play', cardId: '8C', wish: 'spades' })
    expect(next.wish).toBe('spades')
  })

  it('draws until a card fits', () => {
    const state = situation({ hands: { a: '3C', b: 'KD' }, top: 'KH', stock: '9S 4S 2C 7H' })
    const next = rules.applyAction(state, 'a', { type: 'draw' })
    // The stock is drawn from the front: 9S and 4S do not fit, 2C does not, 7H fits.
    expect(next.hands['a']!.map((c) => c.id)).toEqual(['3C', '9S', '4S', '2C', '7H'])
    expect(next.drawnCardId).toBe('7H')
    expect(next.turn).toBe('a')
  })

  it('draws a single card without that variant', () => {
    const state = situation({
      hands: { a: '3C', b: 'KD' },
      top: 'KH',
      stock: '9S 4S 7H',
      options: { drawUntilPlayable: false },
    })
    expect(rules.applyAction(state, 'a', { type: 'draw' }).hands['a']).toHaveLength(2)
  })

  it('has twos, queens and aces as optional special cards', () => {
    const base = { hands: { a: '2H QH AH 5C', b: 'KD 4D', c: '9D' }, top: 'KH' }
    const plain = rules.applyAction(situation(base), 'a', { type: 'play', cardId: '2H' })
    expect(plain.pendingDraw).toBe(0)
    const twos = rules.applyAction(situation({ ...base, options: { sevenDrawsTwo: true } }), 'a', {
      type: 'play',
      cardId: '2H',
    })
    expect(twos.pendingDraw).toBe(2)
    const queen = rules.applyAction(situation({ ...base, options: { eightSkips: true } }), 'a', {
      type: 'play',
      cardId: 'QH',
    })
    expect(queen.turn).toBe('c')
    const ace = rules.applyAction(situation({ ...base, options: { nineReverses: true } }), 'a', {
      type: 'play',
      cardId: 'AH',
    })
    expect(ace.turn).toBe('c')
    expect(ace.direction).toBe(-1)
  })

  it('scores eights 50, pictures 10 and aces 1', () => {
    expect(handPoints(parseCards('8S KD QH JC AS 5D'), 'crazyEights')).toBe(50 + 30 + 1 + 5)
  })

  it(
    'finishes many random games with all variants without losing cards',
    { timeout: 30_000 },
    async () => {
      for (let seed = 0; seed < 150; seed++) {
        const n = 2 + (seed % 6)
        const ps = players(n)
        const { session } = await simulateGame(rules, {
          players: ps,
          agents: Object.fromEntries(
            ps.map((p, i) => [
              p.id,
              i % 2
                ? createRandomAgent<MauMauView, MauMauAction>()
                : createMauMauAgent('intermediate'),
            ]),
          ),
          options: {
            sevenDrawsTwo: seed % 2 === 0,
            eightSkips: seed % 3 === 0,
            nineReverses: seed % 4 === 0,
            drawUntilPlayable: seed % 5 !== 0,
          },
          seed,
          maxMoves: 5000,
        })
        expect(total(session.state)).toBe(52)
      }
    },
  )
})
