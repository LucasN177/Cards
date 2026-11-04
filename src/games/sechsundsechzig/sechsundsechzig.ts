/**
 * Sechsundsechzig (66) for two players with 24 cards. Win tricks and meld king + queen to reach
 * 66 points first. Pure and deterministic; see `SechsundsechzigRules.tsx` for the rule text.
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
  SUITS,
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface SechsundsechzigOptions {
  /** Game points needed to win the match; 1 = a single hand. */
  readonly target: 1 | 7
  /** Whether the leader may close the stock ("zudrehen"). */
  readonly closing: boolean
}

export const DEFAULT_66_OPTIONS: SechsundsechzigOptions = { target: 7, closing: true }

export const WIN_POINTS = 66
export const HAND_SIZE = 6

export type SechsundsechzigAction =
  /** `meld`: announce the marriage this king or queen belongs to (only when leading). */
  | { readonly type: 'play'; readonly cardId: CardId; readonly meld?: boolean }
  /** Swap the trump nine for the face-up trump card. */
  | { readonly type: 'exchange' }
  | { readonly type: 'close' }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface Meld {
  readonly player: PlayerId
  readonly suit: Suit
  readonly points: 20 | 40
}

export interface HandResult {
  readonly hand: number
  readonly winner: PlayerId
  readonly gamePoints: 1 | 2 | 3
  readonly points: Readonly<Record<PlayerId, number>>
  readonly reason: 'reached' | 'lastTrick' | 'closeFailed'
}

export type SechsundsechzigEvent =
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'melded'; readonly meld: Meld }
  | { readonly type: 'exchanged'; readonly player: PlayerId }
  | { readonly type: 'closed'; readonly player: PlayerId }
  | { readonly type: 'trick'; readonly winner: PlayerId; readonly points: number }
  | { readonly type: 'hand'; readonly result: HandResult }

export interface SechsundsechzigState {
  readonly order: readonly [PlayerId, PlayerId]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Cards to draw from the front; the last card is the face-up trump card. */
  readonly stock: readonly SuitedCard[]
  readonly trump: Suit
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly turn: PlayerId
  readonly leader: PlayerId
  /** Card points including counted melds. */
  readonly points: Readonly<Record<PlayerId, number>>
  readonly tricksWon: Readonly<Record<PlayerId, number>>
  /** Cards played in this hand. */
  readonly played: readonly SuitedCard[]
  readonly melds: readonly Meld[]
  /** Meld points that count once the player wins a trick. */
  readonly pending: Readonly<Record<PlayerId, number>>
  readonly closedBy: PlayerId | null
  /** Opponent's points at the moment of closing (for scoring a failed close). */
  readonly closedAt: number
  readonly phase: 'playing' | 'over'
  readonly handNumber: number
  readonly dealer: PlayerId
  readonly gamePoints: Readonly<Record<PlayerId, number>>
  readonly handResults: readonly HandResult[]
  readonly events: readonly SechsundsechzigEvent[]
  readonly options: SechsundsechzigOptions
  readonly rng: RngState
}

export interface SechsundsechzigView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly opponentCards: number
  readonly stockCount: number
  /** The face-up trump card while the stock is open. */
  readonly trumpCard: SuitedCard | null
  readonly trump: Suit
  readonly trick: readonly TrickCard[]
  readonly lastTrick: SechsundsechzigState['lastTrick']
  readonly turn: PlayerId
  readonly leader: PlayerId
  /** Your own points; the opponent's stay hidden (only their trick count is known). */
  readonly myPoints: number
  readonly pendingPoints: number
  readonly tricksWon: SechsundsechzigState['tricksWon']
  readonly melds: readonly Meld[]
  readonly closedBy: PlayerId | null
  /** Strict rules apply: the stock is closed or empty. */
  readonly strict: boolean
  readonly phase: SechsundsechzigState['phase']
  readonly handNumber: number
  readonly gamePoints: SechsundsechzigState['gamePoints']
  readonly handResults: readonly HandResult[]
  readonly events: readonly SechsundsechzigEvent[]
  readonly options: SechsundsechzigOptions
  /** Cards already played in this hand (both saw them). */
  readonly played: readonly SuitedCard[]
}

