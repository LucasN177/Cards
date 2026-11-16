/**
 * Cribbage for 2–4 players (four: two partnerships). Everybody gives cards to the dealer's crib,
 * a starter is cut, then the cards are played in turn up to 31 ("pegging": fifteens, pairs,
 * runs, go and last card) and finally every hand and the crib are counted with the starter.
 * The first side to reach the target (121 or 61) wins at once. Pure and deterministic.
 */
import {
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  Rng,
  type RngState,
  type SuitedCard,
} from '@/engine'

// --- Options and types -------------------------------------------------------------------------

export interface CribbageOptions {
  /** The game ends as soon as a side reaches this score. */
  readonly targetScore: 121 | 61
}

export const DEFAULT_CRIBBAGE_OPTIONS: CribbageOptions = { targetScore: 121 }

export type CribbageAction =
  /** Give cards to the dealer's crib (two with two players, otherwise one). */
  | { readonly type: 'crib'; readonly cardIds: readonly CardId[] }
  | { readonly type: 'play'; readonly cardId: CardId }

export type ScoreKind =
  'fifteen' | 'pair' | 'run' | 'flush' | 'nobs' | 'thirtyOne' | 'go' | 'lastCard' | 'heels'

/** One scoring combination, e.g. a fifteen of 7 and 8 for two points. */
export interface ScoreItem {
  readonly kind: ScoreKind
  readonly points: number
  readonly cards: readonly SuitedCard[]
}

export interface ShowCount {
  readonly player: PlayerId
  readonly crib: boolean
  readonly cards: readonly SuitedCard[]
  readonly items: readonly ScoreItem[]
  readonly total: number
}

export interface HandResult {
  readonly hand: number
  readonly dealer: PlayerId
  readonly starter: SuitedCard
  /** Points per side from the starter (his heels) and the play. */
  readonly pegging: readonly number[]
  /** Hands in counting order, the crib last (counting stops once a side has won). */
  readonly shows: readonly ShowCount[]
}

export type CribbageEvent =
  | { readonly type: 'cribbed'; readonly player: PlayerId; readonly count: number }
  | { readonly type: 'cut'; readonly card: SuitedCard; readonly heels: boolean }
  | {
      readonly type: 'played'
      readonly player: PlayerId
      readonly card: SuitedCard
      readonly count: number
      readonly items: readonly ScoreItem[]
    }
  | { readonly type: 'go'; readonly player: PlayerId }
  | {
      readonly type: 'goPoint'
      readonly player: PlayerId
      readonly last: boolean
    }
  | { readonly type: 'hand'; readonly result: HandResult }

export interface PlayedCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface CribbageState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  /** Cards still in hand (during the play they leave one by one). */
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** The four cards each player kept after the crib (counted in the show). */
  readonly kept: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly crib: readonly SuitedCard[]
  readonly stock: readonly SuitedCard[]
  readonly starter: SuitedCard | null
  readonly phase: 'crib' | 'play' | 'over'
  readonly turn: PlayerId
  /** Running total of the current series (0–31). */
  readonly count: number
  /** Cards of the current series, in play order. */
  readonly series: readonly PlayedCard[]
  /** Every card played this hand, in play order. */
  readonly played: readonly PlayedCard[]
  readonly lastPlayer: PlayerId | null
  /** Points per side from the starter and the play in this hand. */
  readonly pegging: readonly number[]
  readonly handNumber: number
  /** Per side. */
  readonly scores: readonly number[]
  readonly results: readonly HandResult[]
  readonly events: readonly CribbageEvent[]
  readonly options: CribbageOptions
  readonly rng: RngState
}

