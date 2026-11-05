/**
 * Wizard for 3–6 players: 52 cards plus four wizards (Zauberer) and four jesters (Narren).
 * Round n deals n cards; everybody bids exactly how many tricks they will take.
 * Pure and deterministic; see `WizardRules.tsx` for the rule text.
 */
import {
  type Card,
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  isJester,
  isWizard,
  nextPlayer,
  type PlayerId,
  RANKS,
  Rng,
  type RngState,
  specialCard,
  SUITS,
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface WizardOptions {
  /** All rounds (60 cards ÷ players), half of them, or a quick game of five. */
  readonly rounds: 'full' | 'half' | 'five'
  /** The dealer may not bid so that all bids add up to the number of tricks. */
  readonly unevenBids: boolean
}

export const DEFAULT_WIZARD_OPTIONS: WizardOptions = { rounds: 'full', unevenBids: false }

export type WizardAction =
  | { readonly type: 'chooseTrump'; readonly suit: Suit }
  | { readonly type: 'bid'; readonly tricks: number }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: Card
}

export interface WizardRoundResult {
  readonly round: number
  readonly bids: Readonly<Record<PlayerId, number>>
  readonly tricks: Readonly<Record<PlayerId, number>>
  readonly points: Readonly<Record<PlayerId, number>>
}

export type WizardEvent =
  | { readonly type: 'trump'; readonly suit: Suit | null; readonly chosenBy: PlayerId | null }
  | { readonly type: 'bid'; readonly player: PlayerId; readonly tricks: number }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: Card }
  | { readonly type: 'trick'; readonly winner: PlayerId }
  | { readonly type: 'round'; readonly result: WizardRoundResult }

export interface WizardState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>
  readonly round: number
  readonly totalRounds: number
  readonly dealer: PlayerId
  /** The card turned up to decide trump (null in the last round of a full game). */
  readonly trumpCard: Card | null
  readonly trump: Suit | null
  readonly phase: 'chooseTrump' | 'bidding' | 'playing' | 'over'
  readonly bids: Readonly<Record<PlayerId, number | null>>
  readonly tricks: Readonly<Record<PlayerId, number>>
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly played: readonly Card[]
  readonly turn: PlayerId
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly roundResults: readonly WizardRoundResult[]
  readonly events: readonly WizardEvent[]
  readonly options: WizardOptions
  readonly rng: RngState
}

export interface WizardView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly Card[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly round: number
  readonly totalRounds: number
  readonly dealer: PlayerId
  readonly trumpCard: Card | null
  readonly trump: Suit | null
  readonly phase: WizardState['phase']
  readonly bids: WizardState['bids']
  readonly tricks: WizardState['tricks']
  readonly trick: readonly TrickCard[]
  readonly lastTrick: WizardState['lastTrick']
  readonly played: readonly Card[]
  readonly turn: PlayerId
  readonly scores: WizardState['scores']
  readonly roundResults: readonly WizardRoundResult[]
  readonly events: readonly WizardEvent[]
  readonly options: WizardOptions
}

// --- Cards -------------------------------------------------------------------------------------

export function createWizardDeck(): Card[] {
  return [
    ...createDeck('standard52'),
    ...[1, 2, 3, 4].map((n) => specialCard('wizard', n)),
    ...[1, 2, 3, 4].map((n) => specialCard('jester', n)),
  ]
}

/** 2 = 2 … Ace = 14. */
export const highValue = (card: SuitedCard) => RANKS.indexOf(card.rank) + 2

export const roundsFor = (players: number, option: WizardOptions['rounds']) => {
  const full = Math.floor(60 / players)
  return option === 'full' ? full : option === 'half' ? Math.ceil(full / 2) : Math.min(5, full)
}

/** The suit to follow: the first plain card, unless a wizard came first (then anything goes). */
export function leadSuit(trick: readonly TrickCard[]): Suit | null {
  for (const { card } of trick) {
    if (isWizard(card)) return null
    if (card.kind === 'suited') return card.suit
  }
  return null
}

