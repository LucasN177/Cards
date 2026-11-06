/**
 * Classic Canasta for 2–4 players (four: two partnerships; two or three: everyone alone, 15/13
 * cards, draw two, two canastas to go out). 108 cards with jokers and twos as wild cards, red
 * threes as bonus cards, black threes as stop cards. Pure and deterministic.
 */
import {
  type Card,
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  type Rank,
  Rng,
  type RngState,
} from '@/engine'

// --- Options and types -------------------------------------------------------------------------

export interface CanastaOptions {
  /** The game ends once a side reaches this score; 0 = a single hand. */
  readonly targetScore: 5000 | 2500 | 0
  /** Variant: the discard pile is always frozen (taking it always needs a natural pair). */
  readonly alwaysFrozen: boolean
}

export const DEFAULT_CANASTA_OPTIONS: CanastaOptions = { targetScore: 5000, alwaysFrozen: false }

/** A group of hand cards for the side's meld of `rank` (new, or added to the existing one). */
export interface MeldGroup {
  readonly rank: Rank
  readonly cardIds: readonly CardId[]
}

export type CanastaAction =
  | { readonly type: 'drawStock' }
  /** Take the whole pile: the top card goes into the group of its rank. */
  | { readonly type: 'takePile'; readonly groups: readonly MeldGroup[] }
  | { readonly type: 'meld'; readonly groups: readonly MeldGroup[] }
  | { readonly type: 'discard'; readonly cardId: CardId }

export interface Meld {
  readonly rank: Rank
  readonly cards: readonly Card[]
}

export interface SideScore {
  readonly melds: number
  readonly canastas: number
  /** Number of canastas (natural and mixed). */
  readonly canastaCount: number
  readonly redThrees: number
  readonly goingOut: number
  readonly hand: number
  readonly total: number
}

export interface HandResult {
  readonly hand: number
  /** Who went out (null: the stock ran out). */
  readonly wentOut: PlayerId | null
  readonly concealed: boolean
  /** Per side (index into `sides`). */
  readonly sides: readonly SideScore[]
}

export type CanastaEvent =
  | { readonly type: 'drew'; readonly player: PlayerId; readonly count: number }
  | { readonly type: 'redThree'; readonly player: PlayerId; readonly card: Card }
  | {
      readonly type: 'tookPile'
      readonly player: PlayerId
      readonly top: Card
      readonly count: number
    }
  | { readonly type: 'melded'; readonly player: PlayerId; readonly value: number }
  | { readonly type: 'discarded'; readonly player: PlayerId; readonly card: Card }
  | { readonly type: 'hand'; readonly result: HandResult }

export interface CanastaState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>
  readonly stock: readonly Card[]
  /** Discard pile, top card last. */
  readonly discard: readonly Card[]
  /** Melds per side. */
  readonly melds: readonly (readonly Meld[])[]
  readonly redThrees: readonly (readonly Card[])[]
  /** Who has melded in this hand (for going out concealed). */
  readonly hasMelded: Readonly<Record<PlayerId, boolean>>
  readonly phase: 'draw' | 'play' | 'over'
  readonly turn: PlayerId
  /** Whether the side on turn had melded before this turn (going out concealed needs it not). */
  readonly meldedBeforeTurn: boolean
  /** Cards each player took with the pile this hand (seen by everybody). */
  readonly pickups: Readonly<Record<PlayerId, readonly Card[]>>
  readonly thrown: Readonly<Record<PlayerId, readonly Card[]>>
  readonly handNumber: number
  /** Per side. */
  readonly scores: readonly number[]
  readonly results: readonly HandResult[]
  readonly events: readonly CanastaEvent[]
  readonly options: CanastaOptions
  readonly rng: RngState
}

