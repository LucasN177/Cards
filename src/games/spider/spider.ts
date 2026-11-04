/**
 * Spider solitaire rules. Pure and deterministic; see `SpiderRules.tsx` for the rule text.
 */
import {
  createDeck,
  defineGame,
  type GameResult,
  type PlayerId,
  RANKS,
  Rng,
  type Suit,
  type SuitedCard,
} from '@/engine'
import { rankValue } from '@/games/klondike/klondike'

export interface SpiderOptions {
  /** Number of suits in the 104 cards: 1 (easy), 2 (medium) or 4 (hard). */
  readonly suits: 1 | 2 | 4
}

export const DEFAULT_SPIDER_OPTIONS: SpiderOptions = { suits: 1 }

export const PILE_COUNT = 10
export const RUNS_TO_WIN = 8

export interface SpiderPile {
  readonly cards: readonly SuitedCard[]
  /** The first `hidden` cards lie face down. */
  readonly hidden: number
}

export type SpiderSource = {
  readonly zone: 'tableau'
  readonly pile: number
  readonly index: number
}
export type SpiderTarget = { readonly zone: 'tableau'; readonly pile: number }
export type SpiderMove = {
  readonly type: 'move'
  readonly from: SpiderSource
  readonly to: SpiderTarget
}
export type SpiderAction = SpiderMove | { readonly type: 'deal' } | { readonly type: 'resign' }
export type SpiderHint = SpiderMove | { readonly type: 'deal' }

export interface SpiderState {
  readonly player: PlayerId
  readonly tableau: readonly SpiderPile[]
  /** Dealt ten at a time, one onto every pile. */
  readonly stock: readonly SuitedCard[]
  /** Suit of every finished King-to-Ace run, in the order they were completed. */
  readonly completed: readonly Suit[]
  readonly options: SpiderOptions
  readonly moves: number
  readonly resigned: boolean
}

export interface SpiderView {
  readonly tableau: readonly { readonly hidden: number; readonly cards: readonly SuitedCard[] }[]
  readonly stockCount: number
  readonly completed: readonly Suit[]
  readonly options: SpiderOptions
  readonly moves: number
  readonly won: boolean
  readonly resigned: boolean
  readonly canDeal: boolean
  readonly hint: SpiderHint | null
  readonly stuck: boolean
}

const SUIT_SETS: Readonly<Record<SpiderOptions['suits'], readonly Suit[]>> = {
  1: ['spades'],
  2: ['spades', 'hearts'],
  4: ['spades', 'hearts', 'clubs', 'diamonds'],
}

// --- Helpers -----------------------------------------------------------------------------------

/** Same suit, each card one lower than the one below it. */
export function isSuitRun(cards: readonly SuitedCard[]): boolean {
  return cards.every(
    (card, i) =>
      i === 0 ||
      (card.suit === cards[i - 1]!.suit &&
        rankValue(card.rank) === rankValue(cards[i - 1]!.rank) - 1),
  )
}

/** Any suit may be put onto a card one rank higher; an empty pile takes anything. */
const fitsOn = (card: SuitedCard, onto: SuitedCard | undefined) =>
  !onto || rankValue(card.rank) === rankValue(onto.rank) - 1

export function isValidMove(state: SpiderState, from: SpiderSource, to: SpiderTarget) {
  if (from.pile === to.pile) return false
  const source = state.tableau[from.pile]
  const target = state.tableau[to.pile]
  if (!source || !target || from.index < source.hidden) return false
  const cards = source.cards.slice(from.index)
  return cards.length > 0 && isSuitRun(cards) && fitsOn(cards[0]!, target.cards.at(-1))
}

export const canDeal = (state: SpiderState) =>
  state.stock.length > 0 && state.tableau.every((pile) => pile.cards.length > 0)

