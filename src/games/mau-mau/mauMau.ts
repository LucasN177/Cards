/**
 * Mau-Mau rules. Pure and deterministic; see `MauMauRules.tsx` for the player-facing rule text.
 */
import {
  type Card,
  type CardId,
  createDeck,
  deal,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  type Rank,
  Rng,
  type RngState,
  type Suit,
  SUITS,
  type SuitedCard,
} from '@/engine'

// --- Types -------------------------------------------------------------------------------------

export interface MauMauOptions {
  readonly handSize: number
  /** 7: the next player draws two cards. */
  readonly sevenDrawsTwo: boolean
  /** A 7 can be answered with another 7; the penalty adds up. */
  readonly stackSevens: boolean
  /** 8: the next player is skipped. */
  readonly eightSkips: boolean
  /** 9: the direction of play changes. */
  readonly nineReverses: boolean
  /** A jack may be played on a jack ("Bube auf Bube"). */
  readonly jackOnJack: boolean
}

export const DEFAULT_MAU_MAU_OPTIONS: MauMauOptions = {
  handSize: 5,
  sevenDrawsTwo: true,
  stackSevens: true,
  eightSkips: true,
  nineReverses: false,
  jackOnJack: false,
}

export type MauMauAction =
  | { readonly type: 'play'; readonly cardId: CardId; readonly wish?: Suit }
  | { readonly type: 'draw' }
  | { readonly type: 'pass' }

/** What happened in the last move, for status messages and animations. */
export type MauMauEvent =
  | {
      readonly type: 'played'
      readonly player: PlayerId
      readonly card: Card
      readonly wish?: Suit
    }
  | {
      readonly type: 'drew'
      readonly player: PlayerId
      readonly count: number
      readonly penalty: boolean
      /** For a voluntary draw: the suit the player did not (or could not) serve. */
      readonly refused?: Suit
    }
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'skipped'; readonly player: PlayerId }
  | { readonly type: 'reversed' }
  | { readonly type: 'reshuffled' }

export interface MauMauState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>
  readonly stock: readonly Card[]
  /** Last element is the top card. */
  readonly discard: readonly Card[]
  readonly turn: PlayerId
  readonly direction: 1 | -1
  /** Suit wished by the last jack. */
  readonly wish: Suit | null
  /** Cards the current player has to draw because of sevens. */
  readonly pendingDraw: number
  /** Set after drawing one card: only that card may be played, otherwise pass. */
  readonly drawnCardId: CardId | null
  /** Consecutive turns in which nobody played or drew (stock and discard exhausted). */
  readonly idleTurns: number
  readonly winner: PlayerId | null
  readonly events: readonly MauMauEvent[]
  /** Recent public events (what everybody at the table saw), oldest first. */
  readonly log: readonly MauMauEvent[]
  readonly options: MauMauOptions
  readonly rng: RngState
}

export interface MauMauView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly Card[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly topCard: Card
  readonly discardCount: number
  readonly stockCount: number
  readonly turn: PlayerId
  readonly direction: 1 | -1
  readonly wish: Suit | null
  readonly pendingDraw: number
  readonly drawnCardId: CardId | null
  readonly winner: PlayerId | null
  readonly events: readonly MauMauEvent[]
  readonly log: readonly MauMauEvent[]
  readonly options: MauMauOptions
}

// --- Helpers -----------------------------------------------------------------------------------

/** Penalty points of a card left in hand at the end. */
export const CARD_POINTS: Readonly<Partial<Record<Rank, number>>> = {
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 20,
  Q: 3,
  K: 4,
  A: 11,
}

export const cardPoints = (card: Card) =>
  card.kind === 'suited' ? (CARD_POINTS[card.rank] ?? 0) : 0

export const handPoints = (cards: readonly Card[]) =>
  cards.reduce((sum, card) => sum + cardPoints(card), 0)

const isRank = (card: Card, rank: Rank): card is SuitedCard =>
  card.kind === 'suited' && card.rank === rank

export const topCard = (state: Pick<MauMauState, 'discard'>) => state.discard.at(-1)!

/** Whether `card` may be played onto the pile (ignoring pending sevens and drawn-card limits). */
export function matches(
  card: Card,
  top: Card,
  wish: Suit | null,
  options: Pick<MauMauOptions, 'jackOnJack'>,
): boolean {
  if (card.kind !== 'suited' || top.kind !== 'suited') return false
  if (card.rank === 'J') return top.rank !== 'J' || options.jackOnJack
  if (wish) return card.suit === wish
  return card.suit === top.suit || card.rank === top.rank
}