export interface CanastaView {
  readonly order: readonly PlayerId[]
  /** The players of each side (partners in a four-player game). */
  readonly sides: readonly (readonly PlayerId[])[]
  readonly mySide: number
  readonly dealer: PlayerId
  readonly hand: readonly Card[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly stockCount: number
  readonly discardTop: Card | null
  readonly discardCount: number
  /** Every card in the discard pile (all were discarded openly), top card last. */
  readonly discardPile: readonly Card[]
  /** Whether the pile is frozen for my side right now. */
  readonly pileFrozen: boolean
  readonly melds: CanastaState['melds']
  readonly redThrees: CanastaState['redThrees']
  readonly hasMelded: CanastaState['hasMelded']
  readonly phase: CanastaState['phase']
  readonly turn: PlayerId
  /** Points my side's first meld needs (0 once the side has melded). */
  readonly minimum: number
  readonly canastasNeeded: number
  readonly drawCount: number
  readonly pickups: CanastaState['pickups']
  readonly thrown: CanastaState['thrown']
  readonly handNumber: number
  readonly scores: readonly number[]
  readonly results: readonly HandResult[]
  readonly events: readonly CanastaEvent[]
  readonly options: CanastaOptions
}

// --- Cards -------------------------------------------------------------------------------------

export const isWild = (c: Card) => c.kind === 'joker' || c.rank === '2'
export const isRedThree = (c: Card) =>
  c.kind === 'suited' && c.rank === '3' && (c.suit === 'hearts' || c.suit === 'diamonds')
export const isBlackThree = (c: Card) =>
  c.kind === 'suited' && c.rank === '3' && (c.suit === 'clubs' || c.suit === 'spades')
/** The rank a natural card melds as (null for wild cards). */
export const naturalRank = (c: Card): Rank | null =>
  isWild(c) || c.kind !== 'suited' ? null : c.rank

/** Joker 50, two and ace 20, king to eight 10, seven to four and black three 5. */
export function cardPoints(c: Card) {
  if (c.kind === 'joker') return 50
  if (c.rank === '2' || c.rank === 'A') return 20
  if (['K', 'Q', 'J', '10', '9', '8'].includes(c.rank)) return 10
  if (isRedThree(c)) return 100
  return 5
}

export const pointsOf = (cards: readonly Card[]) => cards.reduce((s, c) => s + cardPoints(c), 0)

const RANK_ORDER: readonly Rank[] = [
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
  '3',
  '2',
]
/** By rank (fours first, aces, then black threes, twos and jokers last). */
export function sortHand(cards: readonly Card[]) {
  const key = (c: Card) => (c.kind === 'joker' ? 99 : RANK_ORDER.indexOf(c.rank))
  return [...cards].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id))
}

export const isCanasta = (m: Meld) => m.cards.length >= 7
export const isNaturalCanasta = (m: Meld) => isCanasta(m) && !m.cards.some(isWild)
export const MAX_WILDS = 3

/** Why these cards are no valid meld of `rank`, or null. */
export function meldProblem(rank: Rank, cards: readonly Card[]): string | null {
  if (rank === '2') return 'Zweien sind Joker und bilden keine eigene Meldung'
  const wilds = cards.filter(isWild)
  const naturals = cards.filter((c) => !isWild(c))
  if (naturals.some((c) => naturalRank(c) !== rank))
    return 'Eine Meldung besteht aus Karten eines Werts'
  if (rank === '3') {
    if (naturals.some(isRedThree)) return 'Rote Dreien sind Bonuskarten'
    if (wilds.length > 0) return 'Schwarze Dreien werden ohne Joker gemeldet'
  }
  if (cards.length < 3) return 'Eine Meldung braucht mindestens drei Karten'
  if (naturals.length < 2) return 'Eine Meldung braucht mindestens zwei natürliche Karten'
  if (wilds.length > MAX_WILDS) return `Höchstens ${MAX_WILDS} Joker pro Meldung`
  return null
}

// --- Sides, minimums ---------------------------------------------------------------------------

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

export const handSizeFor = (players: number) => (players === 4 ? 11 : players === 3 ? 13 : 15)
export const drawCountFor = (players: number) => (players === 4 ? 1 : 2)
export const canastasNeededFor = (players: number) => (players === 4 ? 1 : 2)

/** Points the first meld of a side needs, by its score: 15, 50, 90 or 120. */
export function minimumFor(score: number) {
  if (score < 0) return 15
  if (score < 1500) return 50
  if (score < 3000) return 90
  return 120
}

export const sideHasMelded = (state: Pick<CanastaState, 'melds'>, side: number) =>
  state.melds[side]!.length > 0

/** Frozen: for a side without melds, with a wild card or red three in it, or always (variant). */
export function pileFrozenFor(state: CanastaState, side: number) {
  return (
    state.options.alwaysFrozen ||
    !sideHasMelded(state, side) ||
    state.discard.some((c) => isWild(c) || isRedThree(c))
  )
}