/** The first wizard wins; else the highest trump; else the highest card of the led suit. */
export function trickWinner(trick: readonly TrickCard[], trump: Suit | null): PlayerId {
  const wizard = trick.find((t) => isWizard(t.card))
  if (wizard) return wizard.player
  const plain = trick.filter(
    (t): t is { player: PlayerId; card: SuitedCard } => t.card.kind === 'suited',
  )
  if (plain.length === 0) return trick[0]!.player // only jesters: the first one
  const led = leadSuit(trick)
  const value = (c: SuitedCard) =>
    c.suit === trump ? 100 + highValue(c) : c.suit === led ? highValue(c) : 0
  return plain.reduce((best, t) => (value(t.card) > value(best.card) ? t : best)).player
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }

/** Jesters first, then the suits (trump last), wizards at the end. */
export function sortHand(cards: readonly Card[], trump: Suit | null) {
  const key = (c: Card) => {
    if (isJester(c)) return -1
    if (isWizard(c)) return 1000
    const s = c as SuitedCard
    return (s.suit === trump ? 5 : SUIT_ORDER[s.suit]) * 20 + highValue(s)
  }
  return [...cards].sort((a, b) => key(a) - key(b))
}

/** Cards `player` may play: follow suit if possible; wizards and jesters are always allowed. */
export function playableCards(state: WizardState, player: PlayerId): Card[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const hand = state.hands[player]!
  const led = leadSuit(state.trick)
  if (!led) return [...hand]
  const follow = hand.filter((c) => c.kind === 'suited' && c.suit === led)
  if (follow.length === 0) return [...hand]
  return hand.filter((c) => c.kind !== 'suited' || c.suit === led)
}

/** Bids allowed for `player`; with uneven bids the dealer may not make them add up. */
export function allowedBids(
  state: Pick<WizardState, 'order' | 'bids' | 'round' | 'dealer' | 'options'>,
  player: PlayerId,
): number[] {
  const all = Array.from({ length: state.round + 1 }, (_, i) => i)
  if (!state.options.unevenBids || player !== state.dealer) return all
  const sum = state.order.reduce((s, p) => s + (state.bids[p] ?? 0), 0)
  return all.filter((b) => sum + b !== state.round)
}

// --- Flow --------------------------------------------------------------------------------------

function startRound(state: WizardState, round: number, dealer: PlayerId): WizardState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createWizardDeck())
  const n = state.order.length
  const hands: Record<PlayerId, Card[]> = {}
  state.order.forEach((p, i) => {
    hands[p] = deck.slice(i * round, (i + 1) * round)
  })
  const trumpCard = deck[n * round] ?? null
  const base: WizardState = {
    ...state,
    round,
    dealer,
    trumpCard,
    trump: null,
    bids: Object.fromEntries(state.order.map((p) => [p, null])),
    tricks: Object.fromEntries(state.order.map((p) => [p, 0])),
    trick: [],
    lastTrick: null,
    played: [],
    rng: rng.state,
  }
  // A wizard turned up: the dealer chooses trump. A jester or no card: no trump this round.
  if (trumpCard && isWizard(trumpCard)) {
    return {
      ...base,
      hands: sortAll(hands, null),
      phase: 'chooseTrump',
      turn: dealer,
    }
  }
  const trump = trumpCard && trumpCard.kind === 'suited' ? trumpCard.suit : null
  return {
    ...base,
    hands: sortAll(hands, trump),
    trump,
    phase: 'bidding',
    turn: nextPlayer(state.order, dealer),
    events: [...state.events, { type: 'trump', suit: trump, chosenBy: null }],
  }
}

const sortAll = (hands: Record<PlayerId, Card[]>, trump: Suit | null) =>
  Object.fromEntries(Object.entries(hands).map(([p, h]) => [p, sortHand(h, trump)]))

function scoreRound(state: WizardState): WizardState {
  const points: Record<PlayerId, number> = {}
  for (const p of state.order) {
    const bid = state.bids[p]!
    const took = state.tricks[p]!
    points[p] = bid === took ? 20 + 10 * took : -10 * Math.abs(bid - took)
  }
  const result: WizardRoundResult = {
    round: state.round,
    bids: state.bids as Record<PlayerId, number>,
    tricks: state.tricks,
    points,
  }
  const scores = Object.fromEntries(state.order.map((p) => [p, state.scores[p]! + points[p]!]))
  const finished: WizardState = {
    ...state,
    scores,
    roundResults: [...state.roundResults, result],
    events: [...state.events, { type: 'round', result }],
  }
  if (state.round >= state.totalRounds) return { ...finished, phase: 'over' }
  return startRound(finished, state.round + 1, nextPlayer(state.order, state.dealer))
}

