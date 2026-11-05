/**
 * Skat for three players with 32 cards: bidding, Skat pickup or Hand game, suit games, Grand and
 * Null, game value with matadors, Schneider and Schwarz. Pure and deterministic; see
 * `SkatRules.tsx` for the rule text.
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

export interface SkatOptions {
  /** Number of deals in a match. */
  readonly games: 3 | 6 | 12
  /** Plain game values, or the Seeger-Fabian list (+50 per win, defenders 40 on a loss). */
  readonly scoring: 'standard' | 'seegerFabian'
}

export const DEFAULT_SKAT_OPTIONS: SkatOptions = { games: 6, scoring: 'seegerFabian' }

export type SkatGame =
  | { readonly type: 'suit'; readonly suit: Suit }
  | { readonly type: 'grand' }
  | { readonly type: 'null' }

export type SkatAction =
  | { readonly type: 'bid'; readonly value: number }
  | { readonly type: 'hold' }
  | { readonly type: 'pass' }
  | { readonly type: 'takeSkat' }
  | { readonly type: 'discard'; readonly cardIds: readonly CardId[] }
  | {
      readonly type: 'declare'
      readonly game: SkatGame
      /** Only in Hand games (and Null ouvert). */
      readonly schneider?: boolean
      readonly schwarz?: boolean
      readonly ouvert?: boolean
    }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface Bidding {
  /** 1: Mittelhand bids Vorhand, 2: Hinterhand bids the winner, 3: Vorhand may still play 18. */
  readonly stage: 1 | 2 | 3
  readonly bidder: PlayerId
  readonly listener: PlayerId
  readonly value: number
  /** Whose answer is awaited. */
  readonly waiting: 'bidder' | 'listener'
}

export interface Announcement {
  readonly schneider: boolean
  readonly schwarz: boolean
  readonly ouvert: boolean
}

export interface SkatGameResult {
  readonly number: number
  /** Null when everybody passed. */
  readonly declarer: PlayerId | null
  readonly game: SkatGame | null
  readonly hand: boolean
  readonly announcement: Announcement
  readonly bid: number
  readonly matadors: number
  /** Declarer's card points (including the Skat). */
  readonly points: number
  readonly won: boolean
  readonly overbid: boolean
  readonly schneider: boolean
  readonly schwarz: boolean
  readonly value: number
  readonly delta: Readonly<Record<PlayerId, number>>
  readonly skat: readonly SuitedCard[]
}

export type SkatEvent =
  | { readonly type: 'bid'; readonly player: PlayerId; readonly value: number }
  | { readonly type: 'hold'; readonly player: PlayerId; readonly value: number }
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'tookSkat'; readonly player: PlayerId }
  | {
      readonly type: 'declared'
      readonly player: PlayerId
      readonly game: SkatGame
      readonly hand: boolean
    }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId; readonly points: number }
  | { readonly type: 'game'; readonly result: SkatGameResult }

export interface SkatState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly skat: readonly SuitedCard[]
  readonly phase: 'bidding' | 'skat' | 'discard' | 'declare' | 'playing' | 'over'
  readonly bidding: Bidding
  readonly declarer: PlayerId | null
  readonly bid: number
  readonly handGame: boolean
  readonly game: SkatGame | null
  readonly announcement: Announcement
  /** Matadors of the declarer, counted from the twelve cards (hand plus Skat). */
  readonly matadors: number
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly won: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly tricksWon: Readonly<Record<PlayerId, number>>
  readonly played: readonly SuitedCard[]
  readonly turn: PlayerId
  readonly gameNumber: number
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly results: readonly SkatGameResult[]
  readonly events: readonly SkatEvent[]
  readonly options: SkatOptions
  readonly rng: RngState
}

