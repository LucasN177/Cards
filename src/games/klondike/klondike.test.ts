import {
  type AiAgent,
  parseCards,
  type PlayerInfo,
  simulateGame,
  SUITS,
  type SuitedCard,
} from '@/engine'
import {
  bestMove,
  canAutoFinish,
  canFound,
  canStack,
  DEFAULT_KLONDIKE_OPTIONS,
  findHint,
  foundationCount,
  type KlondikeAction,
  klondikeGame,
  type KlondikeState,
  type KlondikeView,
  isStuck,
  nextFoundationMove,
  reachableStockCards,
  type Source,
  type Target,
} from './klondike'

const rules = klondikeGame
const me: PlayerInfo = { id: 'me', name: 'Ich', kind: 'ai' }
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const one = (code: string) => cards(code)[0]!

function situation(spec: {
  tableau?: { cards: string; hidden?: number }[]
  stock?: string
  waste?: string
  foundations?: Partial<Record<(typeof SUITS)[number], string>>
  drawCount?: 1 | 3
}): KlondikeState {
  const tableau = Array.from({ length: 7 }, (_, i) => {
    const pile = spec.tableau?.[i]
    return { cards: cards(pile?.cards ?? ''), hidden: pile?.hidden ?? 0 }
  })
  return {
    player: 'me',
    tableau,
    stock: cards(spec.stock ?? ''),
    waste: cards(spec.waste ?? ''),
    foundations: Object.fromEntries(
      SUITS.map((suit) => [suit, cards(spec.foundations?.[suit] ?? '')]),
    ) as unknown as KlondikeState['foundations'],
    options: { ...DEFAULT_KLONDIKE_OPTIONS, drawCount: spec.drawCount ?? 1 },
    moves: 0,
    recycles: 0,
    resigned: false,
  }
}

const total = (s: KlondikeState) =>
  s.stock.length +
  s.waste.length +
  foundationCount(s.foundations) +
  s.tableau.reduce((n, p) => n + p.cards.length, 0)

const move = (from: Source, to: Target) => ({ type: 'move', from, to }) as const

