/**
 * Rommé for 2–6 players with 110 cards (two decks and six jokers). Draw, lay out sets and runs,
 * lay off, discard; the first to get rid of all cards wins the round.
 * Pure and deterministic; see `RommeRules.tsx` for the rule text.
 */
import {
  type Card,
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  Rng,
  type RngState,
} from '@/engine'
import { analyzeMeld, handPenalty, layOff, type Meld, meldValue } from './melds'

export interface RommeOptions {
  readonly rounds: 1 | 3 | 5
  /** Points needed for the first lay-out. */
  readonly firstMeld: 30 | 40
  /** Going out in one go without having laid out before doubles everybody's penalty. */
  readonly handRomme: boolean
}

export const DEFAULT_ROMME_OPTIONS: RommeOptions = { rounds: 3, firstMeld: 40, handRomme: true }

export const HAND_SIZE = 13

export type RommeAction =
  | { readonly type: 'drawStock' }
  | { readonly type: 'drawDiscard' }
  /** One or more new melds at once (the first lay-out must reach the minimum together). */
  | { readonly type: 'meld'; readonly melds: readonly (readonly CardId[])[] }
  | { readonly type: 'layOff'; readonly meldId: string; readonly cardIds: readonly CardId[] }
  | { readonly type: 'discard'; readonly cardId: CardId }

export interface RoundResult {
  readonly round: number
  readonly winner: PlayerId
  readonly handRomme: boolean
  readonly penalties: Readonly<Record<PlayerId, number>>
}

export type RommeEvent =
  | {
      readonly type: 'drew'
      readonly player: PlayerId
      readonly from: 'stock' | 'discard'
      readonly card?: Card
    }
  | {
      readonly type: 'melded'
      readonly player: PlayerId
      readonly count: number
      readonly value: number
    }
  | { readonly type: 'laidOff'; readonly player: PlayerId; readonly meldId: string }
  | { readonly type: 'discarded'; readonly player: PlayerId; readonly card: Card }
  | { readonly type: 'reshuffled' }
  | { readonly type: 'round'; readonly result: RoundResult }

export interface RommeState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>
  readonly stock: readonly Card[]
  /** Discard pile, top card last. */
  readonly discard: readonly Card[]
  readonly melds: readonly Meld[]
  readonly nextMeldId: number
  readonly hasMelded: Readonly<Record<PlayerId, boolean>>
  /** Whether the player on turn had laid out before this turn (for Hand-Rommé). */
  readonly meldedBeforeTurn: boolean
  /** The card just taken from the discard pile – it may not be thrown back this turn. */
  readonly takenDiscard: CardId | null
  /** Cards each player took from the discard pile this round (everybody saw it). */
  readonly pickups: Readonly<Record<PlayerId, readonly Card[]>>
  readonly phase: 'draw' | 'play' | 'over'
  readonly turn: PlayerId
  readonly round: number
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly results: readonly RoundResult[]
  readonly events: readonly RommeEvent[]
  readonly options: RommeOptions
  readonly rng: RngState
}

export interface RommeView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly Card[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly stockCount: number
  readonly discardTop: Card | null
  /** The whole discard pile, top card last (every card in it was discarded openly). */
  readonly discardPile: readonly Card[]
  readonly melds: readonly Meld[]
  readonly hasMelded: RommeState['hasMelded']
  readonly takenDiscard: CardId | null
  readonly pickups: RommeState['pickups']
  readonly phase: RommeState['phase']
  readonly turn: PlayerId
  readonly round: number
  readonly scores: RommeState['scores']
  readonly results: readonly RoundResult[]
  readonly events: readonly RommeEvent[]
  readonly options: RommeOptions
}

// --- Flow --------------------------------------------------------------------------------------

const SUIT_ORDER = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 } as const
/** By suit and rank, jokers last. */
export function sortHand(cards: readonly Card[]) {
  const key = (c: Card) =>
    c.kind === 'joker'
      ? 1000
      : SUIT_ORDER[c.suit] * 100 +
        ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank)
  return [...cards].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id))
}

function startRound(state: RommeState, round: number, dealer: PlayerId): RommeState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('romme110'))
  const first = nextPlayer(state.order, dealer)
  const hands: Record<PlayerId, Card[]> = {}
  let k = 0
  for (const p of state.order) {
    const n = p === first ? HAND_SIZE + 1 : HAND_SIZE
    hands[p] = sortHand(deck.slice(k, k + n))
    k += n
  }
  return {
    ...state,
    dealer,
    hands,
    stock: deck.slice(k),
    discard: [],
    melds: [],
    nextMeldId: 1,
    hasMelded: Object.fromEntries(state.order.map((p) => [p, false])),
    meldedBeforeTurn: false,
    takenDiscard: null,
    pickups: Object.fromEntries(state.order.map((p) => [p, []])),
    // The first player already holds 14 cards and starts by playing.
    phase: 'play',
    turn: first,
    round,
    rng: rng.state,
  }
}