export interface SkatView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  /** The Skat, visible only to the declarer once taken (or after a Hand game). */
  readonly skat: readonly SuitedCard[] | null
  readonly phase: SkatState['phase']
  readonly bidding: Bidding
  readonly declarer: PlayerId | null
  readonly bid: number
  readonly handGame: boolean
  readonly game: SkatGame | null
  readonly announcement: Announcement
  /** The declarer's cards in an open (ouvert) game. */
  readonly openHand: readonly SuitedCard[] | null
  readonly trick: readonly TrickCard[]
  readonly lastTrick: SkatState['lastTrick']
  readonly tricksWon: SkatState['tricksWon']
  /** Card points you (and your partner, as a defender) have taken so far. */
  readonly myPoints: number
  readonly played: readonly SuitedCard[]
  readonly turn: PlayerId
  readonly gameNumber: number
  readonly scores: SkatState['scores']
  readonly results: readonly SkatGameResult[]
  readonly events: readonly SkatEvent[]
  readonly options: SkatOptions
}

// --- Cards and values --------------------------------------------------------------------------

export const BID_VALUES: readonly number[] = [
  18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60, 63, 66, 70, 72,
  77, 80, 81, 84, 88, 90, 96, 99, 100, 108, 110, 117, 120, 121, 126, 130, 132, 135, 140, 143, 144,
  150, 153, 154, 160, 162, 165, 168, 170, 176, 180, 187, 192, 198, 204, 216, 240, 264,
]

export const SUIT_BASE: Readonly<Record<Suit, number>> = {
  clubs: 12,
  spades: 11,
  hearts: 10,
  diamonds: 9,
}
export const GRAND_BASE = 24

const VALUES: Readonly<Partial<Record<Rank, number>>> = { A: 11, '10': 10, K: 4, Q: 3, J: 2 }
export const cardPoints = (c: SuitedCard) => VALUES[c.rank] ?? 0
export const sumPoints = (cards: readonly SuitedCard[]) =>
  cards.reduce((s, c) => s + cardPoints(c), 0)

const JACK_ORDER: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds']
/** Plain order in suit games and Grand (low to high). */
const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'Q', 'K', '10', 'A']
/** Order in Null (low to high). */
const NULL_ORDER: readonly Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const isJack = (c: SuitedCard) => c.rank === 'J'

/** The suit a card belongs to in this game; 'trump' for jacks and the trump suit. */
export function effectiveSuit(c: SuitedCard, game: SkatGame | null): Suit | 'trump' {
  if (!game || game.type === 'null') return c.suit
  if (isJack(c)) return 'trump'
  if (game.type === 'suit' && c.suit === game.suit) return 'trump'
  return c.suit
}

/** Trick strength of `c` when `led` was led; cards that cannot win get −1. */
export function power(c: SuitedCard, game: SkatGame, led: Suit | 'trump'): number {
  if (game.type === 'null') return c.suit === led ? NULL_ORDER.indexOf(c.rank) : -1
  if (isJack(c)) return 100 + (3 - JACK_ORDER.indexOf(c.suit))
  const suit = effectiveSuit(c, game)
  if (suit === 'trump') return 50 + PLAIN_ORDER.indexOf(c.rank)
  return suit === led ? PLAIN_ORDER.indexOf(c.rank) : -1
}

export function trickWinner(trick: readonly TrickCard[], game: SkatGame): PlayerId {
  const led = effectiveSuit(trick[0]!.card, game)
  return trick.reduce((best, t) =>
    power(t.card, game, led) > power(best.card, game, led) ? t : best,
  ).player
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }

/** How a player holds the cards: jacks and trumps first, then the other suits. */
export function sortHand(cards: readonly SuitedCard[], game: SkatGame | null) {
  const key = (c: SuitedCard) => {
    if (game?.type === 'null') return SUIT_ORDER[c.suit] * 10 + (7 - NULL_ORDER.indexOf(c.rank))
    if (isJack(c)) return JACK_ORDER.indexOf(c.suit)
    const trumpFirst = game?.type === 'suit' && c.suit === game.suit ? -1 : SUIT_ORDER[c.suit]
    return 10 + (trumpFirst + 1) * 10 + (6 - PLAIN_ORDER.indexOf(c.rank))
  }
  return [...cards].sort((a, b) => key(a) - key(b))
}

/** The top trumps in order, for counting matadors ("mit"/"ohne"). */
function trumpSequence(game: SkatGame): string[] {
  const jacks = JACK_ORDER.map((s) => `J${s}`)
  if (game.type !== 'suit') return jacks
  return [...jacks, ...[...PLAIN_ORDER].reverse().map((r) => `${r}${game.suit}`)]
}