/** Cards in `hand` that may be played right now. */
export function playableCards(state: MauMauState, player: PlayerId): Card[] {
  const hand = state.hands[player] ?? []
  const top = topCard(state)
  if (state.pendingDraw > 0) {
    return state.options.stackSevens ? hand.filter((card) => isRank(card, '7')) : []
  }
  const candidates = state.drawnCardId ? hand.filter((c) => c.id === state.drawnCardId) : hand
  return candidates.filter((card) => matches(card, top, state.wish, state.options))
}

/** Draws up to `count` cards, reshuffling the discard pile (except its top card) when needed. */
function drawCards(state: MauMauState, count: number) {
  let stock = state.stock
  let discard = state.discard
  let rng = state.rng
  const events: MauMauEvent[] = []
  const drawn: Card[] = []
  while (drawn.length < count) {
    if (stock.length === 0) {
      if (discard.length <= 1) break
      const generator = new Rng(rng)
      stock = generator.shuffle(discard.slice(0, -1))
      rng = generator.state
      discard = discard.slice(-1)
      events.push({ type: 'reshuffled' })
    }
    drawn.push(stock[0]!)
    stock = stock.slice(1)
  }
  return { drawn, stock, discard, rng, events }
}

const advance = (state: MauMauState, from: PlayerId, steps = 1, direction = state.direction) =>
  nextPlayer(state.order, from, steps * direction)

const LOG_SIZE = 40

const suitOf = (card: Card) => (card.kind === 'suited' ? card.suit : undefined)

function applyMove(state: MauMauState, player: PlayerId, action: MauMauAction): MauMauState {
  const hand = state.hands[player]!

  if (action.type === 'play') {
    const card = hand.find((c) => c.id === action.cardId)!
    const rest = hand.filter((c) => c !== card)
    const events: MauMauEvent[] = [{ type: 'played', player, card, wish: action.wish }]
    const base: MauMauState = {
      ...state,
      hands: { ...state.hands, [player]: rest },
      discard: [...state.discard, card],
      wish: isRank(card, 'J') ? (action.wish ?? (card as SuitedCard).suit) : null,
      drawnCardId: null,
      idleTurns: 0,
    }
    if (rest.length === 0) return { ...base, winner: player, events }

    const { options } = state
    let direction = state.direction
    let steps = 1
    let pendingDraw = 0
    if (isRank(card, '7') && options.sevenDrawsTwo) pendingDraw = state.pendingDraw + 2
    if (isRank(card, '8') && options.eightSkips) {
      steps = 2
      events.push({ type: 'skipped', player: advance(state, player) })
    }
    if (isRank(card, '9') && options.nineReverses && state.order.length > 2) {
      direction = direction === 1 ? -1 : 1
      events.push({ type: 'reversed' })
    }
    return {
      ...base,
      direction,
      pendingDraw,
      turn: advance(state, player, steps, direction),
      events,
    }
  }

  if (action.type === 'pass') {
    return {
      ...state,
      drawnCardId: null,
      turn: advance(state, player),
      events: [{ type: 'passed', player }],
    }
  }

  // draw
  const penalty = state.pendingDraw > 0
  const { drawn, stock, discard, rng, events } = drawCards(state, penalty ? state.pendingDraw : 1)
  const next: MauMauState = {
    ...state,
    hands: { ...state.hands, [player]: [...hand, ...drawn] },
    stock,
    discard,
    rng,
    pendingDraw: 0,
    idleTurns: drawn.length === 0 ? state.idleTurns + 1 : 0,
    events: [
      ...events,
      {
        type: 'drew',
        player,
        count: drawn.length,
        penalty,
        refused: penalty ? undefined : (state.wish ?? suitOf(topCard(state))),
      },
    ],
  }
  const drawnCard = drawn[0]
  const canPlayDrawn =
    !penalty && drawnCard && matches(drawnCard, topCard(next), next.wish, next.options)
  if (canPlayDrawn) return { ...next, drawnCardId: drawnCard.id }
  return { ...next, drawnCardId: null, turn: advance(state, player) }
}

// --- Game definition ---------------------------------------------------------------------------

