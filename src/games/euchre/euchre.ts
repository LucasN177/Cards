/**
 * Euchre for four players in two partnerships with 24 cards. One team names trump and must take
 * at least three of five tricks. Pure and deterministic; see `EuchreRules.tsx` for the rule text.
 */
import {
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  type Rank,
  Rng,
  type RngState,
  SUIT_COLOR,
  SUITS,
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface EuchreOptions {
  readonly target: 5 | 10
  /** If everybody passes twice, the dealer must name trump (otherwise the hand is redealt). */
  readonly stickTheDealer: boolean
  /** Whoever names trump may play alone without the partner. */
  readonly goAlone: boolean
}

export const DEFAULT_EUCHRE_OPTIONS: EuchreOptions = {
  target: 10,
  stickTheDealer: true,
  goAlone: true,
}

export const HAND_SIZE = 5

export type EuchreAction =
  /** First round: the dealer picks up the turned card and that suit is trump. */
  | { readonly type: 'order'; readonly alone?: boolean }
  | { readonly type: 'pass' }
  /** Second round: name another suit. */
  | { readonly type: 'call'; readonly suit: Suit; readonly alone?: boolean }
  | { readonly type: 'discard'; readonly cardId: CardId }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export type Team = 0 | 1

export interface EuchreHandResult {
  readonly hand: number
  readonly makers: Team
  readonly alone: boolean
  readonly tricks: readonly [number, number]
  readonly points: readonly [number, number]
  readonly euchred: boolean
  readonly march: boolean
}

export type EuchreEvent =
  | { readonly type: 'passed'; readonly player: PlayerId }
  | {
      readonly type: 'trump'
      readonly player: PlayerId
      readonly suit: Suit
      readonly alone: boolean
      readonly ordered: boolean
    }
  | { readonly type: 'discarded'; readonly player: PlayerId }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId }
  | { readonly type: 'redeal' }
  | { readonly type: 'hand'; readonly result: EuchreHandResult }

export interface EuchreState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly upcard: SuitedCard
  readonly phase: 'bid1' | 'bid2' | 'discard' | 'playing' | 'over'
  readonly dealer: PlayerId
  readonly turn: PlayerId
  readonly trump: Suit | null
  readonly maker: PlayerId | null
  /** Partner of a lone maker; they sit this hand out. */
  readonly sittingOut: PlayerId | null
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly tricks: Readonly<Record<PlayerId, number>>
  readonly played: readonly SuitedCard[]
  readonly handNumber: number
  readonly scores: readonly [number, number]
  readonly handResults: readonly EuchreHandResult[]
  readonly events: readonly EuchreEvent[]
  readonly options: EuchreOptions
  readonly rng: RngState
}

export interface EuchreView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly upcard: SuitedCard
  readonly phase: EuchreState['phase']
  readonly dealer: PlayerId
  readonly turn: PlayerId
  readonly trump: Suit | null
  readonly maker: PlayerId | null
  readonly sittingOut: PlayerId | null
  readonly trick: readonly TrickCard[]
  readonly lastTrick: EuchreState['lastTrick']
  readonly tricks: EuchreState['tricks']
  readonly played: readonly SuitedCard[]
  readonly handNumber: number
  readonly scores: EuchreState['scores']
  readonly handResults: readonly EuchreHandResult[]
  readonly events: readonly EuchreEvent[]
  readonly options: EuchreOptions
}

// --- Cards -------------------------------------------------------------------------------------

const ORDER: readonly Rank[] = ['9', '10', 'J', 'Q', 'K', 'A']

export const teamOf = (order: readonly PlayerId[], p: PlayerId): Team =>
  (order.indexOf(p) % 2) as Team
export const partnerOf = (order: readonly PlayerId[], p: PlayerId) => nextPlayer(order, p, 2)

/** The other suit of the same colour (its jack becomes the left bower). */
export const sameColor = (suit: Suit) =>
  SUITS.find((s) => s !== suit && SUIT_COLOR[s] === SUIT_COLOR[suit])!

export const isRightBower = (c: SuitedCard, trump: Suit) => c.rank === 'J' && c.suit === trump
export const isLeftBower = (c: SuitedCard, trump: Suit) =>
  c.rank === 'J' && c.suit === sameColor(trump)

/** The suit a card counts as: the left bower belongs to trump. */
export const effectiveSuit = (c: SuitedCard, trump: Suit | null) =>
  trump && isLeftBower(c, trump) ? trump : c.suit

/** Trick strength: bowers, then trumps, then the led suit; other cards cannot win. */
export function power(card: SuitedCard, trump: Suit, led: Suit): number {
  if (isRightBower(card, trump)) return 200
  if (isLeftBower(card, trump)) return 199
  if (card.suit === trump) return 100 + ORDER.indexOf(card.rank)
  if (card.suit === led) return ORDER.indexOf(card.rank)
  return -1
}