/** Turns up a new top card and removes a finished King-to-Ace run. */
function settle(pile: SpiderPile, completed: Suit[]): SpiderPile {
  let { cards, hidden } = pile
  const top13 = cards.slice(-13)
  if (
    top13.length === 13 &&
    cards.length - 13 >= hidden &&
    top13[0]!.rank === 'K' &&
    isSuitRun(top13)
  ) {
    completed.push(top13[0]!.suit)
    cards = cards.slice(0, -13)
  }
  if (cards.length > 0 && hidden >= cards.length) hidden = cards.length - 1
  if (cards.length === 0) hidden = 0
  return { cards, hidden }
}

export function moveActions(state: SpiderState): SpiderMove[] {
  const moves: SpiderMove[] = []
  state.tableau.forEach((pile, index) => {
    for (let i = pile.cards.length - 1; i >= pile.hidden; i--) {
      if (!isSuitRun(pile.cards.slice(i))) break
      for (let to = 0; to < PILE_COUNT; to++) {
        const from = { zone: 'tableau' as const, pile: index, index: i }
        const target = { zone: 'tableau' as const, pile: to }
        if (isValidMove(state, from, target)) moves.push({ type: 'move', from, to: target })
      }
    }
  })
  return moves
}

/**
 * A useful next step, or null if nothing can make progress. Preference: a run that uncovers a
 * hidden card, a same-suit build, a build that frees a card, filling an empty pile so dealing
 * becomes possible, and finally dealing new cards. Emptying a pile on its own is never suggested:
 * the next hint would fill it again, and hints must never run in circles.
 */
export function findHint(state: SpiderState): SpiderHint | null {
  if (state.resigned || state.completed.length === RUNS_TO_WIN) return null
  let best: { hint: SpiderHint; rank: number } | null = null
  const offer = (hint: SpiderHint, rank: number) => {
    if (!best || rank < best.rank) best = { hint, rank }
  }
  const emptyPiles = state.tableau.filter((p) => p.cards.length === 0).length

  for (const move of moveActions(state)) {
    const source = state.tableau[move.from.pile]!
    const target = state.tableau[move.to.pile]!
    const base = source.cards[move.from.index]!
    const below = source.cards[move.from.index - 1]
    const top = target.cards.at(-1)
    // Already sitting on a fitting card of the same suit: moving would only break a run.
    const inSuitRun =
      below !== undefined &&
      move.from.index > source.hidden &&
      below.suit === base.suit &&
      rankValue(below.rank) === rankValue(base.rank) + 1
    if (inSuitRun) continue
    const uncovers = move.from.index === source.hidden && source.hidden > 0

    if (top) {
      if (uncovers) offer(move, top.suit === base.suit ? 1 : 2)
      else if (top.suit === base.suit) offer(move, 3)
      else if (below && rankValue(below.rank) !== rankValue(base.rank) + 1) offer(move, 5)
    } else if (uncovers) {
      offer(move, 6)
    } else if (move.from.index > 0 && state.stock.length > 0 && emptyPiles > 0) {
      offer(move, 7) // fills an empty pile so the stock can be dealt again
    }
  }
  if (canDeal(state)) offer({ type: 'deal' }, 8)
  return (best as { hint: SpiderHint } | null)?.hint ?? null
}

// --- Game definition ---------------------------------------------------------------------------