export interface CribbageView {
  readonly order: readonly PlayerId[]
  /** The players of each side (partners in a four-player game). */
  readonly sides: readonly (readonly PlayerId[])[]
  readonly mySide: number
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  /** My four cards for the show (known once I have given to the crib). */
  readonly kept: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly cribCount: number
  /** Cards each player still has to give to the crib. */
  readonly cribNeeded: Readonly<Record<PlayerId, number>>
  readonly starter: SuitedCard | null
  readonly phase: CribbageState['phase']
  readonly turn: PlayerId
  readonly count: number
  readonly series: readonly PlayedCard[]
  readonly played: readonly PlayedCard[]
  readonly pegging: readonly number[]
  readonly handNumber: number
  readonly scores: readonly number[]
  readonly results: readonly HandResult[]
  readonly events: readonly CribbageEvent[]
  readonly options: CribbageOptions
}

// --- Cards -------------------------------------------------------------------------------------

const RANK_NUMBER: Readonly<Record<string, number>> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
}
/** Ace 1 up to king 13 (the ace is always low). */
export const rankNumber = (c: SuitedCard) => RANK_NUMBER[c.rank]!
/** Counting value: ace 1, pictures 10. */
export const cardValue = (c: SuitedCard) => Math.min(10, rankNumber(c))

const SUIT_ORDER = ['clubs', 'diamonds', 'spades', 'hearts'] as const
export const sortCards = (cards: readonly SuitedCard[]) =>
  [...cards].sort(
    (a, b) =>
      rankNumber(a) - rankNumber(b) || SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit),
  )

// --- Seating -----------------------------------------------------------------------------------

/** Four players: partners sit across (0 & 2, 1 & 3); otherwise everybody is a side alone. */
export const sideCount = (players: number) => (players === 4 ? 2 : players)
export const sideOf = (order: readonly PlayerId[], player: PlayerId) => {
  const i = order.indexOf(player)
  return order.length === 4 ? i % 2 : i
}
export const sidesOf = (order: readonly PlayerId[]) =>
  Array.from({ length: sideCount(order.length) }, (_, s) =>
    order.filter((p) => sideOf(order, p) === s),
  )

/** Six cards with two players (two to the crib), otherwise five (one to the crib). */
export const handSizeFor = (players: number) => (players === 2 ? 6 : 5)
export const cribCardsFor = (players: number) => (players === 2 ? 2 : 1)

// --- Counting ----------------------------------------------------------------------------------

function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << items.length; mask++)
    out.push(items.filter((_, i) => mask & (1 << i)))
  return out
}

/** Every run of three or more (each combination of duplicate ranks counts separately). */
function runsIn(cards: readonly SuitedCard[]): ScoreItem[] {
  const byRank = new Map<number, SuitedCard[]>()
  for (const c of cards) byRank.set(rankNumber(c), [...(byRank.get(rankNumber(c)) ?? []), c])
  const items: ScoreItem[] = []
  for (let start = 1; start <= 13; start++) {
    if (!byRank.has(start) || byRank.has(start - 1)) continue
    let end = start
    while (byRank.has(end + 1)) end++
    const length = end - start + 1
    if (length < 3) continue
    let combos: SuitedCard[][] = [[]]
    for (let r = start; r <= end; r++)
      combos = combos.flatMap((combo) => byRank.get(r)!.map((c) => [...combo, c]))
    for (const combo of combos) items.push({ kind: 'run', points: length, cards: combo })
  }
  return items
}

/** Pairs, grouped per rank: a pair 2, three of a kind 6, four of a kind 12. */
function pairsIn(cards: readonly SuitedCard[]): ScoreItem[] {
  const byRank = new Map<string, SuitedCard[]>()
  for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c])
  return [...byRank.values()]
    .filter((group) => group.length >= 2)
    .map((group) => ({ kind: 'pair', points: group.length * (group.length - 1), cards: group }))
}

