/**
 * Klondike solitaire rules. Pure and deterministic; see `KlondikeRules.tsx` for the rule text.
 */
import {
  cardColor,
  createDeck,
  defineGame,
  type GameResult,
  type PlayerId,
  type Rank,
  RANKS,
  Rng,
  type Suit,
  SUITS,
  type SuitedCard,
} from '@/engine'

// --- Types -------------------------------------------------------------------------------------

export interface KlondikeOptions {
  /** Cards turned from the stock at once. */
  readonly drawCount: 1 | 3
}

export const DEFAULT_KLONDIKE_OPTIONS: KlondikeOptions = { drawCount: 1 }

/** A tableau pile: the first `hidden` cards lie face down. */
export interface Pile {
  readonly cards: readonly SuitedCard[]
  readonly hidden: number
}

export type Source =
  | { readonly zone: 'waste' }
  | { readonly zone: 'foundation'; readonly suit: Suit }
  /** `index` is the position in the pile; the card and everything on top of it move. */
  | { readonly zone: 'tableau'; readonly pile: number; readonly index: number }

export type Target =
  | { readonly zone: 'foundation'; readonly suit: Suit }
  | { readonly zone: 'tableau'; readonly pile: number }

export type KlondikeAction =
  | { readonly type: 'draw' }
  | { readonly type: 'move'; readonly from: Source; readonly to: Target }
  | { readonly type: 'resign' }

export interface KlondikeState {
  readonly player: PlayerId
  readonly tableau: readonly Pile[]
  /** Last element is the top card. */
  readonly stock: readonly SuitedCard[]
  /** Last element is the top (playable) card. */
  readonly waste: readonly SuitedCard[]
  readonly foundations: Readonly<Record<Suit, readonly SuitedCard[]>>
  readonly options: KlondikeOptions
  readonly moves: number
  /** How often the waste was turned over into a new stock. */
  readonly recycles: number
  readonly resigned: boolean
}

export interface KlondikeView {
  /** Face-down cards are only counted, never revealed. */
  readonly tableau: readonly { readonly hidden: number; readonly cards: readonly SuitedCard[] }[]
  readonly stockCount: number
  readonly waste: readonly SuitedCard[]
  readonly foundations: Readonly<Record<Suit, readonly SuitedCard[]>>
  readonly options: KlondikeOptions
  readonly moves: number
  readonly recycles: number
  readonly won: boolean
  readonly resigned: boolean
  /** No move can make progress any more (see `isStuck`). */
  readonly stuck: boolean
  /** Suggested next step for the hint button. */
  readonly hint: KlondikeHint | null
}

// --- Helpers -----------------------------------------------------------------------------------

/** Ace = 1 … King = 13. */
export const rankValue = (rank: Rank) => (rank === 'A' ? 1 : RANKS.indexOf(rank) + 2)

/** May `card` be put onto `onto` in the tableau (`undefined` = empty pile)? */
export function canStack(card: SuitedCard, onto: SuitedCard | undefined): boolean {
  if (!onto) return card.rank === 'K'
  return cardColor(card) !== cardColor(onto) && rankValue(card.rank) === rankValue(onto.rank) - 1
}

/** May `card` be put onto its suit's foundation? */
export function canFound(card: SuitedCard, foundation: readonly SuitedCard[]): boolean {
  const top = foundation.at(-1)
  return top ? rankValue(card.rank) === rankValue(top.rank) + 1 : card.rank === 'A'
}

export const foundationCount = (foundations: KlondikeState['foundations']) =>
  SUITS.reduce((sum, suit) => sum + foundations[suit].length, 0)

const emptyFoundations = (): Record<Suit, SuitedCard[]> => ({
  clubs: [],
  spades: [],
  hearts: [],
  diamonds: [],
})

/** Cards that leave `from` (in order, bottom first). */
function takeCards(state: KlondikeState, from: Source): readonly SuitedCard[] {
  if (from.zone === 'waste') return state.waste.slice(-1)
  if (from.zone === 'foundation') return state.foundations[from.suit].slice(-1)
  return state.tableau[from.pile]?.cards.slice(from.index) ?? []
}