// --- Game definition ---------------------------------------------------------------------------

export const wizardRules = defineGame<WizardState, WizardAction, WizardOptions, WizardView>({
  id: 'wizard',
  name: 'Wizard',
  players: { min: 3, max: 6 },
  defaultOptions: DEFAULT_WIZARD_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'rounds',
      label: 'Runden',
      description: 'Ein volles Spiel hat 60 ÷ Spielerzahl Runden (bei 4 Spielern 15).',
      choices: [
        { value: 'full', label: 'Alle Runden' },
        { value: 'half', label: 'Halbes Spiel' },
        { value: 'five', label: 'Kurz (5 Runden)' },
      ],
    },
    {
      type: 'boolean',
      key: 'unevenBids',
      label: 'Ansagen dürfen nicht aufgehen',
      description:
        'Der Geber darf nicht so ansagen, dass alle Ansagen zusammen die Zahl der Stiche ergeben.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(order.length)]!
    const base = {
      order,
      totalRounds: roundsFor(order.length, options.rounds),
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      roundResults: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as WizardState
    return startRound(base, 1, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    switch (state.phase) {
      case 'chooseTrump':
        return SUITS.map((suit) => ({ type: 'chooseTrump' as const, suit }))
      case 'bidding':
        return allowedBids(state, player).map((tricks) => ({ type: 'bid' as const, tricks }))
      case 'playing':
        return playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id }))
    }
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'chooseTrump':
        return {
          ...state,
          trump: action.suit,
          hands: sortAll(state.hands as Record<PlayerId, Card[]>, action.suit),
          phase: 'bidding',
          turn: nextPlayer(state.order, state.dealer),
          events: [{ type: 'trump', suit: action.suit, chosenBy: player }],
        }
      case 'bid': {
        const bids = { ...state.bids, [player]: action.tricks }
        const events: WizardEvent[] = [{ type: 'bid', player, tricks: action.tricks }]
        const done = state.order.every((p) => bids[p] !== null)
        return {
          ...state,
          bids,
          events,
          phase: done ? 'playing' : 'bidding',
          turn: nextPlayer(state.order, done ? state.dealer : player),
        }
      }
      case 'play': {
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const trick = [...state.trick, { player, card }]
        const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
        const played = [...state.played, card]
        const events: WizardEvent[] = [{ type: 'played', player, card }]
        if (trick.length < state.order.length) {
          return { ...state, hands, trick, played, events, turn: nextPlayer(state.order, player) }
        }
        const winner = trickWinner(trick, state.trump)
        const next: WizardState = {
          ...state,
          hands,
          played,
          trick: [],
          lastTrick: { cards: trick, winner },
          tricks: { ...state.tricks, [winner]: state.tricks[winner]! + 1 },
          turn: winner,
          events: [...events, { type: 'trick', winner }],
        }
        return hands[player]!.length === 0 ? scoreRound(next) : next
      }
    }
  },

  playerView: (state, player) => ({
    order: state.order,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
    round: state.round,
    totalRounds: state.totalRounds,
    dealer: state.dealer,
    trumpCard: state.trumpCard,
    trump: state.trump,
    phase: state.phase,
    bids: state.bids,
    tricks: state.tricks,
    trick: state.trick,
    lastTrick: state.lastTrick,
    played: state.played,
    turn: state.turn,
    scores: state.scores,
    roundResults: state.roundResults,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.order].sort((a, b) => state.scores[b]! - state.scores[a]!)
    const best = state.scores[ranking[0]!]!
    return {
      scores: state.scores,
      winners: state.order.filter((p) => state.scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) =>
    action.type === 'chooseTrump'
      ? `trump ${action.suit}`
      : action.type === 'bid'
        ? `bid ${action.tricks}`
        : `play ${action.cardId}`,
})
