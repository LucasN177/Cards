/**
 * President rules (3–7 players, 52 cards). Several rounds; the order in which players get rid of
 * their cards gives titles and points. Pure and deterministic; see `PresidentRules.tsx`.
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
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface PresidentOptions {
  readonly rounds: 3 | 5 | 10
  /** From the second round on the Bettler gives the best cards to the President (and back). */
  readonly exchange: boolean
}

export const DEFAULT_PRESIDENT_OPTIONS: PresidentOptions = { rounds: 5, exchange: true }

export type PresidentAction =
  | { readonly type: 'play'; readonly cardIds: readonly CardId[] }
  | { readonly type: 'pass' }
  | { readonly type: 'give'; readonly cardIds: readonly CardId[] }

export interface Play {
  readonly player: PlayerId
  readonly cards: readonly SuitedCard[]
}

export type PresidentEvent =
  | { readonly type: 'played'; readonly player: PlayerId; readonly cards: readonly SuitedCard[] }
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'trickWon'; readonly player: PlayerId }
  | { readonly type: 'finished'; readonly player: PlayerId; readonly place: number }
  | {
      readonly type: 'exchanged'
      readonly from: PlayerId
      readonly to: PlayerId
      readonly cards: readonly SuitedCard[]
    }

/** A card hand-over at the start of a round: `from` still has to give `count` cards to `to`. */
export interface PendingGift {
  readonly from: PlayerId
  readonly to: PlayerId
  readonly count: number
}

export interface PresidentRoundResult {
  readonly round: number
  /** Finishing order, President first. */
  readonly order: readonly PlayerId[]
  readonly points: Readonly<Record<PlayerId, number>>
}

export interface PresidentState {
  readonly seats: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly round: number
  readonly phase: 'exchange' | 'playing' | 'over'
  /** Plays in the current trick; the last one is the one to beat. */
  readonly trick: readonly Play[]
  /** Players who passed in this trick; they sit it out until somebody wins it. */
  readonly passed: readonly PlayerId[]
  /** Finishing order of the current round. */
  readonly finished: readonly PlayerId[]
  readonly turn: PlayerId
  /** Finishing order of the previous round (gives the titles). */
  readonly titles: readonly PlayerId[]
  readonly gifts: readonly PendingGift[]
  /** Cards received in the exchange at the start of this round. */
  readonly received: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly rounds: readonly PresidentRoundResult[]
  readonly events: readonly PresidentEvent[]
  readonly options: PresidentOptions
  readonly rng: RngState
}

export interface PresidentView {
  readonly seats: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly round: number
  readonly phase: PresidentState['phase']
  readonly trick: readonly Play[]
  readonly passed: readonly PlayerId[]
  readonly finished: readonly PlayerId[]
  readonly turn: PlayerId
  readonly titles: readonly PlayerId[]
  /** What this player still has to give back, if anything. */
  readonly gift: PendingGift | null
  readonly received: readonly SuitedCard[]
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly rounds: readonly PresidentRoundResult[]
  readonly events: readonly PresidentEvent[]
  readonly options: PresidentOptions
}

// --- Cards -------------------------------------------------------------------------------------

/** 3 is the lowest card, 2 the highest. */
const ORDER: readonly Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
export const strength = (card: SuitedCard) => ORDER.indexOf(card.rank)
const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }

/** Sorted from weakest to strongest – how a player holds the cards. */
export const sortHand = (cards: readonly SuitedCard[]) =>
  [...cards].sort((a, b) => strength(a) - strength(b) || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit])

/** Cards of the same rank, weakest group first. */
export function groupByRank(cards: readonly SuitedCard[]): SuitedCard[][] {
  const groups = new Map<Rank, SuitedCard[]>()
  for (const card of sortHand(cards))
    groups.set(card.rank, [...(groups.get(card.rank) ?? []), card])
  return [...groups.values()]
}

/** Titles by finishing position for `n` players. */
export function titleOf(place: number, n: number): string {
  if (place === 0) return 'Präsident'
  if (place === n - 1) return 'Bettler'
  if (n >= 4 && place === 1) return 'Vize'
  if (n >= 4 && place === n - 2) return 'Vize-Bettler'
  return 'Bürger'
}

/** Whether `cards` may be played on top of `top` (or led when `top` is null). */
export function canPlay(cards: readonly SuitedCard[], top: readonly SuitedCard[] | null) {
  if (cards.length === 0 || cards.length > 4) return false
  if (!cards.every((c) => c.rank === cards[0]!.rank)) return false
  if (!top) return true
  return cards.length === top.length && strength(cards[0]!) > strength(top[0]!)
}

function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [first, ...rest] = items
  return [...subsets(rest, size - 1).map((s) => [first!, ...s]), ...subsets(rest, size)]
}

// --- Flow --------------------------------------------------------------------------------------