/** Matadors: how many top trumps in a row the declarer has – or is missing ("ohne"). */
export function matadors(cards: readonly SuitedCard[], game: SkatGame): number {
  if (game.type === 'null') return 0
  const held = new Set(cards.map((c) => `${c.rank}${c.suit}`))
  const seq = trumpSequence(game)
  const first = held.has(seq[0]!)
  let n = 0
  for (const key of seq) {
    if (held.has(key) !== first) break
    n++
  }
  return n
}

export const baseValue = (game: SkatGame) =>
  game.type === 'suit' ? SUIT_BASE[game.suit] : game.type === 'grand' ? GRAND_BASE : 23

export function nullValue(hand: boolean, ouvert: boolean) {
  if (ouvert) return hand ? 59 : 46
  return hand ? 35 : 23
}

/**
 * Game value before playing, assuming nothing beyond the announcements – the least the
 * declarer will get when winning. Used to warn about overbidding and by the AI.
 */
export function minimumValue(
  cards: readonly SuitedCard[],
  game: SkatGame,
  hand: boolean,
  announcement: Partial<Announcement> = {},
) {
  if (game.type === 'null') return nullValue(hand, announcement.ouvert === true)
  let multiplier = matadors(cards, game) + 1
  if (hand) multiplier++
  if (announcement.schneider) multiplier += 2 // Schneider plus "angesagt"
  if (announcement.schwarz) multiplier += 2
  return baseValue(game) * multiplier
}

// --- Flow --------------------------------------------------------------------------------------

const positions = (order: readonly PlayerId[], dealer: PlayerId) => {
  const vorhand = nextPlayer(order, dealer)
  const mittelhand = nextPlayer(order, vorhand)
  return { vorhand, mittelhand, hinterhand: nextPlayer(order, mittelhand) }
}

export const positionOf = (order: readonly PlayerId[], dealer: PlayerId, p: PlayerId) => {
  const pos = positions(order, dealer)
  return p === pos.vorhand ? 'Vorhand' : p === pos.mittelhand ? 'Mittelhand' : 'Hinterhand'
}

const NO_ANNOUNCEMENT: Announcement = { schneider: false, schwarz: false, ouvert: false }

function startGame(state: SkatState, number: number, dealer: PlayerId): SkatState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('piquet32')) as SuitedCard[]
  const { vorhand, mittelhand, hinterhand } = positions(state.order, dealer)
  // Dealt 3 – Skat – 4 – 3 in real life; the result is the same random split.
  const hands = {
    [vorhand]: sortHand(deck.slice(0, 10), null),
    [mittelhand]: sortHand(deck.slice(10, 20), null),
    [hinterhand]: sortHand(deck.slice(20, 30), null),
  }
  return {
    ...state,
    dealer,
    hands,
    skat: deck.slice(30),
    phase: 'bidding',
    bidding: { stage: 1, bidder: mittelhand, listener: vorhand, value: 0, waiting: 'bidder' },
    declarer: null,
    bid: 0,
    handGame: false,
    game: null,
    announcement: NO_ANNOUNCEMENT,
    trick: [],
    lastTrick: null,
    won: Object.fromEntries(state.order.map((p) => [p, []])),
    tricksWon: Object.fromEntries(state.order.map((p) => [p, 0])),
    played: [],
    turn: mittelhand,
    gameNumber: number,
    rng: rng.state,
  }
}