/** The show: fifteens, pairs, runs, flush and nobs of a hand (or the crib) with the starter. */
export function scoreHand(
  hand: readonly SuitedCard[],
  starter: SuitedCard | null,
  crib = false,
): ScoreItem[] {
  const all = starter ? [...hand, starter] : [...hand]
  const items: ScoreItem[] = []
  for (const set of subsets(all))
    if (set.length >= 2 && set.reduce((s, c) => s + cardValue(c), 0) === 15)
      items.push({ kind: 'fifteen', points: 2, cards: set })
  items.push(...pairsIn(all), ...runsIn(all))
  if (hand.length >= 4 && hand.every((c) => c.suit === hand[0]!.suit)) {
    const withStarter = starter?.suit === hand[0]!.suit
    // The crib only counts a flush of all five cards.
    if (withStarter) items.push({ kind: 'flush', points: hand.length + 1, cards: all })
    else if (!crib) items.push({ kind: 'flush', points: hand.length, cards: [...hand] })
  }
  const nobs = starter && hand.find((c) => c.rank === 'J' && c.suit === starter.suit)
  if (nobs) items.push({ kind: 'nobs', points: 1, cards: [nobs] })
  return items
}

export const totalOf = (items: readonly ScoreItem[]) => items.reduce((s, i) => s + i.points, 0)

/** Points for the card just played on top of `series` (which already contains it). */
export function peggingItems(series: readonly SuitedCard[]): ScoreItem[] {
  const items: ScoreItem[] = []
  const count = series.reduce((s, c) => s + cardValue(c), 0)
  const card = series.at(-1)!
  if (count === 15) items.push({ kind: 'fifteen', points: 2, cards: [...series] })
  if (count === 31) items.push({ kind: 'thirtyOne', points: 2, cards: [...series] })
  let same = 1
  while (same < series.length && series[series.length - 1 - same]!.rank === card.rank) same++
  if (same >= 2) items.push({ kind: 'pair', points: same * (same - 1), cards: series.slice(-same) })
  for (let length = series.length; length >= 3; length--) {
    const tail = series.slice(-length)
    const ranks = tail.map(rankNumber).sort((a, b) => a - b)
    if (ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1)) {
      items.push({ kind: 'run', points: length, cards: tail })
      break
    }
  }
  return items
}

// --- Dealing -----------------------------------------------------------------------------------

const record = <T>(order: readonly PlayerId[], value: (p: PlayerId) => T) =>
  Object.fromEntries(order.map((p) => [p, value(p)])) as Record<PlayerId, T>

function startHand(state: CribbageState, dealer: PlayerId, handNumber: number): CribbageState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('standard52')) as SuitedCard[]
  const size = handSizeFor(state.order.length)
  const hands: Record<PlayerId, SuitedCard[]> = {}
  state.order.forEach((p, i) => (hands[p] = sortCards(deck.slice(i * size, (i + 1) * size))))
  let rest = deck.slice(state.order.length * size)
  // Three players: one card from the deck starts the crib.
  const crib = state.order.length === 3 ? [rest[0]!] : []
  if (crib.length > 0) rest = rest.slice(1)
  return {
    ...state,
    dealer,
    hands,
    kept: record(state.order, () => []),
    crib,
    stock: rest,
    starter: null,
    phase: 'crib',
    turn: nextPlayer(state.order, dealer),
    count: 0,
    series: [],
    played: [],
    lastPlayer: null,
    pegging: state.scores.map(() => 0),
    handNumber,
    rng: rng.state,
  }
}

// --- Scoring and the course of a hand ----------------------------------------------------------

const target = (state: CribbageState) => state.options.targetScore

/** Adds points to the player's side; reaching the target ends the game at once. */
function addPoints(
  state: CribbageState,
  player: PlayerId,
  points: number,
  peg = true,
): CribbageState {
  if (points === 0) return state
  const side = sideOf(state.order, player)
  const scores = state.scores.map((s, i) => (i === side ? s + points : s))
  const pegging = peg ? state.pegging.map((s, i) => (i === side ? s + points : s)) : state.pegging
  const next: CribbageState = { ...state, scores, pegging }
  return scores[side]! >= target(state) ? { ...next, phase: 'over' } : next
}

const canPlay = (state: CribbageState, player: PlayerId) =>
  state.hands[player]!.some((c) => state.count + cardValue(c) <= 31)

/**
 * After a card (or at the start of the play): who plays next. Players who cannot play say "go";
 * when nobody can, the last player scores 1 (go, or last card) and a new series begins.
 */
