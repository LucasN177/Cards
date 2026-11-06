/**
 * Gin Rummy for two players: draw, discard, knock with at most 10 deadwood (or the upcard's value
 * in Oklahoma), the defender lays off; gin, undercut and the bonuses at the end. A game runs
 * until somebody reaches the target score. Pure and deterministic.
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
import { type Arrangement, bestArrangement, cardValue, defend, type Meld, sortCards } from './melds'

export interface GinOptions {
  /** The game ends once somebody reaches this score; 0 = a single hand. */
  readonly targetScore: 0 | 100 | 250
  /** Game bonus (100), 25 per hand won and a doubled score for a shutout. */
  readonly bonuses: boolean
  /** Oklahoma: the first upcard sets the knock limit (ace: gin only), a spade doubles the hand. */
  readonly oklahoma: boolean
  /** Melding all eleven cards without a discard scores 31 instead of 25. */
  readonly bigGin: boolean
}

export const DEFAULT_GIN_OPTIONS: GinOptions = {
  targetScore: 100,
  bonuses: true,
  oklahoma: false,
  bigGin: true,
}

export const HAND_SIZE = 10
export const GIN_BONUS = 25
export const BIG_GIN_BONUS = 31
export const UNDERCUT_BONUS = 25
export const GAME_BONUS = 100
export const BOX_BONUS = 25

export type GinAction =
  /** First turn of a hand: take the upcard, or pass it (non-dealer first, then the dealer). */
  | { readonly type: 'takeUpcard' }
  | { readonly type: 'pass' }
  | { readonly type: 'drawStock' }
  | { readonly type: 'drawDiscard' }
  | { readonly type: 'discard'; readonly cardId: CardId }
  /** Discard `cardId` face down and lay out; without a card: big gin with all eleven. */
  | { readonly type: 'knock'; readonly cardId?: CardId }

export type HandOutcome = 'knock' | 'gin' | 'bigGin' | 'undercut' | 'void'

export interface HandResult {
  readonly hand: number
  readonly outcome: HandOutcome
  readonly knocker: PlayerId | null
  /** Who scores (null: void hand). */
  readonly winner: PlayerId | null
  readonly points: number
  /** Melds and remaining deadwood of both players, shown openly after the hand. */
  readonly melds: Readonly<Record<PlayerId, readonly Meld[]>>
  readonly deadwood: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly deadwoodValue: Readonly<Record<PlayerId, number>>
  /** Cards the defender laid off on the knocker's melds. */
  readonly laidOff: readonly SuitedCard[]
  readonly doubled: boolean
}

export type GinEvent =
  | { readonly type: 'passed'; readonly player: PlayerId }
  | {
      readonly type: 'drew'
      readonly player: PlayerId
      readonly from: 'stock' | 'discard'
      readonly card?: SuitedCard
    }
  | { readonly type: 'discarded'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'hand'; readonly result: HandResult }

export interface GinState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly stock: readonly SuitedCard[]
  /** Discard pile, top card last. */
  readonly discard: readonly SuitedCard[]
  readonly phase: 'upcard' | 'draw' | 'play' | 'over'
  readonly turn: PlayerId
  /** Passes on the upcard so far (two passes: the non-dealer must draw from the stock). */
  readonly upcardPasses: number
  /** Only the stock may be drawn from (after both passed the upcard). */
  readonly stockOnly: boolean
  /** The card just taken from the discard pile – it may not be thrown back this turn. */
  readonly takenDiscard: CardId | null
  /** Cards each player took from the discard pile this hand (both saw it). */
  readonly pickups: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Cards each player discarded this hand (open as well). */
  readonly thrown: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** At most this much deadwood to knock (10, or the upcard's value in Oklahoma). */
  readonly knockLimit: number
  /** Oklahoma: the upcard was a spade, so this hand counts double. */
  readonly doubled: boolean
  readonly handNumber: number
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly handsWon: Readonly<Record<PlayerId, number>>
  readonly results: readonly HandResult[]
  readonly events: readonly GinEvent[]
  readonly options: GinOptions
  readonly rng: RngState
}