function nextGame(state: SkatState, result: SkatGameResult): SkatState {
  const scores = Object.fromEntries(
    state.order.map((p) => [p, state.scores[p]! + (result.delta[p] ?? 0)]),
  )
  const finished: SkatState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'game', result }],
  }
  if (state.gameNumber >= state.options.games) return { ...finished, phase: 'over' }
  const next = startGame(finished, state.gameNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

function passedIn(state: SkatState): SkatState {
  return nextGame(state, {
    number: state.gameNumber,
    declarer: null,
    game: null,
    hand: false,
    announcement: NO_ANNOUNCEMENT,
    bid: 0,
    matadors: 0,
    points: 0,
    won: false,
    overbid: false,
    schneider: false,
    schwarz: false,
    value: 0,
    delta: {},
    skat: state.skat,
  })
}

function winBidding(state: SkatState, declarer: PlayerId, bid: number): SkatState {
  return { ...state, declarer, bid, phase: 'skat', turn: declarer }
}

/** Applies a bidding move and moves on to the next stage when somebody drops out. */
function bidMove(state: SkatState, player: PlayerId, action: SkatAction): SkatState {
  const b = state.bidding
  const { vorhand, hinterhand } = positions(state.order, state.dealer)
  const event: SkatEvent =
    action.type === 'bid'
      ? { type: 'bid', player, value: action.value }
      : action.type === 'hold'
        ? { type: 'hold', player, value: b.value }
        : { type: 'passed', player }
  const s = { ...state, events: [event] }

  if (b.stage === 3) {
    // Vorhand decides alone after both others passed.
    return action.type === 'bid' ? winBidding(s, vorhand, 18) : passedIn(s)
  }
  if (action.type === 'bid') {
    return { ...s, bidding: { ...b, value: action.value, waiting: 'listener' }, turn: b.listener }
  }
  if (action.type === 'hold') {
    return { ...s, bidding: { ...b, waiting: 'bidder' }, turn: b.bidder }
  }
  // Somebody passed: the other one stays in.
  const stays = player === b.bidder ? b.listener : b.bidder
  if (b.stage === 1) {
    return {
      ...s,
      bidding: { stage: 2, bidder: hinterhand, listener: stays, value: b.value, waiting: 'bidder' },
      turn: hinterhand,
    }
  }
  if (b.value === 0) {
    // Nobody has bid yet: Vorhand may still play for 18.
    return {
      ...s,
      bidding: { stage: 3, bidder: vorhand, listener: vorhand, value: 0, waiting: 'bidder' },
      turn: vorhand,
    }
  }
  return winBidding(s, stays, b.value)
}

function startPlay(state: SkatState): SkatState {
  const { vorhand } = positions(state.order, state.dealer)
  const hands = Object.fromEntries(
    state.order.map((p) => [p, sortHand(state.hands[p]!, state.game)]),
  )
  return { ...state, hands, phase: 'playing', turn: vorhand }
}

function scoreGame(state: SkatState): SkatState {
  const declarer = state.declarer!
  const game = state.game!
  const defenders = state.order.filter((p) => p !== declarer)
  const points = sumPoints(state.won[declarer]!) + sumPoints(state.skat)
  const declarerTricks = state.tricksWon[declarer]!
  const defenderTricks = defenders.reduce((s, p) => s + state.tricksWon[p]!, 0)
  const a = state.announcement
  let won: boolean
  let value: number
  let schneider = false
  let schwarz = false
  if (game.type === 'null') {
    won = declarerTricks === 0
    value = nullValue(state.handGame, a.ouvert)
  } else {
    schneider = points >= 90 || points <= 30
    schwarz = defenderTricks === 0 || declarerTricks === 0
    won = points >= 61
    if (a.schneider && points < 90) won = false
    if (a.schwarz && defenderTricks > 0) won = false
    let multiplier = state.matadors + 1
    if (state.handGame) multiplier++
    if (schneider) multiplier++
    if (a.schneider) multiplier++
    if (schwarz) multiplier++
    if (a.schwarz) multiplier++
    value = baseValue(game) * multiplier
  }
  let overbid = false
  if (value < state.bid) {
    // Overbid: lost, worth the smallest multiple of the base value that reaches the bid.
    overbid = true
    won = false
    value =
      game.type === 'null'
        ? ([23, 35, 46, 59].find((v) => v >= state.bid) ?? 59)
        : baseValue(game) * Math.ceil(state.bid / baseValue(game))
  }
  const delta: Record<PlayerId, number> = Object.fromEntries(state.order.map((p) => [p, 0]))
  const seeger = state.options.scoring === 'seegerFabian'
  if (won) delta[declarer] = value + (seeger ? 50 : 0)
  else {
    delta[declarer] = -2 * value - (seeger ? 50 : 0)
    if (seeger) for (const p of defenders) delta[p] = 40
  }
  return nextGame(state, {
    number: state.gameNumber,
    declarer,
    game,
    hand: state.handGame,
    announcement: a,
    bid: state.bid,
    matadors: state.matadors,
    points,
    won,
    overbid,
    schneider,
    schwarz,
    value,
    delta,
    skat: state.skat,
  })
}

/** Cards `player` may play: follow the led suit (jacks belong to trump outside Null). */
export function playableCards(state: SkatState, player: PlayerId): SuitedCard[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const hand = state.hands[player]!
  if (state.trick.length === 0) return [...hand]
  const led = effectiveSuit(state.trick[0]!.card, state.game)
  const follow = hand.filter((c) => effectiveSuit(c, state.game) === led)
  return follow.length > 0 ? follow : [...hand]
}

function pairs<T>(items: readonly T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!])
  return out
}