// --- Dealing -----------------------------------------------------------------------------------

/** Lays out red threes from `hand`, replacing each from the stock (again if needed). */
function placeRedThrees(hand: Card[], stock: Card[], into: Card[]) {
  for (let i = 0; i < hand.length;) {
    if (isRedThree(hand[i]!)) {
      into.push(hand[i]!)
      hand.splice(i, 1)
      const replacement = stock.shift()
      if (replacement) hand.push(replacement)
    } else i++
  }
}

function startHand(state: CanastaState, dealer: PlayerId, handNumber: number): CanastaState {
  const rng = new Rng(state.rng)
  const stock = rng.shuffle(createDeck('canasta108'))
  const order = state.order
  const size = handSizeFor(order.length)
  const hands: Record<PlayerId, Card[]> = {}
  for (const p of order) hands[p] = stock.splice(0, size)
  const redThrees: Card[][] = Array.from({ length: sideCount(order.length) }, () => [])
  for (const p of order) placeRedThrees(hands[p]!, stock, redThrees[sideOf(order, p)]!)
  // The upcard: while it is a wild card or a red three, another card is turned on top.
  const discard: Card[] = [stock.shift()!]
  while (isWild(discard.at(-1)!) || isRedThree(discard.at(-1)!)) discard.push(stock.shift()!)
  const first = nextPlayer(order, dealer)
  return {
    ...state,
    dealer,
    hands: Object.fromEntries(order.map((p) => [p, sortHand(hands[p]!)])),
    stock,
    discard,
    melds: redThrees.map(() => []),
    redThrees,
    hasMelded: Object.fromEntries(order.map((p) => [p, false])),
    phase: 'draw',
    turn: first,
    meldedBeforeTurn: false,
    pickups: Object.fromEntries(order.map((p) => [p, []])),
    thrown: Object.fromEntries(order.map((p) => [p, []])),
    handNumber,
    rng: rng.state,
  }
}

// --- Melding (shared by validation and application) --------------------------------------------

interface MeldOutcome {
  readonly melds: readonly Meld[]
  readonly hand: readonly Card[]
  readonly value: number
}

/** Applies `groups` (plus `extra` cards, e.g. the pile's top card) to the side's melds. */
function simulateMelds(
  state: CanastaState,
  player: PlayerId,
  groups: readonly MeldGroup[],
  extra: readonly Card[] = [],
): MeldOutcome | string {
  const hand = [...state.hands[player]!, ...extra]
  const side = sideOf(state.order, player)
  const ids = groups.flatMap((g) => g.cardIds)
  if (new Set(ids).size !== ids.length) return 'Eine Karte ist doppelt gewählt'
  if (ids.some((id) => !hand.some((c) => c.id === id))) return 'Diese Karten hast du nicht'
  if (new Set(groups.map((g) => g.rank)).size !== groups.length)
    return 'Pro Wert gibt es nur eine Meldung'
  const melds = [...state.melds[side]!]
  let value = 0
  for (const group of groups) {
    const cards = group.cardIds.map((id) => hand.find((c) => c.id === id)!)
    const index = melds.findIndex((m) => m.rank === group.rank)
    const combined = [...(index >= 0 ? melds[index]!.cards : []), ...cards]
    const problem = meldProblem(group.rank, combined)
    if (problem) return problem
    value += pointsOf(cards)
    const meld = { rank: group.rank, cards: combined }
    if (index >= 0) melds[index] = meld
    else melds.push(meld)
  }
  return { melds, hand: hand.filter((c) => !ids.includes(c.id)), value }
}

const canastasIn = (melds: readonly Meld[]) => melds.filter(isCanasta).length

/** Checks the hand size left after melding: going out needs the canastas. */
function goingOutProblem(state: CanastaState, outcome: MeldOutcome, groups: readonly MeldGroup[]) {
  const needed = canastasNeededFor(state.order.length)
  const left = outcome.hand.length
  const enough = canastasIn(outcome.melds) >= needed
  if (left <= 1 && !enough)
    return needed === 1
      ? 'Ausmachen geht erst mit einem Canasta – behalte mindestens zwei Karten'
      : 'Ausmachen geht erst mit zwei Canastas – behalte mindestens zwei Karten'
  if (groups.some((g) => g.rank === '3') && left > 1)
    return 'Schwarze Dreien darfst du nur beim Ausmachen melden'
  return null
}