function isValidMove(state: KlondikeState, from: Source, to: Target): boolean {
  const cards = takeCards(state, from)
  const first = cards[0]
  if (!first) return false
  if (from.zone === 'tableau') {
    const pile = state.tableau[from.pile]!
    if (from.index < pile.hidden) return false
    if (to.zone === 'tableau' && to.pile === from.pile) return false
  }
  if (to.zone === 'foundation') {
    if (from.zone === 'foundation') return false
    return (
      cards.length === 1 && first.suit === to.suit && canFound(first, state.foundations[to.suit])
    )
  }
  return canStack(first, state.tableau[to.pile]?.cards.at(-1))
}

type MoveAction = Extract<KlondikeAction, { type: 'move' }>

/** Every card move that is allowed right now. */
function moveActions(state: KlondikeState): MoveAction[] {
  const sources: Source[] = []
  if (state.waste.length > 0) sources.push({ zone: 'waste' })
  for (const suit of SUITS) {
    if (state.foundations[suit].length > 0) sources.push({ zone: 'foundation', suit })
  }
  state.tableau.forEach((pile, index) => {
    for (let i = pile.hidden; i < pile.cards.length; i++) {
      sources.push({ zone: 'tableau', pile: index, index: i })
    }
  })
  const targets: Target[] = [
    ...SUITS.map((suit) => ({ zone: 'foundation' as const, suit })),
    ...state.tableau.map((_, pile) => ({ zone: 'tableau' as const, pile })),
  ]
  const moves: MoveAction[] = []
  for (const from of sources) {
    for (const to of targets) {
      if (isValidMove(state, from, to)) moves.push({ type: 'move', from, to })
    }
  }
  return moves
}

/**
 * Cards that can become the playable top of the waste just by turning the stock, without any
 * other move. With three cards per turn only every third card comes up; the order repeats after
 * one pass, so simulating two passes finds all of them.
 */
export function reachableStockCards(state: KlondikeState): SuitedCard[] {
  const total = state.stock.length + state.waste.length
  if (total === 0) return []
  if (state.options.drawCount === 1) return [...state.stock, ...state.waste]

  let stock = [...state.stock]
  let waste = [...state.waste]
  const seen = new Map<string, SuitedCard>()
  const remember = () => {
    const top = waste.at(-1)
    if (top) seen.set(top.id, top)
  }
  remember()
  for (let i = 0; i < 2 * (Math.ceil(total / 3) + 1) + 2; i++) {
    if (stock.length === 0) {
      stock = [...waste].reverse()
      waste = []
      continue
    }
    waste.push(...stock.splice(-Math.min(3, stock.length)).reverse())
    remember()
  }
  return [...seen.values()]
}

/** A suggested next step: a card move, or turning the stock. */
export type KlondikeHint = MoveAction | { readonly type: 'draw' }

/**
 * The most useful next step, or null if no move can make progress any more. In order of
 * preference: a card to a foundation, uncovering a hidden card, a waste card into the tableau,
 * freeing a card for its foundation, an empty pile for a waiting king, taking a foundation card
 * back so something fits onto it, and finally turning the stock towards a card that fits.
 * Moves that only shift cards back and forth never count. Errs on the side of finding a hint, so
 * a winnable game is never reported as stuck.
 */
export function findHint(state: KlondikeState): KlondikeHint | null {
  if (state.resigned || foundationCount(state.foundations) === 52) return null
  const tops = state.tableau.map((pile) => pile.cards.at(-1))
  const fits = (card: SuitedCard) =>
    canFound(card, state.foundations[card.suit]) || tops.some((top) => canStack(card, top))
  const stockCards = reachableStockCards(state)
  // A king that would profit from an empty pile (it lies on hidden cards or in the stock).
  const kingWaiting =
    stockCards.some((c) => c.rank === 'K') ||
    state.tableau.some((pile) => pile.hidden > 0 && pile.cards[pile.hidden]?.rank === 'K')

  let best: { hint: KlondikeHint; rank: number } | null = null
  const offer = (hint: KlondikeHint, rank: number) => {
    if (!best || rank < best.rank) best = { hint, rank }
  }

  for (const move of moveActions(state)) {
    const { from, to } = move
    if (to.zone === 'foundation') {
      offer(move, 1)
      continue
    }
    if (from.zone === 'waste') {
      offer(move, 3)
      continue
    }
    if (from.zone === 'foundation') {
      // Taking a card back only helps if something then fits onto it.
      const card = state.foundations[from.suit].at(-1)!
      const others = [...stockCards, ...state.tableau.flatMap((p) => p.cards.slice(p.hidden))]
      if (others.some((c) => canStack(c, card))) offer(move, 6)
      continue
    }
    const pile = state.tableau[from.pile]!
    if (from.index === pile.hidden && pile.hidden > 0)
      offer(move, 2) // uncovers a card
    else if (from.index === 0 && kingWaiting && state.tableau[to.pile]!.cards.length > 0) {
      offer(move, 5) // empties a pile for a king
    } else {
      const below = pile.cards[from.index - 1]
      if (from.index > pile.hidden && below && canFound(below, state.foundations[below.suit])) {
        offer(move, 4) // frees a card for its foundation
      }
    }
  }
  if (!best && stockCards.some(fits)) offer({ type: 'draw' }, 7)
  return (best as { hint: KlondikeHint } | null)?.hint ?? null
}