export const spiderGame = defineGame<SpiderState, SpiderAction, SpiderOptions, SpiderView>({
  id: 'spider',
  name: 'Spider Solitär',
  players: { min: 1, max: 1 },
  defaultOptions: DEFAULT_SPIDER_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'suits',
      label: 'Farben',
      description: 'Mit einer Farbe ist Spider gut lösbar, mit vier eine echte Herausforderung.',
      choices: [
        { value: 1, label: 'Eine' },
        { value: 2, label: 'Zwei' },
        { value: 4, label: 'Vier' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const suits = SUIT_SETS[options.suits]
    const deck = Rng.fromSeed(seed).shuffle(
      createDeck({ ranks: RANKS, suits, copies: 8 / suits.length }),
    ) as SuitedCard[]
    const tableau: SpiderPile[] = []
    let next = 0
    for (let pile = 0; pile < PILE_COUNT; pile++) {
      const size = pile < 4 ? 6 : 5
      tableau.push({ cards: deck.slice(next, next + size), hidden: size - 1 })
      next += size
    }
    return {
      player: players[0]!.id,
      tableau,
      stock: deck.slice(next),
      completed: [],
      options,
      moves: 0,
      resigned: false,
    }
  },

  currentPlayer: (state) => state.player,

  legalActions: (state) => [
    ...moveActions(state),
    ...(canDeal(state) ? [{ type: 'deal' as const }] : []),
    { type: 'resign' },
  ],

  validateAction(state, _player, action) {
    if (action.type === 'resign') return null
    if (action.type === 'deal') {
      if (state.stock.length === 0) return 'Der Stapel ist leer'
      return canDeal(state) ? null : 'Vor dem Austeilen muss jede Reihe mindestens eine Karte haben'
    }
    return isValidMove(state, action.from, action.to) ? null : 'Dieser Zug ist nicht erlaubt'
  },

  applyAction(state, _player, action) {
    if (action.type === 'resign') return { ...state, resigned: true }
    const completed = [...state.completed]

    if (action.type === 'deal') {
      const dealt = state.stock.slice(-PILE_COUNT)
      const tableau = state.tableau.map((pile, i) =>
        settle({ ...pile, cards: [...pile.cards, dealt[i]!] }, completed),
      )
      return {
        ...state,
        tableau,
        stock: state.stock.slice(0, -PILE_COUNT),
        completed,
        moves: state.moves + 1,
      }
    }

    const { from, to } = action
    const cards = state.tableau[from.pile]!.cards.slice(from.index)
    const tableau = state.tableau.map((pile, i) => {
      if (i === from.pile)
        return settle({ ...pile, cards: pile.cards.slice(0, from.index) }, completed)
      if (i === to.pile) return settle({ ...pile, cards: [...pile.cards, ...cards] }, completed)
      return pile
    })
    return { ...state, tableau, completed, moves: state.moves + 1 }
  },

  playerView(state) {
    const hint = findHint(state)
    const won = state.completed.length === RUNS_TO_WIN
    return {
      tableau: state.tableau.map((p) => ({ hidden: p.hidden, cards: p.cards.slice(p.hidden) })),
      stockCount: state.stock.length,
      completed: state.completed,
      options: state.options,
      moves: state.moves,
      won,
      resigned: state.resigned,
      canDeal: canDeal(state),
      hint,
      stuck: !won && !state.resigned && hint === null,
    }
  },

  isTerminal: (state) => state.resigned || state.completed.length === RUNS_TO_WIN,

  result(state): GameResult {
    return {
      scores: { [state.player]: state.completed.length },
      winners: state.completed.length === RUNS_TO_WIN ? [state.player] : [],
      scoreLabel: 'Fertige Folgen',
    }
  },

  statFields: [
    { key: 'moves', label: 'Züge' },
    { key: 'runs', label: 'Fertige Folgen' },
  ],

  summarize: ({ finalState }) => ({
    moves: finalState.moves,
    runs: finalState.completed.length,
  }),
})

/** Tap: onto the same suit first, then any fitting card, then an empty pile. */
export function bestSpiderMove(
  legal: readonly SpiderAction[],
  from: SpiderSource,
  view: Pick<SpiderView, 'tableau'>,
): SpiderMove | null {
  const moves = legal.filter(
    (a): a is SpiderMove =>
      a.type === 'move' && a.from.pile === from.pile && a.from.index === from.index,
  )
  const base = view.tableau[from.pile]!.cards[from.index - view.tableau[from.pile]!.hidden]
  const score = (m: SpiderMove) => {
    const top = view.tableau[m.to.pile]!.cards.at(-1)
    if (!top) return 2
    return top.suit === base?.suit ? 0 : 1
  }
  return [...moves].sort((a, b) => score(a) - score(b))[0] ?? null
}