export interface GinView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly stockCount: number
  readonly discardTop: SuitedCard | null
  /** The whole discard pile (every card in it was discarded openly), top card last. */
  readonly discardPile: readonly SuitedCard[]
  readonly phase: GinState['phase']
  readonly turn: PlayerId
  readonly stockOnly: boolean
  readonly takenDiscard: CardId | null
  readonly pickups: GinState['pickups']
  readonly thrown: GinState['thrown']
  readonly knockLimit: number
  readonly doubled: boolean
  readonly handNumber: number
  readonly scores: GinState['scores']
  readonly handsWon: GinState['handsWon']
  readonly results: readonly HandResult[]
  readonly events: readonly GinEvent[]
  readonly options: GinOptions
}

const record = <T>(order: readonly PlayerId[], value: () => T) =>
  Object.fromEntries(order.map((p) => [p, value()])) as Record<PlayerId, T>

/** Knock limit and doubling for a hand: 10, or with Oklahoma the upcard (ace: gin only). */
function knockRule(upcard: SuitedCard, options: GinOptions) {
  if (!options.oklahoma) return { knockLimit: 10, doubled: false }
  return {
    knockLimit: upcard.rank === 'A' ? 0 : cardValue(upcard),
    doubled: upcard.suit === 'spades',
  }
}

function startHand(state: GinState, dealer: PlayerId, handNumber: number): GinState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('standard52')) as SuitedCard[]
  const other = nextPlayer(state.order, dealer)
  const hands: Record<PlayerId, SuitedCard[]> = {
    [other]: sortCards(deck.slice(0, HAND_SIZE)),
    [dealer]: sortCards(deck.slice(HAND_SIZE, 2 * HAND_SIZE)),
  }
  const upcard = deck[2 * HAND_SIZE]!
  return {
    ...state,
    dealer,
    hands,
    stock: deck.slice(2 * HAND_SIZE + 1),
    discard: [upcard],
    phase: 'upcard',
    turn: other,
    upcardPasses: 0,
    stockOnly: false,
    takenDiscard: null,
    pickups: record(state.order, () => []),
    thrown: record(state.order, () => []),
    ...knockRule(upcard, state.options),
    handNumber,
    rng: rng.state,
  }
}

/** Big gin is possible: all eleven cards in melds (and allowed by the options). */
export const canBigGin = (cards: readonly SuitedCard[], options: GinOptions) =>
  options.bigGin && cards.length === HAND_SIZE + 1 && bestArrangement(cards).value === 0

/** Scores a knock (or gin) by `knocker` holding `knockerCards` (ten, or eleven for big gin). */
function scoreKnock(state: GinState, knocker: PlayerId, knockerCards: readonly SuitedCard[]) {
  const defender = nextPlayer(state.order, knocker)
  const own: Arrangement = bestArrangement(knockerCards)
  const big = knockerCards.length === HAND_SIZE + 1
  const gin = own.value === 0
  // Against gin nothing may be laid off.
  const answer = gin
    ? { ...bestArrangement(state.hands[defender]!), laidOff: [] as SuitedCard[] }
    : defend(state.hands[defender]!, own.melds)
  let outcome: HandOutcome
  let winner: PlayerId
  let points: number
  if (gin) {
    outcome = big ? 'bigGin' : 'gin'
    winner = knocker
    points = answer.value + (big ? BIG_GIN_BONUS : GIN_BONUS)
  } else if (answer.value <= own.value) {
    outcome = 'undercut'
    winner = defender
    points = own.value - answer.value + UNDERCUT_BONUS
  } else {
    outcome = 'knock'
    winner = knocker
    points = answer.value - own.value
  }
  if (state.doubled) points *= 2
  const result: HandResult = {
    hand: state.handNumber,
    outcome,
    knocker,
    winner,
    points,
    melds: { [knocker]: own.melds, [defender]: answer.melds },
    deadwood: { [knocker]: own.deadwood, [defender]: answer.deadwood },
    deadwoodValue: { [knocker]: own.value, [defender]: answer.value },
    laidOff: answer.laidOff,
    doubled: state.doubled,
  }
  return finishHand(state, result)
}

function finishHand(state: GinState, result: HandResult): GinState {
  const winner = result.winner
  const scores = winner
    ? { ...state.scores, [winner]: state.scores[winner]! + result.points }
    : state.scores
  const handsWon = winner
    ? { ...state.handsWon, [winner]: state.handsWon[winner]! + 1 }
    : state.handsWon
  const done: GinState = {
    ...state,
    scores,
    handsWon,
    results: [...state.results, result],
    events: [...state.events, { type: 'hand', result }],
  }
  const target = state.options.targetScore
  // A void hand never ends a single-hand game: it is dealt again.
  if (winner && (target === 0 || state.order.some((p) => scores[p]! >= target)))
    return { ...done, phase: 'over' }
  // The winner deals the next hand; after a void hand the same dealer deals again.
  const next = startHand(done, winner ?? state.dealer, state.handNumber + 1)
  return { ...next, events: done.events }
}