// --- Cards -------------------------------------------------------------------------------------

const ORDER: readonly Rank[] = ['9', 'J', 'Q', 'K', '10', 'A']
const VALUES: Readonly<Partial<Record<Rank, number>>> = { J: 2, Q: 3, K: 4, '10': 10, A: 11 }
export const cardPoints = (card: SuitedCard) => VALUES[card.rank] ?? 0
export const strength = (card: SuitedCard) => ORDER.indexOf(card.rank)

export function beats(card: SuitedCard, led: SuitedCard, trump: Suit) {
  if (card.suit === led.suit) return strength(card) > strength(led)
  return card.suit === trump
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }
export const sortHand = (cards: readonly SuitedCard[]) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || strength(a) - strength(b))

const isStrict = (state: SechsundsechzigState) =>
  state.closedBy !== null || state.stock.length === 0

/** Suits in which the player holds king and queen. */
export function marriages(hand: readonly SuitedCard[]): Suit[] {
  return SUITS.filter(
    (s) =>
      hand.some((c) => c.suit === s && c.rank === 'K') &&
      hand.some((c) => c.suit === s && c.rank === 'Q'),
  )
}

/** Cards the player may play now. */
export function playableCards(state: SechsundsechzigState, player: PlayerId): SuitedCard[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const hand = state.hands[player]!
  if (state.trick.length === 0 || !isStrict(state)) return [...hand]
  // Strict: follow suit and beat if possible; otherwise trump if possible.
  const led = state.trick[0]!.card
  const same = hand.filter((c) => c.suit === led.suit)
  if (same.length > 0) {
    const higher = same.filter((c) => strength(c) > strength(led))
    return higher.length > 0 ? higher : same
  }
  const trumps = hand.filter((c) => c.suit === state.trump)
  return trumps.length > 0 ? trumps : [...hand]
}

// --- Flow --------------------------------------------------------------------------------------

function startHand(state: SechsundsechzigState, handNumber: number, dealer: PlayerId) {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('short24')) as SuitedCard[]
  const leader = nextPlayer(state.order, dealer)
  const other = dealer
  const hands = {
    [leader]: sortHand(deck.slice(0, HAND_SIZE)),
    [other]: sortHand(deck.slice(HAND_SIZE, HAND_SIZE * 2)),
  }
  const stock = deck.slice(HAND_SIZE * 2)
  const zero = Object.fromEntries(state.order.map((p) => [p, 0]))
  return {
    ...state,
    hands,
    stock,
    trump: stock.at(-1)!.suit,
    trick: [],
    lastTrick: null,
    turn: leader,
    leader,
    points: zero,
    tricksWon: zero,
    melds: [],
    played: [],
    pending: zero,
    closedBy: null,
    closedAt: 0,
    phase: 'playing' as const,
    handNumber,
    dealer,
    rng: rng.state,
  }
}

const opponentOf = (state: SechsundsechzigState, p: PlayerId) =>
  state.order[0] === p ? state.order[1] : state.order[0]

/** Game points for a normal win: 3 if the loser has no trick, 2 below 33 points, else 1. */
function gamePointsFor(state: SechsundsechzigState, loser: PlayerId): 1 | 2 | 3 {
  if (state.tricksWon[loser] === 0) return 3
  return state.points[loser]! < 33 ? 2 : 1
}

function endHand(
  state: SechsundsechzigState,
  winner: PlayerId,
  gamePoints: 1 | 2 | 3,
  reason: HandResult['reason'],
): SechsundsechzigState {
  const result: HandResult = {
    hand: state.handNumber,
    winner,
    gamePoints,
    points: state.points,
    reason,
  }
  const total = { ...state.gamePoints, [winner]: state.gamePoints[winner]! + gamePoints }
  const finished: SechsundsechzigState = {
    ...state,
    gamePoints: total,
    handResults: [...state.handResults, result],
    events: [...state.events, { type: 'hand', result }],
  }
  if (total[winner]! >= state.options.target) return { ...finished, phase: 'over' }
  // The deal alternates.
  const next = startHand(finished, state.handNumber + 1, opponentOf(state, state.dealer))
  return { ...next, events: finished.events }
}