export const SKAT_GAMES: readonly SkatGame[] = [
  { type: 'suit', suit: 'clubs' },
  { type: 'suit', suit: 'spades' },
  { type: 'suit', suit: 'hearts' },
  { type: 'suit', suit: 'diamonds' },
  { type: 'grand' },
  { type: 'null' },
]

export type DeclareAction = Extract<SkatAction, { type: 'declare' }>

/** Every game the declarer may announce now (Schneider/Schwarz only in Hand games). */
export function declareOptions(hand: boolean): DeclareAction[] {
  const out: DeclareAction[] = []
  for (const game of SKAT_GAMES) {
    if (game.type === 'null') {
      out.push({ type: 'declare', game })
      out.push({ type: 'declare', game, ouvert: true })
      continue
    }
    out.push({ type: 'declare', game })
    if (hand) {
      out.push({ type: 'declare', game, schneider: true })
      out.push({ type: 'declare', game, schneider: true, schwarz: true })
    }
  }
  return out
}

/** Canonical key of an action: optional flags that are false or missing do not matter. */
const actionKey = (a: SkatAction) =>
  JSON.stringify(a, (_k, v: unknown) => (v === false || v === undefined ? undefined : v))

export const gameName = (game: SkatGame) =>
  game.type === 'grand'
    ? 'Grand'
    : game.type === 'null'
      ? 'Null'
      : ({ clubs: 'Kreuz', spades: 'Pik', hearts: 'Herz', diamonds: 'Karo' } as const)[game.suit]

// --- Game definition ---------------------------------------------------------------------------

function legal(state: SkatState, player: PlayerId): SkatAction[] {
  if (state.phase === 'over' || state.turn !== player) return []
  switch (state.phase) {
    case 'bidding': {
      const b = state.bidding
      if (b.stage === 3) return [{ type: 'bid', value: 18 }, { type: 'pass' }]
      if (b.waiting === 'listener') return [{ type: 'hold' }, { type: 'pass' }]
      return [
        ...BID_VALUES.filter((v) => v > b.value).map((value) => ({ type: 'bid' as const, value })),
        { type: 'pass' },
      ]
    }
    case 'skat':
      return [{ type: 'takeSkat' }, ...declareOptions(true)]
    case 'discard':
      return pairs(state.hands[player]!).map(([a, b]) => ({
        type: 'discard' as const,
        cardIds: [a.id, b.id],
      }))
    case 'declare':
      return declareOptions(false)
    case 'playing':
      return playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id }))
  }
}