export function trickWinner(trick: readonly TrickCard[], trump: Suit): PlayerId {
  const led = effectiveSuit(trick[0]!.card, trump)
  return trick.reduce((best, t) =>
    power(t.card, trump, led) > power(best.card, trump, led) ? t : best,
  ).player
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }

/** Sorted by (effective) suit, trumps last, bowers on top. */
export function sortHand(cards: readonly SuitedCard[], trump: Suit | null) {
  const key = (c: SuitedCard) => {
    const suit = effectiveSuit(c, trump)
    const group = suit === trump ? 10 : SUIT_ORDER[suit]
    const rank = trump ? power(c, trump, suit) : ORDER.indexOf(c.rank)
    return group * 1000 + rank
  }
  return [...cards].sort((a, b) => key(a) - key(b))
}

/** Cards `player` may play: follow the led (effective) suit if possible. */
export function playableCards(state: EuchreState, player: PlayerId): SuitedCard[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const hand = state.hands[player]!
  if (state.trick.length === 0) return [...hand]
  const led = effectiveSuit(state.trick[0]!.card, state.trump)
  const follow = hand.filter((c) => effectiveSuit(c, state.trump) === led)
  return follow.length > 0 ? follow : [...hand]
}

// --- Flow --------------------------------------------------------------------------------------

/** The next player taking part (skipping a lone maker's partner). */
function nextInPlay(state: EuchreState, from: PlayerId) {
  let p = nextPlayer(state.order, from)
  if (p === state.sittingOut) p = nextPlayer(state.order, p)
  return p
}

function startHand(state: EuchreState, handNumber: number, dealer: PlayerId): EuchreState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('short24')) as SuitedCard[]
  const hands: Record<PlayerId, SuitedCard[]> = {}
  state.order.forEach((p, i) => {
    hands[p] = sortHand(deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE), null)
  })
  return {
    ...state,
    hands,
    upcard: deck[20]!,
    phase: 'bid1',
    dealer,
    turn: nextPlayer(state.order, dealer),
    trump: null,
    maker: null,
    sittingOut: null,
    trick: [],
    lastTrick: null,
    tricks: Object.fromEntries(state.order.map((p) => [p, 0])),
    played: [],
    handNumber,
    rng: rng.state,
  }
}

function setTrump(
  state: EuchreState,
  player: PlayerId,
  suit: Suit,
  alone: boolean,
  ordered: boolean,
): EuchreState {
  const sittingOut = alone ? partnerOf(state.order, player) : null
  const hands = Object.fromEntries(state.order.map((p) => [p, sortHand(state.hands[p]!, suit)]))
  const base: EuchreState = {
    ...state,
    hands,
    trump: suit,
    maker: player,
    sittingOut,
    events: [{ type: 'trump', player, suit, alone, ordered }],
  }
  if (ordered && state.dealer !== sittingOut) {
    // The dealer picks up the turned card and discards one.
    return {
      ...base,
      hands: { ...hands, [state.dealer]: sortHand([...hands[state.dealer]!, state.upcard], suit) },
      phase: 'discard',
      turn: state.dealer,
    }
  }
  return startPlay(base)
}

function startPlay(state: EuchreState): EuchreState {
  const first = nextPlayer(state.order, state.dealer)
  return {
    ...state,
    phase: 'playing',
    turn: first === state.sittingOut ? nextPlayer(state.order, first) : first,
  }
}