/** Decides a hand where `player` reached 66 (or a closer failed). */
function reached(state: SechsundsechzigState, player: PlayerId): SechsundsechzigState {
  const opponent = opponentOf(state, player)
  // Reaching 66 against a closer who did not: at least two game points.
  const normal = gamePointsFor(state, opponent)
  const points =
    state.closedBy === opponent ? Math.max(state.closedAt === 0 ? 3 : 2, normal) : normal
  return endHand(state, player, points as 1 | 2 | 3, 'reached')
}

function finishTrick(state: SechsundsechzigState): SechsundsechzigState {
  const [lead, follow] = state.trick as [TrickCard, TrickCard]
  const winner = beats(follow.card, lead.card, state.trump) ? follow.player : lead.player
  const loser = opponentOf(state, winner)
  const trickPoints = cardPoints(lead.card) + cardPoints(follow.card)
  const firstTrick = state.tricksWon[winner] === 0
  let points = { ...state.points, [winner]: state.points[winner]! + trickPoints }
  const pending = { ...state.pending }
  if (firstTrick && pending[winner]) {
    points = { ...points, [winner]: points[winner]! + pending[winner]! }
    pending[winner] = 0
  }
  let next: SechsundsechzigState = {
    ...state,
    points,
    pending,
    tricksWon: { ...state.tricksWon, [winner]: state.tricksWon[winner]! + 1 },
    trick: [],
    lastTrick: { cards: state.trick, winner },
    turn: winner,
    leader: winner,
    events: [...state.events, { type: 'trick', winner, points: trickPoints }],
  }
  // Drawing: the winner first.
  if (!next.closedBy && next.stock.length > 0) {
    const [first, second, ...rest] = next.stock
    next = {
      ...next,
      hands: {
        ...next.hands,
        [winner]: sortHand([...next.hands[winner]!, first!]),
        [loser]: sortHand([...next.hands[loser]!, second!]),
      },
      stock: rest,
    }
  }
  if (next.points[winner]! >= WIN_POINTS) return reached(next, winner)
  if (next.hands[winner]!.length > 0) return next

  // All cards played.
  if (next.closedBy) {
    // The closer did not make 66: the other player gets 2 (3 if the closer had no trick then).
    const closer = next.closedBy
    const other = opponentOf(next, closer)
    return endHand(next, other, next.closedAt === 0 ? 3 : 2, 'closeFailed')
  }
  // Nobody reached 66: the last trick decides (it also counts 10 extra points).
  const withBonus = { ...next, points: { ...next.points, [winner]: next.points[winner]! + 10 } }
  if (withBonus.points[winner]! >= WIN_POINTS) return reached(withBonus, winner)
  return endHand(withBonus, winner, gamePointsFor(withBonus, loser), 'lastTrick')
}

// --- Game definition ---------------------------------------------------------------------------

export const sechsundsechzigRules = defineGame<
  SechsundsechzigState,
  SechsundsechzigAction,
  SechsundsechzigOptions,
  SechsundsechzigView