const top = (state: Pick<PresidentState, 'trick'>) => state.trick.at(-1)?.cards ?? null
const hasCards = (state: PresidentState, p: PlayerId) => state.hands[p]!.length > 0

function deal(state: PresidentState, rng: Rng): Record<PlayerId, SuitedCard[]> {
  const deck = rng.shuffle(createDeck('standard52')) as SuitedCard[]
  const hands: Record<PlayerId, SuitedCard[]> = Object.fromEntries(state.seats.map((p) => [p, []]))
  deck.forEach((card, i) => hands[state.seats[i % state.seats.length]!]!.push(card))
  for (const p of state.seats) hands[p] = sortHand(hands[p]!)
  return hands
}

/** Starts a round: deals, hands over the best cards and decides who has to give back. */
function startRound(state: PresidentState): PresidentState {
  const rng = new Rng(state.rng)
  const hands = deal(state, rng)
  const n = state.seats.length
  const order = state.titles
  const base: PresidentState = {
    ...state,
    hands,
    trick: [],
    passed: [],
    finished: [],
    gifts: [],
    received: {},
    events: [],
    rng: rng.state,
  }
  // First round (or no exchange): whoever holds the club 3 starts.
  if (order.length === 0 || !state.options.exchange) {
    const starter =
      order.length === 0
        ? state.seats.find((p) => hands[p]!.some((c) => c.rank === '3' && c.suit === 'clubs'))!
        : order.at(-1)!
    return { ...base, phase: 'playing', turn: starter }
  }
  // The lowest give their best cards to the highest; the highest then give back cards they choose.
  const pairs: [PlayerId, PlayerId, number][] = [[order.at(-1)!, order[0]!, 2]]
  if (n >= 4) pairs.push([order.at(-2)!, order[1]!, 1])
  const received: Record<PlayerId, SuitedCard[]> = {}
  const events: PresidentEvent[] = []
  for (const [from, to, count] of pairs) {
    const best = hands[from]!.slice(-count)
    hands[from] = hands[from]!.slice(0, -count)
    hands[to] = sortHand([...hands[to]!, ...best])
    received[to] = best
    events.push({ type: 'exchanged', from, to, cards: best })
  }
  return {
    ...base,
    hands,
    received,
    phase: 'exchange',
    gifts: pairs.map(([from, to, count]) => ({ from: to, to: from, count })),
    turn: pairs[0]![1],
    events,
  }
}

function endRound(state: PresidentState): PresidentState {
  const last = state.seats.find((p) => !state.finished.includes(p))
  const order = last ? [...state.finished, last] : state.finished
  const n = state.seats.length
  const points = Object.fromEntries(order.map((p, i) => [p, n - 1 - i]))
  const scores = Object.fromEntries(state.seats.map((p) => [p, state.scores[p]! + points[p]!]))
  const rounds = [...state.rounds, { round: state.round, order, points }]
  const next = { ...state, scores, rounds, titles: order, finished: order }
  if (state.round >= state.options.rounds) return { ...next, phase: 'over' }
  const started = startRound({ ...next, round: state.round + 1 })
  return { ...started, events: [...state.events, ...started.events] }
}

/** Next turn after `from` acted: the next player still in the trick, or a new trick. */
function advance(state: PresidentState, from: PlayerId): PresidentState {
  const lastPlayer = state.trick.at(-1)?.player
  let p = from
  for (let i = 0; i < state.seats.length; i++) {
    p = nextPlayer(state.seats, p)
    if (p === lastPlayer) {
      // Everybody else passed: the trick is won and the winner (or the next player) leads.
      const leader = hasCards(state, p) ? p : nextWithCards(state, p)
      return {
        ...state,
        trick: [],
        passed: [],
        turn: leader,
        events: [...state.events, { type: 'trickWon', player: p }],
      }
    }
    if (hasCards(state, p) && !state.passed.includes(p)) return { ...state, turn: p }
  }
  return { ...state, trick: [], passed: [], turn: nextWithCards(state, from) }
}

function nextWithCards(state: PresidentState, from: PlayerId): PlayerId {
  let p = from
  for (let i = 0; i < state.seats.length; i++) {
    p = nextPlayer(state.seats, p)
    if (hasCards(state, p)) return p
  }
  return from
}

// --- Game definition ---------------------------------------------------------------------------

export const presidentRules = defineGame<
  PresidentState,
  PresidentAction,
  PresidentOptions,
  PresidentView