describe('setup', () => {
  it('deals seven piles with one open card each', () => {
    const state = rules.setup({ players: [me], options: DEFAULT_KLONDIKE_OPTIONS, seed: 1 })
    expect(state.tableau.map((p) => p.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(state.tableau.map((p) => p.hidden)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(state.stock).toHaveLength(24)
    expect(total(state)).toBe(52)
  })

  it('never shows face-down cards in the view', () => {
    const state = rules.setup({ players: [me], options: DEFAULT_KLONDIKE_OPTIONS, seed: 1 })
    const view = rules.playerView(state, 'me')
    expect(view.tableau.map((p) => p.cards.length)).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(view.tableau[6]!.hidden).toBe(6)
    expect(view).not.toHaveProperty('stock')
  })
})

describe('building', () => {
  it('stacks alternating colors downwards and only kings on empty piles', () => {
    expect(canStack(one('9H'), one('10S'))).toBe(true)
    expect(canStack(one('9C'), one('10S'))).toBe(false)
    expect(canStack(one('8H'), one('10S'))).toBe(false)
    expect(canStack(one('KD'), undefined)).toBe(true)
    expect(canStack(one('QD'), undefined)).toBe(false)
  })

  it('builds foundations from ace to king in one suit', () => {
    expect(canFound(one('AH'), [])).toBe(true)
    expect(canFound(one('2H'), [])).toBe(false)
    expect(canFound(one('2H'), cards('AH'))).toBe(true)
    expect(canFound(one('3H'), cards('AH'))).toBe(false)
  })
})

describe('moves', () => {
  it('moves a run of cards and turns up the card below', () => {
    const state = situation({
      tableau: [
        { cards: '5C 10D 9S 8H', hidden: 1 },
        { cards: 'JC', hidden: 0 },
      ],
    })
    const next = rules.applyAction(
      state,
      'me',
      move({ zone: 'tableau', pile: 0, index: 1 }, { zone: 'tableau', pile: 1 }),
    )
    expect(next.tableau[1]!.cards.map((c) => c.id)).toEqual(['JC', '10D', '9S', '8H'])
    expect(next.tableau[0]).toEqual({ cards: cards('5C'), hidden: 0 })
    expect(next.moves).toBe(1)
  })

  it('does not allow moving face-down cards or onto the same pile', () => {
    const state = situation({ tableau: [{ cards: '5C 10D', hidden: 1 }, { cards: '6H' }] })
    const legal = rules.legalActions(state, 'me')
    const fromHidden = legal.some(
      (a) =>
        a.type === 'move' && a.from.zone === 'tableau' && a.from.pile === 0 && a.from.index === 0,
    )
    expect(fromHidden).toBe(false)
    expect(
      rules.validateAction!(
        state,
        'me',
        move({ zone: 'tableau', pile: 0, index: 1 }, { zone: 'tableau', pile: 0 }),
      ),
    ).not.toBeNull()
  })

  it('puts only single cards onto the foundations', () => {
    const state = situation({ tableau: [{ cards: '3S 2H' }], foundations: { hearts: 'AH' } })
    expect(
      rules.validateAction!(
        state,
        'me',
        move({ zone: 'tableau', pile: 0, index: 1 }, { zone: 'foundation', suit: 'hearts' }),
      ),
    ).toBeNull()
    expect(
      rules.validateAction!(
        state,
        'me',
        move({ zone: 'tableau', pile: 0, index: 0 }, { zone: 'foundation', suit: 'spades' }),
      ),
    ).not.toBeNull()
  })

  it('can take a card back from a foundation', () => {
    const state = situation({
      tableau: [{ cards: '6S' }],
      foundations: { hearts: 'AH 2H 3H 4H 5H' },
    })
    const next = rules.applyAction(
      state,
      'me',
      move({ zone: 'foundation', suit: 'hearts' }, { zone: 'tableau', pile: 0 }),
    )
    expect(next.tableau[0]!.cards.map((c) => c.id)).toEqual(['6S', '5H'])
    expect(next.foundations.hearts).toHaveLength(4)
  })
})

describe('stock', () => {
  it('turns one or three cards and recycles the waste', () => {
    const single = rules.applyAction(situation({ stock: '2C 3C 4C' }), 'me', { type: 'draw' })
    expect(single.waste.map((c) => c.id)).toEqual(['4C'])

    const three = rules.applyAction(situation({ stock: 'AC 2C 3C 4C', drawCount: 3 }), 'me', {
      type: 'draw',
    })
    expect(three.waste.map((c) => c.id)).toEqual(['4C', '3C', '2C'])
    expect(three.stock.map((c) => c.id)).toEqual(['AC'])

    const recycled = rules.applyAction(situation({ waste: '4C 3C 2C' }), 'me', { type: 'draw' })
    expect(recycled.stock.map((c) => c.id)).toEqual(['2C', '3C', '4C'])
    expect(recycled.waste).toEqual([])
    expect(recycled.recycles).toBe(1)
  })
})

describe('end of game', () => {
  it('is won with all 52 cards on the foundations', () => {
    const full = (suit: string) =>
      ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
        .map((r) => r + suit)
        .join(' ')
    const nearly = situation({
      tableau: [{ cards: 'KH' }],
      foundations: {
        clubs: full('C'),
        spades: full('S'),
        diamonds: full('D'),
        hearts: full('H').replace(' KH', ''),
      },
    })
    expect(canAutoFinish(rules.playerView(nearly, 'me'))).toBe(true)
    const finishing = nextFoundationMove(rules.legalActions(nearly, 'me'))!
    const won = rules.applyAction(nearly, 'me', finishing)
    expect(rules.isTerminal(won)).toBe(true)
    expect(rules.result(won)).toMatchObject({ winners: ['me'], scores: { me: 52 } })
  })

  it('counts resigning as a loss', () => {
    const resigned = rules.applyAction(situation({ tableau: [{ cards: '5C' }] }), 'me', {
      type: 'resign',
    })
    expect(rules.isTerminal(resigned)).toBe(true)
    expect(rules.result(resigned).winners).toEqual([])
  })
})

describe('tap to move', () => {
  it('prefers the foundation, then a pile with cards over an empty pile', () => {
    const state = situation({
      tableau: [{ cards: 'AH' }, { cards: 'QS', hidden: 0 }, { cards: '' }, { cards: '9C 8H JD' }],
      foundations: {},
    })
    const view = rules.playerView(state, 'me')
    const legal = rules.legalActions(state, 'me')
    expect(bestMove(view, legal, { zone: 'tableau', pile: 0, index: 0 })?.to).toEqual({
      zone: 'foundation',
      suit: 'hearts',
    })
    expect(bestMove(view, legal, { zone: 'tableau', pile: 3, index: 2 })?.to).toEqual({
      zone: 'tableau',
      pile: 1,
    })
  })

  it('does not shuffle a lone king between empty piles', () => {
    const state = situation({ tableau: [{ cards: 'KH' }, { cards: '' }] })
    const view = rules.playerView(state, 'me')
    expect(
      bestMove(view, rules.legalActions(state, 'me'), { zone: 'tableau', pile: 0, index: 0 }),
    ).toBeNull()
  })
})

describe('dead ends', () => {
  it('is stuck when nothing can go anywhere', () => {
    const state = situation({
      tableau: [{ cards: '9C 4H', hidden: 1 }, { cards: '7C' }],
      stock: '10D 2S',
    })
    expect(isStuck(state)).toBe(true)
    expect(rules.playerView(state, 'me').stuck).toBe(true)
  })

  it('is not stuck while a stock card fits somewhere', () => {
    expect(isStuck(situation({ tableau: [{ cards: '7C' }], stock: '6H 2S' }))).toBe(false)
    expect(isStuck(situation({ tableau: [{ cards: '7C' }], waste: 'AS' }))).toBe(false)
  })

  it('is not stuck while a hidden card can be uncovered or a card freed for a foundation', () => {
    expect(isStuck(situation({ tableau: [{ cards: '9C 5H', hidden: 1 }, { cards: '6S' }] }))).toBe(
      false,
    )
    expect(
      isStuck(
        situation({
          tableau: [{ cards: '2H 7C' }, { cards: '8D' }],
          foundations: { hearts: 'AH' },
        }),
      ),
    ).toBe(false)
  })

  it('ignores moves that only shift cards back and forth', () => {
    // 6H could move between the two black sevens forever without any progress.
    const state = situation({ tableau: [{ cards: '7C 6H' }, { cards: '7S' }], stock: '2D' })
    expect(isStuck(state)).toBe(true)
  })

  it('only counts every third card as reachable when drawing three', () => {
    const state = situation({ stock: '2C 3C 4C 5C 6C 7C', drawCount: 3 })
    const ids = reachableStockCards(state).map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['5C', '2C']))
    expect(ids).not.toContain('6C')
    expect(ids).not.toContain('3C')
  })

  it('is never stuck after winning or giving up', () => {
    expect(isStuck({ ...situation({ tableau: [{ cards: '7C' }] }), resigned: true })).toBe(false)
  })
})

/** Greedy player for simulations: foundation > reveal a card > waste to tableau > draw. */
function greedyAgent(limit: number): AiAgent<KlondikeView, KlondikeAction> {
  let turns = 0
  return {
    name: 'greedy',
    chooseAction({ view, legalActions }) {
      if (++turns > limit) return { type: 'resign' }
      const moves = legalActions.filter((a) => a.type === 'move')
      const score = (a: (typeof moves)[number]) => {
        if (a.type !== 'move') return -1
        if (a.to.zone === 'foundation') return 100
        if (a.from.zone === 'foundation') return -1
        if (a.from.zone === 'tableau') {
          const pile = view.tableau[a.from.pile]!
          const toEmpty = a.to.zone === 'tableau' && view.tableau[a.to.pile]!.cards.length === 0
          if (a.from.index === 0) return toEmpty ? -1 : 30 // frees a column
          if (a.from.index === pile.hidden && pile.hidden > 0) return 50 // reveals a card
          return -1
        }
        return 20 // from waste
      }
      const best = [...moves].sort((a, b) => score(b) - score(a))[0]
      if (best && score(best) > 0) return best
      return legalActions.find((a) => a.type === 'draw') ?? { type: 'resign' }
    },
  }
}

describe('simulation', () => {
  it(
    'plays many games without losing cards and wins some of them',
    { timeout: 30_000 },
    async () => {
      let wins = 0
      for (let seed = 0; seed < 150; seed++) {
        const { session, result } = await simulateGame(klondikeGame, {
          players: [me],
          agents: { me: greedyAgent(400) },
          seed,
        })
        expect(total(session.state)).toBe(52)
        if (result.winners.length > 0) wins++
      }
      expect(wins).toBeGreaterThan(0)
    },
  )
})

describe('hints', () => {
  it('prefers a foundation move over everything else', () => {
    const state = situation({
      tableau: [{ cards: '9C 5H', hidden: 1 }, { cards: '6S' }, { cards: 'AD' }],
      stock: 'KH',
    })
    expect(findHint(state)).toEqual({
      type: 'move',
      from: { zone: 'tableau', pile: 2, index: 0 },
      to: { zone: 'foundation', suit: 'diamonds' },
    })
  })

  it('suggests uncovering a hidden card next', () => {
    const state = situation({ tableau: [{ cards: '9C 5H', hidden: 1 }, { cards: '6S' }] })
    expect(findHint(state)).toMatchObject({ from: { zone: 'tableau', pile: 0, index: 1 } })
  })

  it('suggests turning the stock when a card in it fits', () => {
    const state = situation({ tableau: [{ cards: '7C' }], stock: '6H 2S' })
    expect(findHint(state)).toEqual({ type: 'draw' })
    expect(rules.playerView(state, 'me').hint).toEqual({ type: 'draw' })
  })

  it('has no hint in a dead end', () => {
    const state = situation({
      tableau: [{ cards: '9C 4H', hidden: 1 }, { cards: '7C' }],
      stock: '10D',
    })
    expect(findHint(state)).toBeNull()
  })
})