function voidHand(state: GinState): GinState {
  const empty = record<Meld[]>(state.order, () => [])
  return finishHand(state, {
    hand: state.handNumber,
    outcome: 'void',
    knocker: null,
    winner: null,
    points: 0,
    melds: empty,
    deadwood: state.hands,
    deadwoodValue: record(state.order, () => 0),
    laidOff: [],
    doubled: state.doubled,
  })
}

/** Final scores with the bonuses: game bonus, 25 per hand won, doubled after a shutout. */
export function finalScores(state: GinState): Record<PlayerId, number> {
  const out = { ...state.scores }
  if (!state.options.bonuses || state.options.targetScore === 0) return out
  const leader = [...state.order].sort((a, b) => out[b]! - out[a]!)[0]!
  for (const p of state.order) out[p] = out[p]! + BOX_BONUS * state.handsWon[p]!
  out[leader] = out[leader]! + GAME_BONUS
  const loser = state.order.find((p) => p !== leader)!
  if (state.handsWon[loser] === 0) out[leader] = out[leader]! * 2
  return out
}

/** Deadwood of the ten cards left after discarding `cardId` (or all eleven for big gin). */
export function deadwoodAfter(hand: readonly SuitedCard[], cardId?: CardId) {
  return bestArrangement(cardId ? hand.filter((c) => c.id !== cardId) : hand).value
}