function advance(state: CribbageState, from: PlayerId): CribbageState {
  let s = state
  const events: CribbageEvent[] = [...s.events]
  // Who said "go" in this series (announced once).
  const saidGo = new Set(s.events.flatMap((e) => (e.type === 'go' ? [e.player] : [])))
  for (;;) {
    if (s.phase === 'over') return { ...s, events }
    // Next one who can play, starting after `from` (ending with `from` itself).
    let candidate: PlayerId | null = null
    for (let step = 1; step <= s.order.length; step++) {
      const p = nextPlayer(s.order, from, step)
      if (canPlay(s, p)) {
        candidate = p
        break
      }
      if (s.hands[p]!.length > 0 && s.count > 0 && !saidGo.has(p)) {
        saidGo.add(p)
        events.push({ type: 'go', player: p })
      }
    }
    if (candidate) return { ...s, turn: candidate, events }
    const anyCards = s.order.some((p) => s.hands[p]!.length > 0)
    // Nobody can play: go (or last card) for the last player, unless 31 was just reached.
    if (s.count > 0 && s.lastPlayer) {
      events.push({ type: 'goPoint', player: s.lastPlayer, last: !anyCards })
      s = addPoints(s, s.lastPlayer, 1)
      if (s.phase === 'over') return { ...s, events }
    }
    if (!anyCards) return show({ ...s, events })
    s = { ...s, count: 0, series: [] }
    saidGo.clear()
    from = s.lastPlayer ?? from
  }
}

/** The show: hands from the dealer's left, the dealer's hand, then the crib. */
function show(state: CribbageState): CribbageState {
  let s = state
  const starter = s.starter!
  const shows: ShowCount[] = []
  const counting = [...s.order.map((_, i) => nextPlayer(s.order, s.dealer, i + 1))]
  const entries = [
    ...counting.map((p) => ({ player: p, cards: s.kept[p]!, crib: false })),
    { player: s.dealer, cards: s.crib, crib: true },
  ]
  for (const entry of entries) {
    const items = scoreHand(entry.cards, starter, entry.crib)
    const total = totalOf(items)
    shows.push({ ...entry, cards: sortCards(entry.cards), items, total })
    s = addPoints(s, entry.player, total, false)
    if (s.phase === 'over') break
  }
  const result: HandResult = {
    hand: s.handNumber,
    dealer: s.dealer,
    starter,
    pegging: s.pegging,
    shows,
  }
  const done: CribbageState = {
    ...s,
    results: [...s.results, result],
    events: [...s.events, { type: 'hand', result }],
  }
  if (done.phase === 'over') return done
  const next = startHand(done, nextPlayer(s.order, s.dealer), s.handNumber + 1)
  return { ...next, events: done.events }
}

// --- Game definition ---------------------------------------------------------------------------

export const cribbageRules = defineGame<
  CribbageState,
  CribbageAction,
  CribbageOptions,
  CribbageView
