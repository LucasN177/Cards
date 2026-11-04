/**
 * FreeCell rules. Pure and deterministic; see `FreeCellRules.tsx` for the rule text.
 */
import {
  cardColor,
  createDeck,
  defineGame,
  type GameResult,
  type PlayerId,
  Rng,
  type Suit,
  SUITS,
  type SuitedCard,
} from '@/engine'
import { canFound, rankValue } from '@/games/klondike/klondike'

export interface FreeCellOptions {
  /** Cards that can no longer be needed in the tableau go to the foundations by themselves. */
  readonly autoFoundation: boolean
}

export const DEFAULT_FREECELL_OPTIONS: FreeCellOptions = { autoFoundation: true }

export const CELL_COUNT = 4
export const PILE_COUNT = 8

export type FreeCellSource =
  | { readonly zone: 'cell'; readonly index: number }
  | { readonly zone: 'foundation'; readonly suit: Suit }
  /** `index` is the position in the pile; the card and everything on top of it move. */
  | { readonly zone: 'tableau'; readonly pile: number; readonly index: number }

export type FreeCellTarget =
  | { readonly zone: 'cell'; readonly index: number }
  | { readonly zone: 'foundation'; readonly suit: Suit }
  | { readonly zone: 'tableau'; readonly pile: number }

export type FreeCellMove = {
  readonly type: 'move'
  readonly from: FreeCellSource
  readonly to: FreeCellTarget
}
export type FreeCellAction = FreeCellMove | { readonly type: 'resign' }

export interface FreeCellState {
  readonly player: PlayerId
  readonly tableau: readonly (readonly SuitedCard[])[]
  readonly cells: readonly (SuitedCard | null)[]
  readonly foundations: Readonly<Record<Suit, readonly SuitedCard[]>>
  readonly options: FreeCellOptions
  readonly moves: number
  readonly resigned: boolean
}

export interface FreeCellView extends Omit<FreeCellState, 'player'> {
  readonly won: boolean
  readonly stuck: boolean
  readonly hint: FreeCellMove | null
  /** How many cards can be moved as one run right now (to a non-empty pile). */
  readonly maxRun: number
}

// --- Helpers -----------------------------------------------------------------------------------

export const foundationTotal = (foundations: FreeCellState['foundations']) =>
  SUITS.reduce((sum, suit) => sum + foundations[suit].length, 0)

const fitsOn = (card: SuitedCard, onto: SuitedCard) =>
  cardColor(card) !== cardColor(onto) && rankValue(card.rank) === rankValue(onto.rank) - 1

/** Is `cards` an ordered run (descending, alternating colors)? */
export function isRun(cards: readonly SuitedCard[]): boolean {
  return cards.every((card, i) => i === 0 || fitsOn(card, cards[i - 1]!))
}

/**
 * Largest run that can be moved at once: (free cells + 1) × 2^(empty piles). Moving into an empty
 * pile, that pile itself cannot be used as temporary space.
 */
export function maxMovable(state: FreeCellState, toEmptyPile: boolean): number {
  const freeCells = state.cells.filter((c) => c === null).length
  const emptyPiles = state.tableau.filter((p) => p.length === 0).length - (toEmptyPile ? 1 : 0)
  return (freeCells + 1) * 2 ** Math.max(0, emptyPiles)
}

function takeCards(state: FreeCellState, from: FreeCellSource): readonly SuitedCard[] {
  if (from.zone === 'cell') {
    const card = state.cells[from.index]
    return card ? [card] : []
  }
  if (from.zone === 'foundation') return state.foundations[from.suit].slice(-1)
  return state.tableau[from.pile]?.slice(from.index) ?? []
}

export function isValidMove(state: FreeCellState, from: FreeCellSource, to: FreeCellTarget) {
  const cards = takeCards(state, from)
  const first = cards[0]
  if (!first) return false
  if (from.zone === 'tableau' && !isRun(cards)) return false

  switch (to.zone) {
    case 'foundation':
      return (
        from.zone !== 'foundation' &&
        cards.length === 1 &&
        first.suit === to.suit &&
        canFound(first, state.foundations[to.suit])
      )
    case 'cell':
      return from.zone === 'tableau' && cards.length === 1 && state.cells[to.index] === null
    case 'tableau': {
      if (from.zone === 'tableau' && from.pile === to.pile) return false
      const pile = state.tableau[to.pile]
      if (!pile) return false
      const top = pile.at(-1)
      if (top && !fitsOn(first, top)) return false
      return cards.length <= maxMovable(state, !top)
    }
  }
}