export const ginRules = defineGame<GinState, GinAction, GinOptions, GinView>({
  id: 'gin-rummy',
  name: 'Gin Rummy',
  players: { min: 2, max: 2 },
  defaultOptions: DEFAULT_GIN_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'targetScore',
      label: 'Spielende',
      description: 'Gespielt wird, bis jemand diese Punktzahl erreicht – oder nur eine Hand.',
      choices: [
        { value: 100, label: '100 Punkte' },
        { value: 250, label: '250 Punkte' },
        { value: 0, label: 'Eine Hand' },
      ],
    },
    {
      type: 'boolean',
      key: 'bonuses',
      label: 'Bonuspunkte am Ende',
      description:
        'Spielbonus 100, je gewonnene Hand 25; wer keine Hand gewinnt, verdoppelt dem Sieger die Punkte.',
    },
    {
      type: 'boolean',
      key: 'bigGin',
      label: 'Big Gin',
      description: 'Alle elf Karten in Kombinationen, ohne abzuwerfen: 31 statt 25 Bonuspunkte.',
    },
    {
      type: 'boolean',
      key: 'oklahoma',
      label: 'Oklahoma',
      description:
        'Die erste Ablagekarte bestimmt, mit wie viel Totholz man klopfen darf (Ass: nur Gin); ist sie ein Pik, zählt die Hand doppelt.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(order.length)]!
    const base = {
      order,
      scores: record(order, () => 0),
      handsWon: record(order, () => 0),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as GinState
    return startHand(base, dealer, 0)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'upcard') return [{ type: 'takeUpcard' }, { type: 'pass' }]
    if (state.phase === 'draw') {
      return state.stockOnly || state.discard.length === 0
        ? [{ type: 'drawStock' }]
        : [{ type: 'drawStock' }, { type: 'drawDiscard' }]
    }
    const hand = state.hands[player]!
    const actions: GinAction[] = []
    for (const card of hand) {
      if (card.id === state.takenDiscard) continue
      actions.push({ type: 'discard', cardId: card.id })
      if (deadwoodAfter(hand, card.id) <= state.knockLimit)
        actions.push({ type: 'knock', cardId: card.id })
    }
    if (canBigGin(hand, state.options)) actions.push({ type: 'knock' })
    return actions
  },

  validateAction(state, player, action) {
    if (state.phase === 'over' || state.turn !== player) return 'Du bist nicht am Zug'
    switch (action.type) {
      case 'takeUpcard':
      case 'pass':
        return state.phase === 'upcard' ? null : 'Die erste Ablagekarte ist schon vergeben'
      case 'drawStock':
        return state.phase === 'draw' ? null : 'Jetzt wird nicht gezogen'
      case 'drawDiscard':
        if (state.phase !== 'draw') return 'Jetzt wird nicht gezogen'
        if (state.stockOnly) return 'Nach zweimal Passen wird vom Stapel gezogen'
        return state.discard.length > 0 ? null : 'Der Ablagestapel ist leer'
      case 'discard':
      case 'knock': {
        if (state.phase !== 'play') return 'Erst ziehen'
        const hand = state.hands[player]!
        if (action.type === 'knock' && !action.cardId)
          return canBigGin(hand, state.options) ? null : 'Big Gin geht nur mit allen elf Karten'
        const cardId = action.cardId!
        if (!hand.some((c) => c.id === cardId)) return 'Diese Karte hast du nicht'
        if (cardId === state.takenDiscard)
          return 'Die gerade aufgenommene Karte darfst du nicht gleich wieder ablegen'
        if (action.type === 'knock' && deadwoodAfter(hand, cardId) > state.knockLimit)
          return state.knockLimit === 0
            ? 'In dieser Hand geht nur Gin'
            : `Zum Klopfen höchstens ${state.knockLimit} Punkte Totholz`
        return null
      }
    }
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    const other = nextPlayer(state.order, player)
    switch (action.type) {
      case 'takeUpcard':
      case 'drawDiscard': {
        const card = state.discard.at(-1)!
        return {
          ...state,
          hands: { ...state.hands, [player]: sortCards([...hand, card]) },
          discard: state.discard.slice(0, -1),
          phase: 'play',
          takenDiscard: card.id,
          pickups: { ...state.pickups, [player]: [...state.pickups[player]!, card] },
          events: [{ type: 'drew', player, from: 'discard', card }],
        }
      }
      case 'pass': {
        const passes = state.upcardPasses + 1
        const events: GinEvent[] = [{ type: 'passed', player }]
        // Both passed: the non-dealer starts by drawing from the stock.
        if (passes === 2)
          return {
            ...state,
            upcardPasses: passes,
            phase: 'draw',
            stockOnly: true,
            turn: other,
            events,
          }
        return { ...state, upcardPasses: passes, turn: other, events }
      }
      case 'drawStock': {
        const [card, ...stock] = state.stock
        return {
          ...state,
          hands: { ...state.hands, [player]: sortCards([...hand, card!]) },
          stock,
          phase: 'play',
          stockOnly: false,
          takenDiscard: null,
          events: [{ type: 'drew', player, from: 'stock' }],
        }
      }
      case 'knock': {
        if (!action.cardId) return scoreKnock(state, player, hand)
        const card = hand.find((c) => c.id === action.cardId)!
        const rest = hand.filter((c) => c !== card)
        const next: GinState = {
          ...state,
          hands: { ...state.hands, [player]: rest },
          discard: [...state.discard, card],
          events: [{ type: 'discarded', player, card }],
        }
        return scoreKnock(next, player, rest)
      }
      case 'discard': {
        const card = hand.find((c) => c.id === action.cardId)!
        const next: GinState = {
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c !== card) },
          discard: [...state.discard, card],
          thrown: { ...state.thrown, [player]: [...state.thrown[player]!, card] },
          phase: 'draw',
          turn: other,
          takenDiscard: null,
          events: [{ type: 'discarded', player, card }],
        }
        // Two cards left in the stock and nobody knocked: the hand does not count.
        return next.stock.length <= 2 ? voidHand(next) : next
      }
    }
  },

  playerView: (state, player) => ({
    order: state.order,
    dealer: state.dealer,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
    stockCount: state.stock.length,
    discardTop: state.discard.at(-1) ?? null,
    discardPile: state.discard,
    phase: state.phase,
    turn: state.turn,
    stockOnly: state.stockOnly,
    takenDiscard: state.turn === player ? state.takenDiscard : null,
    pickups: state.pickups,
    thrown: state.thrown,
    knockLimit: state.knockLimit,
    doubled: state.doubled,
    handNumber: state.handNumber,
    scores: state.scores,
    handsWon: state.handsWon,
    results: state.results,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const scores = finalScores(state)
    const ranking = [...state.order].sort((a, b) => scores[b]! - scores[a]!)
    const best = scores[ranking[0]!]!
    return {
      scores,
      winners: state.order.filter((p) => scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) =>
    'cardId' in action && action.cardId ? `${action.type} ${action.cardId}` : action.type,
})
