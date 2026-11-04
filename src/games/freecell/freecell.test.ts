import {
  type AiAgent,
  parseCards,
  type PlayerInfo,
  simulateGame,
  SUITS,
  type SuitedCard,
} from '@/engine'
import {
  bestFreeCellMove,
  DEFAULT_FREECELL_OPTIONS,
  findHint,
  type FreeCellAction,
  freeCellGame,
  type FreeCellState,
  type FreeCellView,
  foundationTotal,
  isRun,
  maxMovable,
} from './freecell'

const rules = freeCellGame
const me: PlayerInfo = { id: 'me', name: 'Ich', kind: 'ai' }
const cards = (codes: string) => parseCards(codes) as SuitedCard[]

function situation(spec: {
  tableau?: string[]
  cells?: (string | null)[]
  foundations?: Partial<Record<(typeof SUITS)[number], string>>
  autoFoundation?: boolean
}): FreeCellState {
  return {
    player: 'me',
    tableau: Array.from({ length: 8 }, (_, i) => cards(spec.tableau?.[i] ?? '')),
    cells: Array.from({ length: 4 }, (_, i) => {
      const code = spec.cells?.[i]
      return code ? cards(code)[0]! : null
    }),
    foundations: Object.fromEntries(
      SUITS.map((s) => [s, cards(spec.foundations?.[s] ?? '')]),
    ) as unknown as FreeCellState['foundations'],
    options: { ...DEFAULT_FREECELL_OPTIONS, autoFoundation: spec.autoFoundation ?? false },
    moves: 0,
    resigned: false,
  }
}

const total = (s: FreeCellState) =>
  s.tableau.reduce((n, p) => n + p.length, 0) +
  s.cells.filter(Boolean).length +
  foundationTotal(s.foundations)

const move = (from: FreeCellAction & { type: 'move' }) => from

describe('setup', () => {
  it('deals all 52 cards face up into eight piles', () => {
    const state = rules.setup({ players: [me], options: DEFAULT_FREECELL_OPTIONS, seed: 1 })
    expect(state.tableau.map((p) => p.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6])
    expect(total(state)).toBe(52)
    expect(state.cells).toEqual([null, null, null, null])
  })
})