/** Safe to put away: no card that could still be built on it is left outside the foundations. */
function isSafeToFound(card: SuitedCard, foundations: FreeCellState['foundations']) {
  if (!canFound(card, foundations[card.suit])) return false
  const value = rankValue(card.rank)
  if (value <= 2) return true
  const opposite = SUITS.filter((s) => cardColor({ ...card, suit: s }) !== cardColor(card))
  return opposite.every((s) => foundations[s].length >= value - 1)
}

function applyMove(state: FreeCellState, { from, to }: FreeCellMove): FreeCellState {
  const cards = takeCards(state, from)
  let { tableau, cells, foundations } = state

  if (from.zone === 'cell') cells = cells.map((c, i) => (i === from.index ? null : c))
  else if (from.zone === 'foundation') {
    foundations = { ...foundations, [from.suit]: foundations[from.suit].slice(0, -1) }
  } else tableau = tableau.map((p, i) => (i === from.pile ? p.slice(0, from.index) : p))

  if (to.zone === 'cell') cells = cells.map((c, i) => (i === to.index ? cards[0]! : c))
  else if (to.zone === 'foundation') {
    foundations = { ...foundations, [to.suit]: [...foundations[to.suit], ...cards] }
  } else tableau = tableau.map((p, i) => (i === to.pile ? [...p, ...cards] : p))

  return { ...state, tableau, cells, foundations }
}

/** Repeatedly moves safe cards from piles and cells to the foundations. */
function autoFound(state: FreeCellState): FreeCellState {
  let current = state
  for (let changed = true; changed;) {
    changed = false
    const candidates: FreeCellSource[] = [
      ...current.cells.flatMap((c, index) => (c ? [{ zone: 'cell' as const, index }] : [])),
      ...current.tableau.flatMap((p, pile) =>
        p.length ? [{ zone: 'tableau' as const, pile, index: p.length - 1 }] : [],
      ),
    ]
    for (const from of candidates) {
      const card = takeCards(current, from)[0]!
      if (isSafeToFound(card, current.foundations)) {
        current = applyMove(current, {
          type: 'move',
          from,
          to: { zone: 'foundation', suit: card.suit },
        })
        changed = true
        break
      }
    }
  }
  return current
}

/** Every allowed card move (only the first free cell is offered, they are all equivalent). */
export function moveActions(state: FreeCellState): FreeCellMove[] {
  const sources: FreeCellSource[] = [
    ...state.cells.flatMap((c, index) => (c ? [{ zone: 'cell' as const, index }] : [])),
    ...SUITS.filter((suit) => state.foundations[suit].length > 0).map((suit) => ({
      zone: 'foundation' as const,
      suit,
    })),
  ]
  state.tableau.forEach((pile, index) => {
    for (let i = pile.length - 1; i >= 0; i--) {
      if (!isRun(pile.slice(i))) break
      sources.push({ zone: 'tableau', pile: index, index: i })
    }
  })
  const firstFreeCell = state.cells.indexOf(null)
  const targets: FreeCellTarget[] = [
    ...SUITS.map((suit) => ({ zone: 'foundation' as const, suit })),
    ...(firstFreeCell >= 0 ? [{ zone: 'cell' as const, index: firstFreeCell }] : []),
    ...state.tableau.map((_, pile) => ({ zone: 'tableau' as const, pile })),
  ]
  const moves: FreeCellMove[] = []
  for (const from of sources) {
    for (const to of targets) {
      if (isValidMove(state, from, to)) moves.push({ type: 'move', from, to })
    }
  }
  return moves
}

/**
 * A useful next move, or null if no card can move at all. Preference: foundation, free cell back
 * into the tableau, a run onto another pile that uncovers or empties something, a run into an empty
 * pile that uncovers something, finally parking a card in a free cell.
 */