>({
  id: 'sechsundsechzig',
  name: 'Sechsundsechzig',
  players: { min: 2, max: 2 },
  defaultOptions: DEFAULT_66_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'target',
      label: 'Spielende',
      choices: [
        { value: 7, label: '7 Gewinnpunkte' },
        { value: 1, label: 'Eine Hand' },
      ],
    },
    {
      type: 'boolean',
      key: 'closing',
      label: 'Zudrehen erlaubt',
      description: 'Wer ausspielt, darf den Stapel schließen und muss dann allein 66 schaffen.',
    },
  ],

  setup({ players, options, seed }) {
    const order = [players[0]!.id, players[1]!.id] as const
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(2)]!
    const zero = Object.fromEntries(order.map((p) => [p, 0]))
    const base = {
      order,
      gamePoints: zero,
      handResults: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as SechsundsechzigState
    return startHand(base, 0, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const hand = state.hands[player]!
    const plays: SechsundsechzigAction[] = playableCards(state, player).map((c) => ({
      type: 'play',
      cardId: c.id,
    }))
    if (state.trick.length > 0) return plays
    const extra: SechsundsechzigAction[] = []
    for (const suit of marriages(hand)) {
      for (const c of hand.filter((h) => h.suit === suit && (h.rank === 'K' || h.rank === 'Q')))
        extra.push({ type: 'play', cardId: c.id, meld: true })
    }
    const stockOpen = !state.closedBy && state.stock.length > 2
    if (stockOpen && hand.some((c) => c.suit === state.trump && c.rank === '9'))
      extra.push({ type: 'exchange' })
    if (stockOpen && state.options.closing) extra.push({ type: 'close' })
    return [...plays, ...extra]
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    if (action.type === 'exchange') {
      const nine = hand.find((c) => c.suit === state.trump && c.rank === '9')!
      const trumpCard = state.stock.at(-1)!
      return {
        ...state,
        hands: {
          ...state.hands,
          [player]: sortHand([...hand.filter((c) => c !== nine), trumpCard]),
        },
        stock: [...state.stock.slice(0, -1), nine],
        events: [{ type: 'exchanged', player }],
      }
    }
    if (action.type === 'close') {
      return {
        ...state,
        closedBy: player,
        closedAt: state.tricksWon[opponentOf(state, player)]!,
        events: [{ type: 'closed', player }],
      }
    }
    const card = hand.find((c) => c.id === action.cardId)!
    const events: SechsundsechzigEvent[] = []
    let next: SechsundsechzigState = state
    if (action.meld) {
      const meld: Meld = { player, suit: card.suit, points: card.suit === state.trump ? 40 : 20 }
      events.push({ type: 'melded', meld })
      const counts = state.tricksWon[player]! > 0
      next = {
        ...next,
        melds: [...next.melds, meld],
        points: counts
          ? { ...next.points, [player]: next.points[player]! + meld.points }
          : next.points,
        pending: counts
          ? next.pending
          : { ...next.pending, [player]: next.pending[player]! + meld.points },
      }
      if (counts && next.points[player]! >= WIN_POINTS) {
        return reached({ ...next, events: events }, player)
      }
    }
    events.push({ type: 'played', player, card })
    next = {
      ...next,
      hands: { ...next.hands, [player]: hand.filter((c) => c !== card) },
      trick: [...next.trick, { player, card }],
      played: [...next.played, card],
      turn: opponentOf(state, player),
      events,
    }
    return next.trick.length === 2 ? finishTrick(next) : next
  },

  playerView(state, player) {
    return {
      order: state.order,
      hand: state.hands[player] ?? [],
      opponentCards: state.hands[opponentOf(state, player)]?.length ?? 0,
      stockCount: state.closedBy ? 0 : state.stock.length,
      trumpCard: !state.closedBy && state.stock.length > 0 ? state.stock.at(-1)! : null,
      trump: state.trump,
      trick: state.trick,
      lastTrick: state.lastTrick,
      turn: state.turn,
      leader: state.leader,
      myPoints: state.points[player] ?? 0,
      pendingPoints: state.pending[player] ?? 0,
      tricksWon: state.tricksWon,
      melds: state.melds,
      closedBy: state.closedBy,
      strict: isStrict(state),
      phase: state.phase,
      handNumber: state.handNumber,
      gamePoints: state.gamePoints,
      handResults: state.handResults,
      events: state.events,
      options: state.options,
      played: state.played,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.order].sort((a, b) => state.gamePoints[b]! - state.gamePoints[a]!)
    return {
      scores: state.gamePoints,
      winners: [ranking[0]!],
      ranking,
      scoreLabel: 'Gewinnpunkte',
    }
  },

  describeAction: (action) =>
    action.type === 'play' ? `play ${action.cardId}${action.meld ? ' (meld)' : ''}` : action.type,
})