/** Rules without AI; index.ts adds the agents. */
export const mauMauRules = defineGame<MauMauState, MauMauAction, MauMauOptions, MauMauView>({
  id: 'mau-mau',
  name: 'Mau-Mau',
  players: { min: 2, max: 6 },
  supportsSeries: true,
  defaultOptions: DEFAULT_MAU_MAU_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'handSize',
      label: 'Karten pro Spieler',
      choices: [5, 6, 7].map((n) => ({ value: n, label: String(n) })),
    },
    {
      type: 'boolean',
      key: 'sevenDrawsTwo',
      label: '7 – Zwei ziehen',
      description: 'Der nächste Spieler muss zwei Karten ziehen.',
    },
    {
      type: 'boolean',
      key: 'stackSevens',
      label: '7 auf 7',
      description: 'Eine 7 kann mit einer 7 beantwortet werden, die Strafe addiert sich.',
    },
    {
      type: 'boolean',
      key: 'eightSkips',
      label: '8 – Aussetzen',
      description: 'Der nächste Spieler wird übersprungen.',
    },
    {
      type: 'boolean',
      key: 'nineReverses',
      label: '9 – Richtungswechsel',
      description: 'Die Spielrichtung dreht sich um.',
    },
    {
      type: 'boolean',
      key: 'jackOnJack',
      label: 'Bube auf Bube',
      description: 'Ein Bube darf auch auf einen Buben gelegt werden.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const deck = rng.shuffle(createDeck('piquet32'))
    // With many players a big hand would not leave enough cards to play with.
    const handSize = Math.min(options.handSize, Math.floor((deck.length - 6) / order.length))
    const { hands, rest } = deal(deck, order.length, handSize)
    return {
      order,
      hands: Object.fromEntries(order.map((id, i) => [id, hands[i]!])),
      stock: rest.slice(1),
      discard: [rest[0]!],
      turn: order[rng.int(order.length)]!,
      direction: 1,
      wish: null,
      pendingDraw: 0,
      drawnCardId: null,
      idleTurns: 0,
      winner: null,
      events: [],
      log: [],
      options,
      rng: rng.state,
    }
  },

  currentPlayer: (state) => state.turn,

  legalActions(state, player) {
    if (player !== state.turn || state.winner) return []
    const plays: MauMauAction[] = playableCards(state, player).flatMap((card) =>
      isRank(card, 'J')
        ? SUITS.map((wish) => ({ type: 'play' as const, cardId: card.id, wish }))
        : [{ type: 'play' as const, cardId: card.id }],
    )
    if (state.drawnCardId) return [...plays, { type: 'pass' }]
    // With stock and discard exhausted, "draw" only means passing; it is offered only to players
    // who cannot play, so a stalemate really means nobody can move.
    const canDraw = state.stock.length > 0 || state.discard.length > 1 || state.pendingDraw > 0
    return canDraw || plays.length === 0 ? [...plays, { type: 'draw' }] : plays
  },

  applyAction(state, player, action) {
    const next = applyMove(state, player, action)
    return { ...next, log: [...state.log, ...next.events].slice(-LOG_SIZE) }
  },

  playerView: (state, player) => ({
    order: state.order,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((id) => [id, state.hands[id]!.length])),
    topCard: topCard(state),
    discardCount: state.discard.length,
    stockCount: state.stock.length,
    turn: state.turn,
    direction: state.direction,
    wish: state.wish,
    pendingDraw: state.pendingDraw,
    drawnCardId: player === state.turn ? state.drawnCardId : null,
    winner: state.winner,
    events: state.events,
    log: state.log,
    options: state.options,
  }),

  // Stalemate: a full round without anybody being able to play or draw.
  isTerminal: (state) => state.winner !== null || state.idleTurns >= state.order.length,

  result(state): GameResult {
    const scores = Object.fromEntries(state.order.map((id) => [id, handPoints(state.hands[id]!)]))
    const ranking = [...state.order].sort((a, b) => {
      if (a === state.winner) return -1
      if (b === state.winner) return 1
      return scores[a]! - scores[b]!
    })
    const best = scores[ranking[0]!]!
    const winners = state.winner ? [state.winner] : state.order.filter((id) => scores[id] === best)
    return { scores, winners, ranking, scoreLabel: 'Strafpunkte', lowerScoreIsBetter: true }
  },

  describeAction: (action) =>
    action.type === 'play'
      ? `play ${action.cardId}${action.wish ? ` wish ${action.wish}` : ''}`
      : action.type,

  statFields: [
    { key: 'cardsPlayed', label: 'Gespielte Karten' },
    { key: 'cardsDrawn', label: 'Gezogene Karten' },
    { key: 'jacksPlayed', label: 'Buben gespielt' },
    { key: 'penaltyDraws', label: 'Strafkarten gezogen' },
  ],

  summarize({ history, finalState, player }) {
    let cardsPlayed = 0
    let cardsDrawn = 0
    let jacksPlayed = 0
    let penaltyDraws = 0
    history.forEach((entry, i) => {
      if (entry.player !== player) return
      const { action } = entry
      if (action.type === 'play') {
        cardsPlayed++
        const card = entry.stateBefore.hands[player]?.find((c) => c.id === action.cardId)
        if (card && isRank(card, 'J')) jacksPlayed++
      } else if (action.type === 'draw') {
        const after = (history[i + 1]?.stateBefore ?? finalState).hands[player]?.length ?? 0
        const drawn = Math.max(0, after - (entry.stateBefore.hands[player]?.length ?? 0))
        cardsDrawn += drawn
        if (entry.stateBefore.pendingDraw > 0) penaltyDraws += drawn
      }
    })
    return { cardsPlayed, cardsDrawn, jacksPlayed, penaltyDraws }
  },
})