describe('moves', () => {
  it('recognizes ordered runs', () => {
    expect(isRun(cards('10S 9H 8C'))).toBe(true)
    expect(isRun(cards('10S 9C'))).toBe(false)
    expect(isRun(cards('10S 8H'))).toBe(false)
  })

  it('limits runs by free cells and empty piles', () => {
    const empty = situation({ tableau: ['KS', 'KH', 'KC', 'KD', 'QS', 'QH'] })
    expect(maxMovable(empty, false)).toBe(5 * 2 ** 2)
    expect(maxMovable(empty, true)).toBe(5 * 2)
    const full = situation({
      tableau: ['KS', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD'],
      cells: ['2S', '2H', '2C', null],
    })
    expect(maxMovable(full, false)).toBe(2)
  })

  it('moves a run onto a fitting pile only if it is short enough', () => {
    const state = situation({
      tableau: ['JD 10S 9H 8C', 'QC', 'KS', 'KH', 'KC', 'KD', 'QS', 'QH'],
      cells: ['2S', '2H', '2C', null],
    })
    // Run of 3 (10S 9H 8C) but only (1 + 1) × 1 = 2 cards may move.
    expect(
      rules.validateAction!(
        state,
        'me',
        move({
          type: 'move',
          from: { zone: 'tableau', pile: 0, index: 1 },
          to: { zone: 'tableau', pile: 1 },
        }),
      ),
    ).not.toBeNull()
    // Two cards work, but only if they fit: 9H 8C does not fit on QC.
    expect(
      rules.validateAction!(
        state,
        'me',
        move({
          type: 'move',
          from: { zone: 'tableau', pile: 0, index: 2 },
          to: { zone: 'tableau', pile: 1 },
        }),
      ),
    ).not.toBeNull()
    // JD with everything on it fits on QC once there is room.
    const roomy = { ...state, cells: [null, null, null, null] }
    const next = rules.applyAction(
      roomy,
      'me',
      move({
        type: 'move',
        from: { zone: 'tableau', pile: 0, index: 0 },
        to: { zone: 'tableau', pile: 1 },
      }),
    )
    expect(next.tableau[1]!.map((c) => c.id)).toEqual(['QC', 'JD', '10S', '9H', '8C'])
  })

  it('parks single cards in free cells and brings them back', () => {
    const state = situation({ tableau: ['9H 5C', '6D'] })
    const parked = rules.applyAction(
      state,
      'me',
      move({
        type: 'move',
        from: { zone: 'tableau', pile: 0, index: 1 },
        to: { zone: 'cell', index: 0 },
      }),
    )
    expect(parked.cells[0]?.id).toBe('5C')
    const back = rules.applyAction(
      parked,
      'me',
      move({ type: 'move', from: { zone: 'cell', index: 0 }, to: { zone: 'tableau', pile: 1 } }),
    )
    expect(back.tableau[1]!.map((c) => c.id)).toEqual(['6D', '5C'])
    expect(back.cells[0]).toBeNull()
  })

  it('accepts any card on an empty pile', () => {
    const state = situation({ tableau: ['9H 5C'] })
    const next = rules.applyAction(
      state,
      'me',
      move({
        type: 'move',
        from: { zone: 'tableau', pile: 0, index: 1 },
        to: { zone: 'tableau', pile: 3 },
      }),
    )
    expect(next.tableau[3]!.map((c) => c.id)).toEqual(['5C'])
  })
})

describe('automatic foundations', () => {
  it('puts away aces, twos and cards nobody can still use', () => {
    const state = {
      ...situation({ tableau: ['9H AS', '5C 2S'], foundations: {} }),
      options: { autoFoundation: true },
    }
    // Moving 9H's neighbour triggers the safe ace and then the two.
    const next = rules.applyAction(
      state,
      'me',
      move({
        type: 'move',
        from: { zone: 'tableau', pile: 1, index: 1 },
        to: { zone: 'cell', index: 0 },
      }),
    )
    expect(next.foundations.spades.map((c) => c.id)).toEqual(['AS', '2S'])
  })

  it('keeps a card that a lower opposite-colored card could still need', () => {
    const state = {
      ...situation({ tableau: ['3H', 'KS'], foundations: { hearts: 'AH 2H' } }),
      options: { autoFoundation: true },
    }
    // 3H could still hold a black 2 – the black twos are not on their foundations yet.
    const next = rules.applyAction(
      state,
      'me',
      move({
        type: 'move',
        from: { zone: 'tableau', pile: 1, index: 0 },
        to: { zone: 'tableau', pile: 4 },
      }),
    )
    expect(next.foundations.hearts).toHaveLength(2)
  })
})

describe('hints and end of game', () => {
  it('prefers foundation moves and knows dead ends', () => {
    const state = situation({ tableau: ['9H AS', 'KD'] })
    expect(findHint(state)?.to).toEqual({ zone: 'foundation', suit: 'spades' })

    const blocked = situation({
      // Only black cards in the piles: nothing fits anywhere, and the cells are full.
      tableau: ['KS', 'KC', 'QS', 'QC', 'JS', 'JC', '10S', '10C'],
      cells: ['2S', '2H', '2C', '2D'],
    })
    expect(findHint(blocked)).toBeNull()
    expect(rules.playerView(blocked, 'me').stuck).toBe(true)
  })

  it('picks the foundation or a building move on tap', () => {
    const state = situation({ tableau: ['9H AS', '10C', 'KD'] })
    const legal = rules.legalActions(state, 'me')
    expect(bestFreeCellMove(legal, { zone: 'tableau', pile: 0, index: 1 }, state)?.to).toEqual({
      zone: 'foundation',
      suit: 'spades',
    })
    const afterAce = situation({ tableau: ['9H', '10C', 'KD'] })
    expect(
      bestFreeCellMove(
        rules.legalActions(afterAce, 'me'),
        { zone: 'tableau', pile: 0, index: 0 },
        afterAce,
      )?.to,
    ).toEqual({ zone: 'tableau', pile: 1 })
  })

  it('is won with all cards on the foundations and lost by giving up', () => {
    const resigned = rules.applyAction(situation({ tableau: ['5C'] }), 'me', { type: 'resign' })
    expect(rules.isTerminal(resigned)).toBe(true)
    expect(rules.result(resigned).winners).toEqual([])
  })
})

/** Plays the hint until the game ends or a move limit is reached. */
function hintAgent(limit: number): AiAgent<FreeCellView, FreeCellAction> {
  let turns = 0
  return {
    name: 'hint',
    chooseAction: ({ view }) => (++turns > limit || !view.hint ? { type: 'resign' } : view.hint),
  }
}

describe('simulation', () => {
  it('never loses a card over many games', { timeout: 30_000 }, async () => {
    for (let seed = 0; seed < 60; seed++) {
      const { session } = await simulateGame(freeCellGame, {
        players: [me],
        agents: { me: hintAgent(250) },
        seed,
      })
      expect(total(session.state)).toBe(52)
    }
  })
})