function scoreHand(state: EuchreState): EuchreState {
  const makers = teamOf(state.order, state.maker!)
  const tricks: [number, number] = [0, 0]
  for (const p of state.order) tricks[teamOf(state.order, p)] += state.tricks[p]!
  const alone = state.sittingOut !== null
  const points: [number, number] = [0, 0]
  const made = tricks[makers]
  const euchred = made < 3
  const march = made === 5
  if (euchred) points[1 - makers] = 2
  else points[makers] = march ? (alone ? 4 : 2) : 1
  const result: EuchreHandResult = {
    hand: state.handNumber,
    makers,
    alone,
    tricks,
    points,
    euchred,
    march,
  }
  const scores: [number, number] = [state.scores[0] + points[0], state.scores[1] + points[1]]
  const finished: EuchreState = {
    ...state,
    scores,
    handResults: [...state.handResults, result],
    events: [...state.events, { type: 'hand', result }],
  }
  if (Math.max(...scores) >= state.options.target) return { ...finished, phase: 'over' }
  const next = startHand(finished, state.handNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

// --- Game definition ---------------------------------------------------------------------------

export const euchreRules = defineGame<EuchreState, EuchreAction, EuchreOptions, EuchreView>({
  id: 'euchre',
  name: 'Euchre',
  players: { min: 4, max: 4 },
  defaultOptions: DEFAULT_EUCHRE_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'target',
      label: 'Spielende',
      choices: [
        { value: 10, label: '10 Punkte' },
        { value: 5, label: '5 Punkte' },
      ],
    },
    {
      type: 'boolean',
      key: 'stickTheDealer',
      label: 'Geber muss wählen',
      description: 'Passen alle zweimal, muss der Geber Trumpf bestimmen (sonst wird neu gegeben).',
    },
    {
      type: 'boolean',
      key: 'goAlone',
      label: 'Alleinspiel',
      description: 'Wer Trumpf bestimmt, darf ohne Partner spielen – fünf Stiche zählen dann 4.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(4)]!
    const base = {
      order,
      scores: [0, 0],
      handResults: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as EuchreState
    return startHand(base, 0, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const alone = state.options.goAlone
    switch (state.phase) {
      case 'bid1':
        return [
          { type: 'order' },
          ...(alone ? [{ type: 'order' as const, alone: true }] : []),
          { type: 'pass' },
        ]
      case 'bid2': {
        const suits = SUITS.filter((s) => s !== state.upcard.suit)
        const stuck = state.options.stickTheDealer && player === state.dealer
        return [
          ...suits.map((suit) => ({ type: 'call' as const, suit })),
          ...(alone ? suits.map((suit) => ({ type: 'call' as const, suit, alone: true })) : []),
          ...(stuck ? [] : [{ type: 'pass' as const }]),
        ]
      }
      case 'discard':
        return state.hands[player]!.map((c) => ({ type: 'discard' as const, cardId: c.id }))
      case 'playing':
        return playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id }))
    }
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'order':
        return setTrump(state, player, state.upcard.suit, action.alone === true, true)
      case 'call':
        return setTrump(state, player, action.suit, action.alone === true, false)
      case 'pass': {
        const events: EuchreEvent[] = [{ type: 'passed', player }]
        if (player !== state.dealer)
          return { ...state, turn: nextPlayer(state.order, player), events }
        if (state.phase === 'bid1') {
          return { ...state, phase: 'bid2', turn: nextPlayer(state.order, player), events }
        }
        // Everybody passed twice: redeal with the next dealer.
        const next = startHand(state, state.handNumber, nextPlayer(state.order, state.dealer))
        return { ...next, events: [...events, { type: 'redeal' }] }
      }
      case 'discard': {
        const hand = state.hands[player]!
        return startPlay({
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c.id !== action.cardId) },
          events: [{ type: 'discarded', player }],
        })
      }
      case 'play': {
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const trick = [...state.trick, { player, card }]
        const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
        const events: EuchreEvent[] = [{ type: 'played', player, card }]
        const size = state.sittingOut ? 3 : 4
        const played = [...state.played, card]
        if (trick.length < size) {
          return { ...state, hands, trick, played, events, turn: nextInPlay(state, player) }
        }
        const winner = trickWinner(trick, state.trump!)
        const next: EuchreState = {
          ...state,
          hands,
          played,
          trick: [],
          lastTrick: { cards: trick, winner },
          tricks: { ...state.tricks, [winner]: state.tricks[winner]! + 1 },
          turn: winner,
          events: [...events, { type: 'trick', winner }],
        }
        const tricksDone = Object.values(next.tricks).reduce((a, b) => a + b, 0)
        return tricksDone === HAND_SIZE ? scoreHand(next) : next
      }
    }
  },

  playerView: (state, player) => ({
    order: state.order,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
    upcard: state.upcard,
    phase: state.phase,
    dealer: state.dealer,
    turn: state.turn,
    trump: state.trump,
    maker: state.maker,
    sittingOut: state.sittingOut,
    trick: state.trick,
    lastTrick: state.lastTrick,
    tricks: state.tricks,
    played: state.played,
    handNumber: state.handNumber,
    scores: state.scores,
    handResults: state.handResults,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const scores = Object.fromEntries(
      state.order.map((p) => [p, state.scores[teamOf(state.order, p)]]),
    )
    const ranking = [...state.order].sort((a, b) => scores[b]! - scores[a]!)
    const best = scores[ranking[0]!]!
    return {
      scores,
      winners: state.order.filter((p) => scores[p] === best),
      ranking,
      scoreLabel: 'Teampunkte',
    }
  },

  describeAction: (action) => {
    switch (action.type) {
      case 'order':
        return action.alone ? 'order alone' : 'order'
      case 'call':
        return `call ${action.suit}${action.alone ? ' alone' : ''}`
      case 'pass':
        return 'pass'
      default:
        return `${action.type} ${action.cardId}`
    }
  },
})