>({
  id: 'president',
  name: 'President',
  players: { min: 3, max: 7 },
  defaultOptions: DEFAULT_PRESIDENT_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'rounds',
      label: 'Runden',
      choices: [
        { value: 3, label: '3' },
        { value: 5, label: '5' },
        { value: 10, label: '10' },
      ],
    },
    {
      type: 'boolean',
      key: 'exchange',
      label: 'Kartentausch',
      description: 'Ab Runde 2 gibt der Bettler dem Präsidenten seine zwei besten Karten.',
    },
  ],

  setup({ players, options, seed }) {
    const seats = players.map((p) => p.id)
    return startRound({
      seats,
      hands: {},
      round: 1,
      phase: 'playing',
      trick: [],
      passed: [],
      finished: [],
      turn: seats[0]!,
      titles: [],
      gifts: [],
      received: {},
      scores: Object.fromEntries(seats.map((p) => [p, 0])),
      rounds: [],
      events: [],
      options,
      rng: Rng.fromSeed(seed).state,
    })
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const hand = state.hands[player]!
    if (state.phase === 'exchange') {
      const gift = state.gifts.find((g) => g.from === player)!
      return subsets(hand, gift.count).map((cards) => ({
        type: 'give' as const,
        cardIds: cards.map((c) => c.id),
      }))
    }
    const current = top(state)
    const plays: PresidentAction[] = []
    for (const group of groupByRank(hand)) {
      for (let size = 1; size <= group.length; size++) {
        for (const cards of subsets(group, size)) {
          if (canPlay(cards, current)) plays.push({ type: 'play', cardIds: cards.map((c) => c.id) })
        }
      }
    }
    return current ? [...plays, { type: 'pass' }] : plays
  },

  validateAction(state, player, action) {
    if (state.phase === 'over') return 'Das Spiel ist vorbei.'
    if (state.turn !== player) return 'Du bist nicht am Zug.'
    const hand = state.hands[player]!
    const ids = action.type === 'pass' ? [] : action.cardIds
    const cards = ids.map((id) => hand.find((c) => c.id === id))
    if (cards.some((c) => !c) || new Set(ids).size !== ids.length)
      return 'Diese Karten hast du nicht.'
    if (state.phase === 'exchange') {
      if (action.type !== 'give') return 'Erst Karten abgeben.'
      const gift = state.gifts.find((g) => g.from === player)
      return gift && ids.length === gift.count ? null : 'Falsche Anzahl Karten.'
    }
    if (action.type === 'give') return 'Jetzt wird nicht getauscht.'
    if (action.type === 'pass') return top(state) ? null : 'Du spielst aus und musst legen.'
    return canPlay(cards as SuitedCard[], top(state)) ? null : 'Diese Karten passen nicht.'
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    if (action.type === 'give') {
      const gift = state.gifts.find((g) => g.from === player)!
      const cards = hand.filter((c) => action.cardIds.includes(c.id))
      const hands = {
        ...state.hands,
        [player]: hand.filter((c) => !action.cardIds.includes(c.id)),
        [gift.to]: sortHand([...state.hands[gift.to]!, ...cards]),
      }
      const gifts = state.gifts.filter((g) => g !== gift)
      const events: PresidentEvent[] = [
        ...state.events,
        { type: 'exchanged', from: player, to: gift.to, cards },
      ]
      const received = { ...state.received, [gift.to]: cards }
      if (gifts.length > 0)
        return { ...state, hands, gifts, events, received, turn: gifts[0]!.from }
      // The Bettler starts the round.
      return {
        ...state,
        hands,
        gifts,
        events,
        received,
        phase: 'playing',
        turn: state.titles.at(-1)!,
      }
    }
    if (action.type === 'pass') {
      return advance(
        {
          ...state,
          passed: [...state.passed, player],
          events: [{ type: 'passed', player }],
        },
        player,
      )
    }
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    const rest = hand.filter((c) => !action.cardIds.includes(c.id))
    const events: PresidentEvent[] = [{ type: 'played', player, cards }]
    let next: PresidentState = {
      ...state,
      hands: { ...state.hands, [player]: rest },
      trick: [...state.trick, { player, cards }],
      received: { ...state.received, [player]: [] },
      events,
    }
    if (rest.length === 0) {
      const finished = [...state.finished, player]
      events.push({ type: 'finished', player, place: finished.length - 1 })
      next = { ...next, finished }
      if (state.seats.filter((p) => next.hands[p]!.length > 0).length <= 1) return endRound(next)
    }
    return advance(next, player)
  },

  playerView: (state, player) => ({
    seats: state.seats,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.seats.map((p) => [p, state.hands[p]!.length])),
    round: state.round,
    phase: state.phase,
    trick: state.trick,
    passed: state.passed,
    finished: state.finished,
    turn: state.turn,
    titles: state.titles,
    gift: state.gifts.find((g) => g.from === player) ?? null,
    received: state.received[player] ?? [],
    scores: state.scores,
    rounds: state.rounds,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.seats].sort(
      (a, b) =>
        state.scores[b]! - state.scores[a]! || state.titles.indexOf(a) - state.titles.indexOf(b),
    )
    const best = state.scores[ranking[0]!]!
    return {
      scores: state.scores,
      winners: ranking.filter((p) => state.scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) =>
    action.type === 'pass' ? 'pass' : `${action.type} ${action.cardIds.join(' ')}`,
})
