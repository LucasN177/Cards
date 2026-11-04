import { type AiAgent, parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import {
  bestSpiderMove,
  DEFAULT_SPIDER_OPTIONS,
  findHint,
  isSuitRun,
  type SpiderAction,
  spiderGame,
  type SpiderState,
  type SpiderView,
} from './spider'

const rules = spiderGame
const me: PlayerInfo = { id: 'me', name: 'Ich', kind: 'ai' }
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const KING_TO_ACE = 'KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S'

function situation(spec: {
  tableau: { cards: string; hidden?: number }[]
  stock?: string
  completed?: number
}): SpiderState {
  return {
    player: 'me',
    tableau: Array.from({ length: 10 }, (_, i) => ({
      cards: cards(spec.tableau[i]?.cards ?? '9D'),
      hidden: spec.tableau[i]?.hidden ?? 0,
    })),
    stock: cards(spec.stock ?? ''),
    completed: Array.from({ length: spec.completed ?? 0 }, () => 'spades' as const),
    options: DEFAULT_SPIDER_OPTIONS,
    moves: 0,
    resigned: false,
  }
}

const total = (s: SpiderState) =>
  s.stock.length + s.completed.length * 13 + s.tableau.reduce((n, p) => n + p.cards.length, 0)

const move = (pile: number, index: number, to: number) =>
  ({
    type: 'move',
    from: { zone: 'tableau', pile, index },
    to: { zone: 'tableau', pile: to },
  }) as const

describe('setup', () => {
  it.each([1, 2, 4] as const)('deals 104 cards with %i suit(s)', (suits) => {
    const state = rules.setup({ players: [me], options: { suits }, seed: 1 })
    expect(state.tableau.map((p) => p.cards.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5])
    expect(state.tableau.every((p) => p.hidden === p.cards.length - 1)).toBe(true)
    expect(state.stock).toHaveLength(50)
    expect(total(state)).toBe(104)
    expect(new Set(state.stock.map((c) => c.suit)).size).toBeLessThanOrEqual(suits)
    const ids = [...state.stock, ...state.tableau.flatMap((p) => p.cards)].map((c) => c.id)
    expect(new Set(ids).size).toBe(104)
  })
})

describe('moves', () => {
  it('moves only runs of one suit, onto a card one higher of any suit', () => {
    expect(isSuitRun(cards('9H 8H 7H'))).toBe(true)
    expect(isSuitRun(cards('9H 8S'))).toBe(false)
    const state = situation({
      tableau: [{ cards: '5C 9H 8H 7H', hidden: 1 }, { cards: '10S' }, { cards: '9S 8H 7H' }],
    })
    const next = rules.applyAction(state, 'me', move(0, 1, 1))
    expect(next.tableau[1]!.cards.map((c) => c.id)).toEqual(['10S', '9H', '8H', '7H'])
    expect(next.tableau[0]).toEqual({ cards: cards('5C'), hidden: 0 })
    // 9S 8H 7H is not one suit: only 8H 7H can move.
    expect(rules.validateAction!(state, 'me', move(2, 0, 1))).not.toBeNull()
  })

  it('removes a finished King-to-Ace run of one suit', () => {
    const state = situation({
      tableau: [{ cards: `4D ${KING_TO_ACE}`, hidden: 1 }, { cards: 'AS' }],
    })
    const next = rules.applyAction(state, 'me', move(1, 0, 0))
    expect(next.completed).toEqual(['spades'])
    expect(next.tableau[0]).toEqual({ cards: cards('4D'), hidden: 0 })
    expect(next.tableau[1]!.cards).toEqual([])
  })

  it('deals ten cards only while no pile is empty', () => {
    const stock = '2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC'
    const full = situation({ tableau: [], stock })
    const dealt = rules.applyAction(full, 'me', { type: 'deal' })
    expect(dealt.stock).toHaveLength(2)
    expect(dealt.tableau.every((p) => p.cards.length === 2)).toBe(true)

    const withEmpty = situation({ tableau: [{ cards: '' }], stock })
    expect(rules.legalActions(withEmpty, 'me').some((a) => a.type === 'deal')).toBe(false)
    expect(rules.validateAction!(withEmpty, 'me', { type: 'deal' })).not.toBeNull()
  })

  it('is won with eight finished runs', () => {
    const state = situation({ tableau: [{ cards: KING_TO_ACE }, { cards: 'AS' }], completed: 7 })
    const won = rules.applyAction(state, 'me', move(1, 0, 0))
    expect(rules.isTerminal(won)).toBe(true)
    expect(rules.result(won)).toMatchObject({ winners: ['me'], scores: { me: 8 } })
  })
})

describe('hints', () => {
  it('prefers uncovering a card, then same-suit builds, then dealing', () => {
    const uncover = situation({ tableau: [{ cards: '3D 7H', hidden: 1 }, { cards: '8S' }] })
    expect(findHint(uncover)).toEqual(move(0, 1, 1))

    const sameSuit = situation({ tableau: [{ cards: '7H' }, { cards: '8S' }, { cards: '8H' }] })
    expect(findHint(sameSuit)).toEqual(move(0, 0, 2))

    const deal = situation({ tableau: [], stock: '2C 3C 4C 5C 6C 7C 8C 9C 10C JC' })
    expect(findHint(deal)).toEqual({ type: 'deal' })
  })

  it('reports a dead end when nothing helps and the stock is empty', () => {
    const state = situation({ tableau: [] })
    expect(findHint(state)).toBeNull()
    expect(rules.playerView(state, 'me').stuck).toBe(true)
  })

  it('taps onto the same suit when possible', () => {
    const state = situation({ tableau: [{ cards: '7H' }, { cards: '8S' }, { cards: '8H' }] })
    const view = rules.playerView(state, 'me')
    expect(
      bestSpiderMove(rules.legalActions(state, 'me'), { zone: 'tableau', pile: 0, index: 0 }, view)
        ?.to.pile,
    ).toBe(2)
  })
})

function hintAgent(limit: number): AiAgent<SpiderView, SpiderAction> {
  let turns = 0
  return {
    name: 'hint',
    chooseAction: ({ view }) => (++turns > limit || !view.hint ? { type: 'resign' } : view.hint),
  }
}

describe('simulation', () => {
  it('never loses a card and finishes runs', { timeout: 30_000 }, async () => {
    let runs = 0
    for (let seed = 0; seed < 40; seed++) {
      const { session } = await simulateGame(spiderGame, {
        players: [me],
        agents: { me: hintAgent(400) },
        seed,
      })
      expect(total(session.state)).toBe(104)
      runs += session.state.completed.length
    }
    expect(runs).toBeGreaterThan(0)
  })
})