// --- Hand end ----------------------------------------------------------------------------------

function sideScore(
  state: CanastaState,
  side: number,
  wentOut: PlayerId | null,
  concealed: boolean,
) {
  const melds = state.melds[side]!
  const meldPoints = melds.reduce((s, m) => s + pointsOf(m.cards), 0)
  const canastas = melds.reduce(
    (s, m) => s + (isNaturalCanasta(m) ? 500 : isCanasta(m) ? 300 : 0),
    0,
  )
  const threes = state.redThrees[side]!.length
  const threeValue = threes === 4 ? 800 : threes * 100
  // Red threes count against a side that has not melded anything.
  const redThrees = melds.length > 0 ? threeValue : -threeValue
  const goingOut =
    wentOut !== null && sideOf(state.order, wentOut) === side ? (concealed ? 200 : 100) : 0
  const hand = -state.order
    .filter((p) => sideOf(state.order, p) === side)
    .reduce((s, p) => s + pointsOf(state.hands[p]!), 0)
  return {
    melds: meldPoints,
    canastas,
    canastaCount: melds.filter(isCanasta).length,
    redThrees,
    goingOut,
    hand,
    total: meldPoints + canastas + redThrees + goingOut + hand,
  }
}

function endHand(state: CanastaState, wentOut: PlayerId | null): CanastaState {
  const concealed = wentOut !== null && !state.meldedBeforeTurn && wentOut === state.turn
  const sides = state.melds.map((_, s) => sideScore(state, s, wentOut, concealed))
  const result: HandResult = { hand: state.handNumber, wentOut, concealed, sides }
  const scores = state.scores.map((s, i) => s + sides[i]!.total)
  const done: CanastaState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'hand', result }],
  }
  const target = state.options.targetScore
  if (target === 0 || scores.some((s) => s >= target)) return { ...done, phase: 'over' }
  const next = startHand(done, nextPlayer(state.order, state.dealer), state.handNumber + 1)
  return { ...next, events: done.events }
}

/** After a meld or discard: the turn passes on (or the hand ends when the hand is empty). */
function afterDiscard(state: CanastaState, player: PlayerId): CanastaState {
  if (state.hands[player]!.length === 0) return endHand(state, player)
  const following = nextPlayer(state.order, player)
  return {
    ...state,
    phase: 'draw',
    turn: following,
    meldedBeforeTurn: sideHasMelded(state, sideOf(state.order, following)),
  }
}

// --- Taking the pile ---------------------------------------------------------------------------

/** Why `player` may not take the pile with these groups, or null. */
export function takePileProblem(
  state: CanastaState,
  player: PlayerId,
  groups: readonly MeldGroup[],
): string | null {
  const top = state.discard.at(-1)
  if (!top) return 'Der Ablagestapel ist leer'
  if (isWild(top)) return 'Liegt ein Joker oben, kann der Stapel nicht aufgenommen werden'
  if (isBlackThree(top)) return 'Eine schwarze Drei sperrt den Stapel'
  const side = sideOf(state.order, player)
  const rank = naturalRank(top)!
  const group = groups.find((g) => g.rank === rank)
  const hand = state.hands[player]!
  const fromHand = (group?.cardIds ?? []).map((id) => hand.find((c) => c.id === id))
  if (fromHand.some((c) => !c)) return 'Diese Karten hast du nicht'
  if (pileFrozenFor(state, side)) {
    const naturals = fromHand.filter((c) => c && !isWild(c)).length
    if (naturals < 2)
      return 'Der Stapel ist eingefroren: du brauchst zwei natürliche Karten zur obersten Karte'
  } else if (!state.melds[side]!.some((m) => m.rank === rank) && fromHand.length < 2) {
    return 'Leg die oberste Karte mit zwei Karten aus deiner Hand ab (oder an eure Meldung an)'
  }
  const groupsWithTop = groups.some((g) => g.rank === rank)
    ? groups.map((g) => (g.rank === rank ? { ...g, cardIds: [...g.cardIds, top.id] } : g))
    : [...groups, { rank, cardIds: [top.id] }]
  const outcome = simulateMelds(state, player, groupsWithTop, [top])
  if (typeof outcome === 'string') return outcome
  if (!sideHasMelded(state, side) && outcome.value < minimumFor(state.scores[side]!))
    return `Die erste Meldung braucht ${minimumFor(state.scores[side]!)} Punkte (jetzt ${outcome.value})`
  if (groups.some((g) => g.rank === '3'))
    return 'Schwarze Dreien darfst du nur beim Ausmachen melden'
  // The rest of the pile comes into the hand; with (almost) nothing left this is going out.
  const left = outcome.hand.length + state.discard.slice(0, -1).filter((c) => !isRedThree(c)).length
  if (left <= 1 && canastasIn(outcome.melds) < canastasNeededFor(state.order.length))
    return 'Ausmachen geht erst mit genug Canastas – behalte mindestens zwei Karten'
  return null
}