>({
  id: 'cribbage',
  name: 'Cribbage',
  players: { min: 2, max: 4, default: 2 },
  defaultOptions: DEFAULT_CRIBBAGE_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'targetScore',
      label: 'Spielende',
      description:
        'Wer zuerst so viele Punkte erreicht, gewinnt – sofort, auch mitten in der Hand.',
      choices: [
        { value: 121, label: '121 Punkte' },
        { value: 61, label: '61 Punkte' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(order.length)]!
    const base = {
      order,
      scores: Array.from({ length: sideCount(order.length) }, () => 0),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as CribbageState
    return startHand(base, dealer, 0)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const hand = state.hands[player]!
    if (state.phase === 'crib') {
      const n = cribCardsFor(state.order.length)
      return subsets(hand)
        .filter((set) => set.length === n)
        .map((set) => ({ type: 'crib' as const, cardIds: set.map((c) => c.id) }))
    }
    return hand
      .filter((c) => state.count + cardValue(c) <= 31)
      .map((c) => ({ type: 'play' as const, cardId: c.id }))
  },

  validateAction(state, player, action) {
    if (state.phase === 'over' || state.turn !== player) return 'Du bist nicht am Zug'
    const hand = state.hands[player]!
    switch (action.type) {
      case 'crib': {
        if (state.phase !== 'crib') return 'Der Crib ist schon voll'
        const n = cribCardsFor(state.order.length)
        if (action.cardIds.length !== n)
          return n === 1 ? 'Gib genau eine Karte in den Crib' : `Gib genau ${n} Karten in den Crib`
        if (new Set(action.cardIds).size !== n) return 'Eine Karte ist doppelt gewählt'
        if (action.cardIds.some((id) => !hand.some((c) => c.id === id)))
          return 'Diese Karte hast du nicht'
        return null
      }
      case 'play': {
        if (state.phase !== 'play') return 'Erst den Crib füllen'
        const card = hand.find((c) => c.id === action.cardId)
        if (!card) return 'Diese Karte hast du nicht'
        if (state.count + cardValue(card) > 31) return 'Damit käme die Summe über 31'
        return null
      }
    }
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    switch (action.type) {
      case 'crib': {
        const given = hand.filter((c) => action.cardIds.includes(c.id))
        const kept = hand.filter((c) => !action.cardIds.includes(c.id))
        let s: CribbageState = {
          ...state,
          hands: { ...state.hands, [player]: kept },
          kept: { ...state.kept, [player]: kept },
          crib: [...state.crib, ...given],
          events: [{ type: 'cribbed', player, count: given.length }],
        }
        const next = nextPlayer(s.order, player)
        if (player !== s.dealer) return { ...s, turn: next }
        // Everybody has given: cut the starter; a jack scores two for the dealer (his heels).
        const starter = s.stock[0]!
        const heels = starter.rank === 'J'
        s = {
          ...s,
          stock: s.stock.slice(1),
          starter,
          phase: 'play',
          events: [...s.events, { type: 'cut', card: starter, heels }],
        }
        if (heels) s = addPoints(s, s.dealer, 2)
        if (s.phase === 'over') return s
        return { ...s, turn: next }
      }
      case 'play': {
        const card = hand.find((c) => c.id === action.cardId)!
        const series = [...state.series, { player, card }]
        const items = peggingItems(series.map((p) => p.card))
        const count = state.count + cardValue(card)
        let s: CribbageState = {
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c !== card) },
          count,
          series,
          played: [...state.played, { player, card }],
          lastPlayer: player,
          events: [{ type: 'played', player, card, count, items }],
        }
        s = addPoints(s, player, totalOf(items))
        if (s.phase === 'over') return s
        // 31 ends the series at once (no extra point for go).
        if (count === 31) s = { ...s, count: 0, series: [] }
        return advance(s, player)
      }
    }
  },

  playerView(state, player) {
    const side = sideOf(state.order, player)
    const n = cribCardsFor(state.order.length)
    // Players before the dealer (from the dealer's left) give first; the dealer gives last.
    const given = (p: PlayerId) => state.kept[p]!.length > 0
    return {
      order: state.order,
      sides: sidesOf(state.order),
      mySide: side,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      kept: state.kept[player] ?? [],
      handSizes: record(state.order, (p) => state.hands[p]?.length ?? 0),
      cribCount: state.crib.length,
      cribNeeded: record(state.order, (p) => (state.phase === 'crib' && !given(p) ? n : 0)),
      starter: state.starter,
      phase: state.phase,
      turn: state.turn,
      count: state.count,
      series: state.series,
      played: state.played,
      pegging: state.pegging,
      handNumber: state.handNumber,
      scores: state.scores,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const scores = record(state.order, (p) => state.scores[sideOf(state.order, p)]!)
    const ranking = [...state.order].sort((a, b) => scores[b]! - scores[a]!)
    const best = scores[ranking[0]!]!
    return {
      scores,
      winners: state.order.filter((p) => scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
      ...(state.order.length === 4 ? { teams: sidesOf(state.order) } : {}),
    }
  },

  describeAction: (action) =>
    action.type === 'crib' ? `crib ${action.cardIds.join(' ')}` : `play ${action.cardId}`,
})