/** True when no move can make progress any more (see `findHint`). */
export const isStuck = (state: KlondikeState) =>
  !state.resigned && foundationCount(state.foundations) < 52 && findHint(state) === null

function withHint(state: KlondikeState) {
  const hint = findHint(state)
  const over = state.resigned || foundationCount(state.foundations) === 52
  return { hint, stuck: !over && hint === null }
}

// --- Game definition ---------------------------------------------------------------------------

export const klondikeGame = defineGame<
  KlondikeState,
  KlondikeAction,
  KlondikeOptions,
  KlondikeView
>({
  id: 'klondike',
  name: 'Solitär',
  players: { min: 1, max: 1 },
  defaultOptions: DEFAULT_KLONDIKE_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'drawCount',
      label: 'Karten ziehen',
      description: 'Wie viele Karten vom Stapel aufgedeckt werden. Drei ist deutlich schwerer.',
      choices: [
        { value: 1, label: 'Eine' },
        { value: 3, label: 'Drei' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const deck = Rng.fromSeed(seed).shuffle(createDeck('standard52')) as SuitedCard[]
    const tableau: Pile[] = []
    let next = 0
    for (let pile = 0; pile < 7; pile++) {
      tableau.push({ cards: deck.slice(next, next + pile + 1), hidden: pile })
      next += pile + 1
    }
    return {
      player: players[0]!.id,
      tableau,
      stock: deck.slice(next),
      waste: [],
      foundations: emptyFoundations(),
      options,
      moves: 0,
      recycles: 0,
      resigned: false,
    }
  },

  currentPlayer: (state) => state.player,

  legalActions(state) {
    const actions: KlondikeAction[] = []
    if (state.stock.length > 0 || state.waste.length > 0) actions.push({ type: 'draw' })
    actions.push(...moveActions(state))
    actions.push({ type: 'resign' })
    return actions
  },

  validateAction(state, _player, action) {
    if (action.type === 'resign') return null
    if (action.type === 'draw') {
      return state.stock.length > 0 || state.waste.length > 0 ? null : 'Der Stapel ist leer'
    }
    return isValidMove(state, action.from, action.to) ? null : 'Dieser Zug ist nicht erlaubt'
  },

  applyAction(state, _player, action) {
    if (action.type === 'resign') return { ...state, resigned: true }

    if (action.type === 'draw') {
      if (state.stock.length === 0) {
        return {
          ...state,
          stock: [...state.waste].reverse(),
          waste: [],
          recycles: state.recycles + 1,
          moves: state.moves + 1,
        }
      }
      const count = Math.min(state.options.drawCount, state.stock.length)
      const turned = state.stock.slice(-count).reverse()
      return {
        ...state,
        stock: state.stock.slice(0, -count),
        waste: [...state.waste, ...turned],
        moves: state.moves + 1,
      }
    }

    const { from, to } = action
    const cards = takeCards(state, from)
    let { tableau, waste, foundations } = state

    if (from.zone === 'waste') waste = waste.slice(0, -1)
    else if (from.zone === 'foundation') {
      foundations = { ...foundations, [from.suit]: foundations[from.suit].slice(0, -1) }
    } else {
      tableau = tableau.map((pile, i) => {
        if (i !== from.pile) return pile
        const rest = pile.cards.slice(0, from.index)
        // The card that becomes the top is turned face up automatically.
        return { cards: rest, hidden: Math.min(pile.hidden, Math.max(0, rest.length - 1)) }
      })
    }

    if (to.zone === 'foundation') {
      foundations = { ...foundations, [to.suit]: [...foundations[to.suit], ...cards] }
    } else {
      tableau = tableau.map((pile, i) =>
        i === to.pile ? { ...pile, cards: [...pile.cards, ...cards] } : pile,
      )
    }
    return { ...state, tableau, waste, foundations, moves: state.moves + 1 }
  },

  playerView: (state) => ({
    tableau: state.tableau.map((pile) => ({
      hidden: pile.hidden,
      cards: pile.cards.slice(pile.hidden),
    })),
    stockCount: state.stock.length,
    waste: state.waste,
    foundations: state.foundations,
    options: state.options,
    moves: state.moves,
    recycles: state.recycles,
    won: foundationCount(state.foundations) === 52,
    resigned: state.resigned,
    ...withHint(state),
  }),

  isTerminal: (state) => state.resigned || foundationCount(state.foundations) === 52,

  result(state): GameResult {
    const placed = foundationCount(state.foundations)
    return {
      scores: { [state.player]: placed },
      winners: placed === 52 ? [state.player] : [],
      scoreLabel: 'Abgelegte Karten',
    }
  },

  describeAction(action) {
    if (action.type !== 'move') return action.type
    const from =
      action.from.zone === 'tableau'
        ? `pile ${action.from.pile}[${action.from.index}]`
        : action.from.zone
    const to =
      action.to.zone === 'tableau' ? `pile ${action.to.pile}` : `foundation ${action.to.suit}`
    return `move ${from} → ${to}`
  },

  statFields: [
    { key: 'moves', label: 'Züge' },
    { key: 'recycles', label: 'Stapeldurchgänge' },
    { key: 'foundationCards', label: 'Abgelegte Karten' },
  ],

  summarize: ({ finalState }) => ({
    moves: finalState.moves,
    recycles: finalState.recycles,
    foundationCards: foundationCount(finalState.foundations),
  }),
})

// --- Helpers for the UI ------------------------------------------------------------------------

const sameSource = (a: Source, b: Source) =>
  a.zone === b.zone &&
  (a.zone !== 'foundation' || a.suit === (b as typeof a).suit) &&
  (a.zone !== 'tableau' || (a.pile === (b as typeof a).pile && a.index === (b as typeof a).index))

/**
 * The move a tap on `from` should make: to a foundation if possible, otherwise to the first
 * tableau pile that accepts it. Skips pointless moves (a king that already lies alone on the
 * bottom of its pile to another empty pile).
 */
export function bestMove(
  view: KlondikeView,
  legal: readonly KlondikeAction[],
  from: Source,
): MoveAction | null {
  const moves = legal.filter((a): a is MoveAction => a.type === 'move' && sameSource(a.from, from))
  const toFoundation = moves.find((m) => m.to.zone === 'foundation')
  if (toFoundation) return toFoundation

  const pointless = (m: MoveAction) => {
    if (m.from.zone !== 'tableau' || m.to.zone !== 'tableau') return false
    const pile = view.tableau[m.from.pile]!
    const empty = view.tableau[m.to.pile]!.cards.length === 0
    return empty && m.from.index === 0 && pile.hidden === 0
  }
  const useful = moves.filter((m) => !pointless(m) && m.to.zone === 'tableau')
  const ontoCards = useful.find(
    (m) => m.to.zone === 'tableau' && view.tableau[m.to.pile]!.cards.length > 0,
  )
  return ontoCards ?? useful[0] ?? null
}

/** All cards visible and stock empty: the rest can be put away automatically. */
export const canAutoFinish = (view: KlondikeView) =>
  !view.won &&
  !view.resigned &&
  view.stockCount === 0 &&
  view.waste.length === 0 &&
  view.tableau.every((pile) => pile.hidden === 0)

/** The next move of the automatic finish (always a foundation move), or null. */
export function nextFoundationMove(legal: readonly KlondikeAction[]): MoveAction | null {
  return (
    legal.find(
      (a): a is MoveAction =>
        a.type === 'move' && a.to.zone === 'foundation' && a.from.zone !== 'foundation',
    ) ?? null
  )
}