function endRound(state: RommeState, winner: PlayerId): RommeState {
  const handRomme = state.options.handRomme && !state.meldedBeforeTurn
  const penalties: Record<PlayerId, number> = {}
  for (const p of state.order) {
    const raw = state.hands[p]!.reduce((s, c) => s + handPenalty(c), 0)
    penalties[p] = p === winner ? 0 : handRomme ? raw * 2 : raw
  }
  const result: RoundResult = { round: state.round, winner, handRomme, penalties }
  const scores = Object.fromEntries(state.order.map((p) => [p, state.scores[p]! + penalties[p]!]))
  const finished: RommeState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'round', result }],
  }
  if (state.round >= state.options.rounds) return { ...finished, phase: 'over' }
  const next = startRound(finished, state.round + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

const take = (hand: readonly Card[], ids: readonly CardId[]) => ({
  taken: ids.map((id) => hand.find((c) => c.id === id)!),
  rest: hand.filter((c) => !ids.includes(c.id)),
})

/** Why a meld action is not allowed, or null. */
function checkMelds(state: RommeState, player: PlayerId, melds: readonly (readonly CardId[])[]) {
  const hand = state.hands[player]!
  const ids = melds.flat()
  if (melds.length === 0) return 'Keine Karten gewählt'
  if (new Set(ids).size !== ids.length || ids.some((id) => !hand.some((c) => c.id === id)))
    return 'Diese Karten hast du nicht'
  let value = 0
  for (const group of melds) {
    const meld = analyzeMeld(take(hand, group).taken)
    if (!meld) return 'Keine gültige Kombination (Satz oder Folge)'
    value += meldValue(meld)
  }
  if (!state.hasMelded[player] && value < state.options.firstMeld)
    return `Beim ersten Auslegen brauchst du mindestens ${state.options.firstMeld} Punkte (jetzt ${value})`
  // Something has to be left to discard – unless you go out completely.
  return null
}

// --- Game definition ---------------------------------------------------------------------------

export const rommeRules = defineGame<RommeState, RommeAction, RommeOptions, RommeView>({
  id: 'romme',
  name: 'Rommé',
  players: { min: 2, max: 6 },
  defaultOptions: DEFAULT_ROMME_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'rounds',
      label: 'Runden',
      choices: [
        { value: 1, label: '1 Runde' },
        { value: 3, label: '3 Runden' },
        { value: 5, label: '5 Runden' },
      ],
    },
    {
      type: 'choice',
      key: 'firstMeld',
      label: 'Erstes Auslegen',
      description: 'So viele Punkte müssen beim ersten Auslegen zusammenkommen.',
      choices: [
        { value: 40, label: '40 Punkte' },
        { value: 30, label: '30 Punkte' },
      ],
    },
    {
      type: 'boolean',
      key: 'handRomme',
      label: 'Hand-Rommé doppelt',
      description:
        'Wer auf einen Schlag alle Karten loswird, ohne vorher ausgelegt zu haben, verdoppelt die Strafpunkte der anderen.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const base = {
      order,
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as RommeState
    return startRound(base, 1, order[rng.int(order.length)]!)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'draw') {
      return [
        { type: 'drawStock' },
        ...(state.discard.length > 0 ? [{ type: 'drawDiscard' as const }] : []),
      ]
    }
    // Melds and lay-offs are checked by validateAction; here only the discards.
    return state.hands[player]!.filter(
      (c) => c.id !== state.takenDiscard || state.hands[player]!.length === 1,
    ).map((c) => ({ type: 'discard' as const, cardId: c.id }))
  },

  validateAction(state, player, action) {
    if (state.phase === 'over' || state.turn !== player) return 'Du bist nicht am Zug'
    switch (action.type) {
      case 'drawStock':
        return state.phase === 'draw' ? null : 'Du hast schon gezogen'
      case 'drawDiscard':
        if (state.phase !== 'draw') return 'Du hast schon gezogen'
        return state.discard.length > 0 ? null : 'Der Ablagestapel ist leer'
      case 'meld':
        return state.phase === 'play' ? checkMelds(state, player, action.melds) : 'Erst ziehen'
      case 'layOff': {
        if (state.phase !== 'play') return 'Erst ziehen'
        if (!state.hasMelded[player]) return 'Anlegen geht erst nach dem ersten Auslegen'
        const meld = state.melds.find((m) => m.id === action.meldId)
        const hand = state.hands[player]!
        if (!meld) return 'Diese Kombination gibt es nicht'
        if (
          action.cardIds.length === 0 ||
          action.cardIds.some((id) => !hand.some((c) => c.id === id))
        )
          return 'Diese Karten hast du nicht'
        return layOff(meld, take(hand, action.cardIds).taken)
          ? null
          : 'Passt nicht an diese Kombination'
      }
      case 'discard': {
        if (state.phase !== 'play') return 'Erst ziehen'
        const hand = state.hands[player]!
        if (!hand.some((c) => c.id === action.cardId)) return 'Diese Karte hast du nicht'
        if (action.cardId === state.takenDiscard && hand.length > 1)
          return 'Die gerade aufgenommene Karte darfst du nicht gleich wieder ablegen'
        return null
      }
    }
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    switch (action.type) {
      case 'drawStock': {
        let stock = state.stock
        let discard = state.discard
        const events: RommeEvent[] = []
        if (stock.length === 0) {
          // Reshuffle the discard pile (except its top card) into a new stock.
          const rng = new Rng(state.rng)
          stock = rng.shuffle(discard.slice(0, -1))
          discard = discard.slice(-1)
          events.push({ type: 'reshuffled' })
          state = { ...state, rng: rng.state }
        }
        const [card, ...rest] = stock
        if (!card) return { ...state, phase: 'play', events }
        events.push({ type: 'drew', player, from: 'stock' })
        return {
          ...state,
          hands: { ...state.hands, [player]: sortHand([...hand, card]) },
          stock: rest,
          discard,
          phase: 'play',
          takenDiscard: null,
          events,
        }
      }
      case 'drawDiscard': {
        const card = state.discard.at(-1)!
        return {
          ...state,
          hands: { ...state.hands, [player]: sortHand([...hand, card]) },
          discard: state.discard.slice(0, -1),
          phase: 'play',
          takenDiscard: card.id,
          // Older saves have no pickups yet.
          pickups: { ...state.pickups, [player]: [...(state.pickups?.[player] ?? []), card] },
          events: [{ type: 'drew', player, from: 'discard', card }],
        }
      }
      case 'meld': {
        let rest = hand
        const melds = [...state.melds]
        let id = state.nextMeldId
        let value = 0
        for (const group of action.melds) {
          const { taken, rest: r } = take(rest, group)
          rest = r
          const meld = analyzeMeld(taken)!
          value += meldValue(meld)
          melds.push({ ...meld, id: `m${id++}` })
        }
        const next: RommeState = {
          ...state,
          hands: { ...state.hands, [player]: rest },
          melds,
          nextMeldId: id,
          hasMelded: { ...state.hasMelded, [player]: true },
          takenDiscard: rest.some((c) => c.id === state.takenDiscard) ? state.takenDiscard : null,
          events: [{ type: 'melded', player, count: action.melds.length, value }],
        }
        return rest.length === 0 ? endRound(next, player) : next
      }
      case 'layOff': {
        const { taken, rest } = take(hand, action.cardIds)
        const melds = state.melds.map((m) =>
          m.id === action.meldId ? { ...layOff(m, taken)!, id: m.id } : m,
        )
        const next: RommeState = {
          ...state,
          hands: { ...state.hands, [player]: rest },
          melds,
          events: [{ type: 'laidOff', player, meldId: action.meldId }],
        }
        return rest.length === 0 ? endRound(next, player) : next
      }
      case 'discard': {
        const card = hand.find((c) => c.id === action.cardId)!
        const rest = hand.filter((c) => c !== card)
        const next: RommeState = {
          ...state,
          hands: { ...state.hands, [player]: rest },
          discard: [...state.discard, card],
          takenDiscard: null,
          events: [{ type: 'discarded', player, card }],
        }
        if (rest.length === 0) return endRound(next, player)
        const following = nextPlayer(state.order, player)
        return {
          ...next,
          phase: 'draw',
          turn: following,
          meldedBeforeTurn: state.hasMelded[following]!,
        }
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
    melds: state.melds,
    hasMelded: state.hasMelded,
    takenDiscard: state.turn === player ? state.takenDiscard : null,
    pickups: state.pickups ?? Object.fromEntries(state.order.map((p) => [p, []])),
    phase: state.phase,
    turn: state.turn,
    round: state.round,
    scores: state.scores,
    results: state.results,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.order].sort((a, b) => state.scores[a]! - state.scores[b]!)
    const best = state.scores[ranking[0]!]!
    return {
      scores: state.scores,
      winners: state.order.filter((p) => state.scores[p] === best),
      ranking,
      scoreLabel: 'Strafpunkte',
      lowerScoreIsBetter: true,
    }
  },

  describeAction: (action) => JSON.stringify(action),
})