export function findHint(state: FreeCellState): FreeCellMove | null {
  if (state.resigned || foundationTotal(state.foundations) === 52) return null
  let best: { move: FreeCellMove; rank: number } | null = null
  const offer = (move: FreeCellMove, rank: number) => {
    if (!best || rank < best.rank) best = { move, rank }
  }
  for (const move of moveActions(state)) {
    const { from, to } = move
    if (to.zone === 'foundation') offer(move, 1)
    else if (from.zone === 'cell' && to.zone === 'tableau') {
      offer(move, state.tableau[to.pile]!.length > 0 ? 2 : 6)
    } else if (from.zone === 'tableau' && to.zone === 'tableau') {
      const pile = state.tableau[from.pile]!
      const below = pile[from.index - 1]
      const sitsInRun = below !== undefined && fitsOn(pile[from.index]!, below)
      if (sitsInRun) continue // moving would only shift an ordered run around
      const toEmpty = state.tableau[to.pile]!.length === 0
      if (!toEmpty) offer(move, 3)
      else if (from.index > 0) offer(move, 4)
    } else if (to.zone === 'cell' && from.zone === 'tableau') {
      const pile = state.tableau[from.pile]!
      const below = pile[from.index - 1]
      // Parking a lone card or one that sits in an ordered run frees nothing; the next hint would
      // just put it back.
      if (!below || fitsOn(pile[from.index]!, below)) continue
      offer(move, below && canFound(below, state.foundations[below.suit]) ? 5 : 7)
    } else if (from.zone !== 'foundation') offer(move, 8)
  }
  return (best as { move: FreeCellMove } | null)?.move ?? null
}

// --- Game definition ---------------------------------------------------------------------------

export const freeCellGame = defineGame<
  FreeCellState,
  FreeCellAction,
  FreeCellOptions,
  FreeCellView
>({
  id: 'freecell',
  name: 'FreeCell',
  players: { min: 1, max: 1 },
  defaultOptions: DEFAULT_FREECELL_OPTIONS,
  optionFields: [
    {
      type: 'boolean',
      key: 'autoFoundation',
      label: 'Automatisch ablegen',
      description: 'Karten, die nicht mehr gebraucht werden, wandern von selbst auf die Ablagen.',
    },
  ],

  setup({ players, options, seed }) {
    const deck = Rng.fromSeed(seed).shuffle(createDeck('standard52')) as SuitedCard[]
    const tableau: SuitedCard[][] = Array.from({ length: PILE_COUNT }, () => [])
    deck.forEach((card, i) => tableau[i % PILE_COUNT]!.push(card))
    return {
      player: players[0]!.id,
      tableau,
      cells: Array.from({ length: CELL_COUNT }, () => null),
      foundations: { clubs: [], spades: [], hearts: [], diamonds: [] },
      options,
      moves: 0,
      resigned: false,
    }
  },

  currentPlayer: (state) => state.player,

  legalActions: (state) => [...moveActions(state), { type: 'resign' }],

  validateAction(state, _player, action) {
    if (action.type === 'resign') return null
    return isValidMove(state, action.from, action.to) ? null : 'Dieser Zug ist nicht erlaubt'
  },

  applyAction(state, _player, action) {
    if (action.type === 'resign') return { ...state, resigned: true }
    const moved = { ...applyMove(state, action), moves: state.moves + 1 }
    return state.options.autoFoundation ? autoFound(moved) : moved
  },

  playerView(state) {
    const { player: _player, ...rest } = state
    const hint = findHint(state)
    const won = foundationTotal(state.foundations) === 52
    return {
      ...rest,
      won,
      hint,
      stuck: !won && !state.resigned && hint === null,
      maxRun: maxMovable(state, false),
    }
  },

  isTerminal: (state) => state.resigned || foundationTotal(state.foundations) === 52,

  result(state): GameResult {
    const placed = foundationTotal(state.foundations)
    return {
      scores: { [state.player]: placed },
      winners: placed === 52 ? [state.player] : [],
      scoreLabel: 'Abgelegte Karten',
    }
  },

  statFields: [
    { key: 'moves', label: 'Züge' },
    { key: 'foundationCards', label: 'Abgelegte Karten' },
  ],

  summarize: ({ finalState }) => ({
    moves: finalState.moves,
    foundationCards: foundationTotal(finalState.foundations),
  }),
})

/** Tap: foundation first, then onto a pile with cards, then an empty pile, then a free cell. */
export function bestFreeCellMove(
  legal: readonly FreeCellAction[],
  from: FreeCellSource,
  view: Pick<FreeCellView, 'tableau'>,
): FreeCellMove | null {
  const same = (a: FreeCellSource) => JSON.stringify(a) === JSON.stringify(from)
  const moves = legal.filter((a): a is FreeCellMove => a.type === 'move' && same(a.from))
  const score = (m: FreeCellMove) => {
    if (m.to.zone === 'foundation') return 0
    if (m.to.zone === 'tableau') return view.tableau[m.to.pile]!.length > 0 ? 1 : 2
    return 3
  }
  return [...moves].sort((a, b) => score(a) - score(b))[0] ?? null
}