// --- Game definition ---------------------------------------------------------------------------

export const canastaRules = defineGame<CanastaState, CanastaAction, CanastaOptions, CanastaView>({
  id: 'canasta',
  name: 'Canasta',
  players: { min: 2, max: 4, default: 4 },
  defaultOptions: DEFAULT_CANASTA_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'targetScore',
      label: 'Spielende',
      description: 'Gespielt wird, bis eine Seite diese Punktzahl erreicht – oder nur eine Hand.',
      choices: [
        { value: 5000, label: '5000 Punkte' },
        { value: 2500, label: '2500 Punkte' },
        { value: 0, label: 'Eine Hand' },
      ],
    },
    {
      type: 'boolean',
      key: 'alwaysFrozen',
      label: 'Stapel immer eingefroren',
      description:
        'Den Ablagestapel nimmt man nur mit zwei natürlichen Karten zur obersten Karte auf.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const base = {
      order,
      scores: Array.from({ length: sideCount(order.length) }, () => 0),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as CanastaState
    return startHand(base, order[rng.int(order.length)]!, 0)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'draw') {
      // Taking the pile and melding are checked by validateAction.
      return [{ type: 'drawStock' }]
    }
    const hand = state.hands[player]!
    const side = sideOf(state.order, player)
    const canGoOut = canastasIn(state.melds[side]!) >= canastasNeededFor(state.order.length)
    return hand.length > 1 || canGoOut
      ? hand.map((c) => ({ type: 'discard' as const, cardId: c.id }))
      : []
  },

  validateAction(state, player, action) {
    if (state.phase === 'over' || state.turn !== player) return 'Du bist nicht am Zug'
    switch (action.type) {
      case 'drawStock':
        return state.phase === 'draw' ? null : 'Du hast schon gezogen'
      case 'takePile':
        return state.phase === 'draw'
          ? takePileProblem(state, player, action.groups)
          : 'Du hast schon gezogen'
      case 'meld': {
        if (state.phase !== 'play') return 'Erst ziehen'
        if (action.groups.length === 0) return 'Keine Karten gewählt'
        const outcome = simulateMelds(state, player, action.groups)
        if (typeof outcome === 'string') return outcome
        const side = sideOf(state.order, player)
        if (!sideHasMelded(state, side) && outcome.value < minimumFor(state.scores[side]!))
          return `Die erste Meldung braucht ${minimumFor(state.scores[side]!)} Punkte (jetzt ${outcome.value})`
        return goingOutProblem(state, outcome, action.groups)
      }
      case 'discard': {
        if (state.phase !== 'play') return 'Erst ziehen'
        const hand = state.hands[player]!
        if (!hand.some((c) => c.id === action.cardId)) return 'Diese Karte hast du nicht'
        const side = sideOf(state.order, player)
        if (
          hand.length === 1 &&
          canastasIn(state.melds[side]!) < canastasNeededFor(state.order.length)
        )
          return 'Ausmachen geht erst mit genug Canastas'
        return null
      }
    }
  },

  applyAction(state, player, action) {
    const side = sideOf(state.order, player)
    switch (action.type) {
      case 'drawStock': {
        if (state.stock.length === 0) return endHand(state, null)
        const stock = [...state.stock]
        const hand = [...state.hands[player]!]
        const redThrees = state.redThrees.map((r) => [...r])
        const events: CanastaEvent[] = []
        for (let i = 0; i < drawCountFor(state.order.length) && stock.length > 0; i++) {
          let card = stock.shift()!
          // A red three is laid out at once and replaced.
          while (isRedThree(card)) {
            redThrees[side]!.push(card)
            events.push({ type: 'redThree', player, card })
            const next = stock.shift()
            if (!next) break
            card = next
          }
          if (!isRedThree(card)) hand.push(card)
        }
        events.unshift({ type: 'drew', player, count: drawCountFor(state.order.length) })
        const drawn: CanastaState = {
          ...state,
          hands: { ...state.hands, [player]: sortHand(hand) },
          stock,
          redThrees,
          phase: 'play',
          events,
        }
        // The stock ran out under a red three and a single card cannot be thrown: hand over.
        const stuck =
          hand.length <= 1 && canastasIn(state.melds[side]!) < canastasNeededFor(state.order.length)
        return stuck ? endHand(drawn, null) : drawn
      }
      case 'takePile': {
        const top = state.discard.at(-1)!
        const rank = naturalRank(top)!
        const groups = action.groups.some((g) => g.rank === rank)
          ? action.groups.map((g) =>
              g.rank === rank ? { ...g, cardIds: [...g.cardIds, top.id] } : g,
            )
          : [...action.groups, { rank, cardIds: [top.id] }]
        const outcome = simulateMelds(state, player, groups, [top]) as MeldOutcome
        // A red three in the pile (a covered upcard) becomes a bonus card of the side.
        const rest = state.discard.slice(0, -1).filter((c) => !isRedThree(c))
        const bonus = state.discard.filter(isRedThree)
        const melds = state.melds.map((m, i) => (i === side ? outcome.melds : m))
        const taken: CanastaState = {
          ...state,
          hands: { ...state.hands, [player]: sortHand([...outcome.hand, ...rest]) },
          discard: [],
          melds,
          redThrees: state.redThrees.map((r, i) => (i === side ? [...r, ...bonus] : r)),
          hasMelded: { ...state.hasMelded, [player]: true },
          phase: 'play',
          pickups: { ...state.pickups, [player]: [...state.pickups[player]!, ...rest] },
          events: [
            { type: 'tookPile', player, top, count: state.discard.length },
            { type: 'melded', player, value: outcome.value },
          ],
        }
        // Nothing left in hand: that was going out.
        return taken.hands[player]!.length === 0 ? endHand(taken, player) : taken
      }
      case 'meld': {
        const outcome = simulateMelds(state, player, action.groups) as MeldOutcome
        const next: CanastaState = {
          ...state,
          hands: { ...state.hands, [player]: outcome.hand },
          melds: state.melds.map((m, i) => (i === side ? outcome.melds : m)),
          hasMelded: { ...state.hasMelded, [player]: true },
          events: [{ type: 'melded', player, value: outcome.value }],
        }
        // Melding every card goes out without a discard.
        return outcome.hand.length === 0 ? endHand(next, player) : next
      }
      case 'discard': {
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const next: CanastaState = {
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c !== card) },
          discard: [...state.discard, card],
          thrown: { ...state.thrown, [player]: [...state.thrown[player]!, card] },
          events: [{ type: 'discarded', player, card }],
        }
        return afterDiscard(next, player)
      }
    }
  },

  playerView(state, player) {
    const side = sideOf(state.order, player)
    return {
      order: state.order,
      sides: sidesOf(state.order),
      mySide: side,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
      stockCount: state.stock.length,
      discardTop: state.discard.at(-1) ?? null,
      discardCount: state.discard.length,
      discardPile: state.discard,
      pileFrozen: pileFrozenFor(state, side),
      melds: state.melds,
      redThrees: state.redThrees,
      hasMelded: state.hasMelded,
      phase: state.phase,
      turn: state.turn,
      minimum: sideHasMelded(state, side) ? 0 : minimumFor(state.scores[side]!),
      canastasNeeded: canastasNeededFor(state.order.length),
      drawCount: drawCountFor(state.order.length),
      pickups: state.pickups,
      thrown: state.thrown,
      handNumber: state.handNumber,
      scores: state.scores,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const scores = Object.fromEntries(
      state.order.map((p) => [p, state.scores[sideOf(state.order, p)]!]),
    )
    const ranking = [...state.order].sort((a, b) => scores[b]! - scores[a]!)
    const best = scores[ranking[0]!]!
    return {
      scores,
      winners: state.order.filter((p) => scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) => JSON.stringify(action),
})