export const skatRules = defineGame<SkatState, SkatAction, SkatOptions, SkatView>({
  id: 'skat',
  name: 'Skat',
  players: { min: 3, max: 3 },
  defaultOptions: DEFAULT_SKAT_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'games',
      label: 'Spiele',
      description: 'So oft wird gegeben (auch eingepasste Spiele zählen).',
      choices: [
        { value: 3, label: '3 Spiele' },
        { value: 6, label: '6 Spiele' },
        { value: 12, label: '12 Spiele' },
      ],
    },
    {
      type: 'choice',
      key: 'scoring',
      label: 'Wertung',
      choices: [
        { value: 'seegerFabian', label: 'Seeger-Fabian (+50, Gegner 40)' },
        { value: 'standard', label: 'Nur Spielwert' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(3)]!
    const base = {
      order,
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      results: [],
      events: [],
      matadors: 0,
      options,
      rng: rng.state,
    } as unknown as SkatState
    return startGame(base, 1, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions: legal,

  validateAction(state, player, action) {
    if (state.turn !== player || state.phase === 'over') return 'Du bist nicht am Zug'
    if (action.type === 'discard') {
      const hand = state.hands[player]!
      const ids = new Set(action.cardIds)
      if (state.phase !== 'discard') return 'Jetzt wird nicht gedrückt'
      return ids.size === 2 && [...ids].every((id) => hand.some((c) => c.id === id))
        ? null
        : 'Wähle genau zwei Karten'
    }
    const key = actionKey(action)
    return legal(state, player).some((a) => actionKey(a) === key)
      ? null
      : 'Dieser Zug ist jetzt nicht erlaubt'
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'bid':
      case 'hold':
      case 'pass':
        return bidMove(state, player, action)
      case 'takeSkat':
        return {
          ...state,
          hands: {
            ...state.hands,
            [player]: sortHand([...state.hands[player]!, ...state.skat], null),
          },
          skat: [],
          phase: 'discard',
          events: [{ type: 'tookSkat', player }],
        }
      case 'discard': {
        const hand = state.hands[player]!
        return {
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => !action.cardIds.includes(c.id)) },
          skat: hand.filter((c) => action.cardIds.includes(c.id)),
          phase: 'declare',
          events: [],
        }
      }
      case 'declare': {
        const hand = state.phase === 'skat'
        const announcement: Announcement = {
          schneider: action.schneider === true || action.schwarz === true,
          schwarz: action.schwarz === true,
          ouvert: action.ouvert === true,
        }
        return startPlay({
          ...state,
          game: action.game,
          handGame: hand,
          announcement,
          matadors: matadors([...state.hands[player]!, ...state.skat], action.game),
          events: [{ type: 'declared', player, game: action.game, hand }],
        })
      }
      case 'play': {
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const trick = [...state.trick, { player, card }]
        const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
        const played = [...state.played, card]
        const events: SkatEvent[] = [{ type: 'played', player, card }]
        if (trick.length < 3) {
          return { ...state, hands, trick, played, events, turn: nextPlayer(state.order, player) }
        }
        const game = state.game!
        const winner = trickWinner(trick, game)
        const cards = trick.map((t) => t.card)
        const next: SkatState = {
          ...state,
          hands,
          played,
          trick: [],
          lastTrick: { cards: trick, winner },
          won: { ...state.won, [winner]: [...state.won[winner]!, ...cards] },
          tricksWon: { ...state.tricksWon, [winner]: state.tricksWon[winner]! + 1 },
          turn: winner,
          events: [...events, { type: 'trick', winner, points: sumPoints(cards) }],
        }
        // Null is lost with the declarer's first trick; otherwise all ten tricks are played.
        const nullLost = game.type === 'null' && winner === state.declarer
        return nullLost || hands[player]!.length === 0 ? scoreGame(next) : next
      }
    }
  },

  playerView(state, player) {
    const declarer = state.declarer
    const isDeclarer = (p: PlayerId) => p === declarer
    const myPoints =
      declarer === null
        ? 0
        : state.order
            .filter((p) => isDeclarer(p) === isDeclarer(player))
            .reduce((s, p) => s + sumPoints(state.won[p]!), 0)
    const showSkat = player === declarer && (state.phase === 'declare' || state.phase === 'playing')
    return {
      order: state.order,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
      skat: showSkat ? state.skat : null,
      phase: state.phase,
      bidding: state.bidding,
      declarer,
      bid: state.bid,
      handGame: state.handGame,
      game: state.game,
      announcement: state.announcement,
      openHand:
        state.announcement.ouvert && state.phase === 'playing' && declarer
          ? state.hands[declarer]!
          : null,
      trick: state.trick,
      lastTrick: state.lastTrick,
      tricksWon: state.tricksWon,
      myPoints,
      played: state.played,
      turn: state.turn,
      gameNumber: state.gameNumber,
      scores: state.scores,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

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

  describeAction: (action) => actionKey(action),
})
