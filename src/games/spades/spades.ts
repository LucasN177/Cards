/**
 * Spades for four players in two partnerships (seats 1+3 against 2+4). Everybody bids how many
 * tricks they will take; spades are always trump. Pure and deterministic; see `SpadesRules.tsx`.
 */
import {
  createDeck,
  deal,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  RANKS,
  Rng,
  type RngState,
  type Suit,
  type SuitedCard,
  type CardId,
} from '@/engine'

export interface SpadesOptions {
  /** The game ends once a team reaches this score; 0 = play a single hand. */
  readonly targetScore: 0 | 250 | 500
  /** Bidding 0 ("Nil"): +100 when you take no trick, −100 otherwise. */
  readonly nil: boolean
  /** Every 10 overtricks ("bags") cost 100 points. */
  readonly bags: boolean
}

export const DEFAULT_SPADES_OPTIONS: SpadesOptions = { targetScore: 250, nil: true, bags: true }

export type SpadesAction =
  | { readonly type: 'bid'; readonly tricks: number }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export type Team = 0 | 1

export interface TeamHandResult {
  readonly bid: number
  readonly tricks: number
  readonly points: number
  readonly bags: number
  readonly bagPenalty: boolean
}

export interface SpadesHandResult {
  readonly hand: number
  readonly teams: readonly [TeamHandResult, TeamHandResult]
  /** Nil bids of this hand and whether they made it. */
  readonly nils: Readonly<Record<PlayerId, boolean>>
}

export type SpadesEvent =
  | { readonly type: 'bid'; readonly player: PlayerId; readonly tricks: number }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'spadesBroken' }
  | { readonly type: 'trick'; readonly winner: PlayerId }
  | { readonly type: 'hand'; readonly result: SpadesHandResult }

export interface SpadesState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly phase: 'bidding' | 'playing' | 'over'
  readonly handNumber: number
  readonly dealer: PlayerId
  readonly bids: Readonly<Record<PlayerId, number | null>>
  readonly tricks: Readonly<Record<PlayerId, number>>
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly handTricks: readonly (readonly TrickCard[])[]
  readonly turn: PlayerId
  readonly spadesBroken: boolean
  readonly scores: readonly [number, number]
  /** Bags carried over (below 10 when the bag rule is on). */
  readonly bags: readonly [number, number]
  readonly handResults: readonly SpadesHandResult[]
  readonly events: readonly SpadesEvent[]
  readonly options: SpadesOptions
  readonly rng: RngState
}

export interface SpadesView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly phase: SpadesState['phase']
  readonly handNumber: number
  readonly dealer: PlayerId
  readonly bids: SpadesState['bids']
  readonly tricks: SpadesState['tricks']
  readonly trick: readonly TrickCard[]
  readonly lastTrick: SpadesState['lastTrick']
  /** Every card already played this hand, for card counting. */
  readonly played: readonly SuitedCard[]
  /** Suits each player has shown to be out of. */
  readonly voids: Readonly<Record<PlayerId, readonly Suit[]>>
  readonly turn: PlayerId
  readonly spadesBroken: boolean
  readonly scores: SpadesState['scores']
  readonly bags: SpadesState['bags']
  readonly handResults: readonly SpadesHandResult[]
  readonly events: readonly SpadesEvent[]
  readonly options: SpadesOptions
}

// --- Helpers -----------------------------------------------------------------------------------

/** 2 = 2 … Ace = 14. */
export const highValue = (card: SuitedCard) => RANKS.indexOf(card.rank) + 2

/** Seats 1 and 3 are team 0, seats 2 and 4 team 1. */
export const teamOf = (order: readonly PlayerId[], player: PlayerId): Team =>
  (order.indexOf(player) % 2) as Team
export const partnerOf = (order: readonly PlayerId[], player: PlayerId) =>
  nextPlayer(order, player, 2)
export const teamMembers = (order: readonly PlayerId[], team: Team) =>
  order.filter((_, i) => i % 2 === team)

export function trickWinner(trick: readonly TrickCard[]): PlayerId {
  const led = trick[0]!.card.suit
  const rank = (c: SuitedCard) =>
    c.suit === 'spades' ? 100 + highValue(c) : c.suit === led ? highValue(c) : 0
  return trick.reduce((best, play) => (rank(play.card) > rank(best.card) ? play : best)).player
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 }

/** Sorted by suit (spades last), then rank. */
export const sortHand = (cards: readonly SuitedCard[]) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || highValue(a) - highValue(b))

/** Cards `player` may play now: follow suit; spades are only led once broken. */
export function playableCards(state: SpadesState, player: PlayerId): SuitedCard[] {
  const hand = state.hands[player] ?? []
  if (state.phase !== 'playing' || state.turn !== player) return []
  if (state.trick.length === 0) {
    const other = hand.filter((c) => c.suit !== 'spades')
    return state.spadesBroken || other.length === 0 ? [...hand] : other
  }
  const led = state.trick[0]!.card.suit
  const following = hand.filter((c) => c.suit === led)
  return following.length > 0 ? following : [...hand]
}

const emptyRecord = <T>(order: readonly PlayerId[], value: () => T) =>
  Object.fromEntries(order.map((p) => [p, value()])) as Record<PlayerId, T>

function startHand(state: SpadesState, handNumber: number, dealer: PlayerId): SpadesState {
  const rng = new Rng(state.rng)
  const { hands } = deal(rng.shuffle(createDeck('standard52')) as SuitedCard[], 4, 13)
  return {
    ...state,
    hands: Object.fromEntries(state.order.map((p, i) => [p, sortHand(hands[i]!)])),
    rng: rng.state,
    handNumber,
    dealer,
    phase: 'bidding',
    bids: emptyRecord(state.order, () => null),
    tricks: emptyRecord(state.order, () => 0),
    trick: [],
    lastTrick: null,
    handTricks: [],
    spadesBroken: false,
    turn: nextPlayer(state.order, dealer),
  }
}

/** Points of one team for a hand, given the carried bags. */
export function scoreTeam(
  bids: readonly number[],
  tricks: readonly number[],
  carriedBags: number,
  options: SpadesOptions,
): { result: TeamHandResult; bags: number; nils: boolean[] } {
  let points = 0
  let bags = 0
  let contractTricks = 0
  let bid = 0
  const nils: boolean[] = []
  bids.forEach((b, i) => {
    if (b === 0) {
      const made = tricks[i] === 0
      nils.push(made)
      points += made ? 100 : -100
      // Tricks of a failed nil do not help the contract; they count as bags.
      bags += tricks[i]!
    } else {
      bid += b
      contractTricks += tricks[i]!
    }
  })
  if (bid > 0) {
    if (contractTricks >= bid) {
      points += bid * 10 + (contractTricks - bid)
      bags += contractTricks - bid
    } else points -= bid * 10
  }
  let total = carriedBags + bags
  let bagPenalty = false
  if (options.bags && total >= 10) {
    points -= 100
    total -= 10
    bagPenalty = true
  }
  const allTricks = tricks.reduce((a, b) => a + b, 0)
  return { result: { bid, tricks: allTricks, points, bags, bagPenalty }, bags: total, nils }
}

function scoreHand(state: SpadesState): SpadesState {
  const nils: Record<PlayerId, boolean> = {}
  const teams = ([0, 1] as const).map((team) => {
    const members = teamMembers(state.order, team)
    const scored = scoreTeam(
      members.map((p) => state.bids[p]!),
      members.map((p) => state.tricks[p]!),
      state.bags[team],
      state.options,
    )
    let n = 0
    members.forEach((p) => {
      if (state.bids[p] === 0) nils[p] = scored.nils[n++]!
    })
    return scored
  })
  const result: SpadesHandResult = {
    hand: state.handNumber,
    teams: [teams[0]!.result, teams[1]!.result],
    nils,
  }
  const scores: [number, number] = [
    state.scores[0] + teams[0]!.result.points,
    state.scores[1] + teams[1]!.result.points,
  ]
  const finished: SpadesState = {
    ...state,
    scores,
    bags: [teams[0]!.bags, teams[1]!.bags],
    handResults: [...state.handResults, result],
    events: [...state.events, { type: 'hand', result }],
  }
  const target = state.options.targetScore
  // Play on while the leading teams are tied.
  const over = target === 0 || (Math.max(...scores) >= target && scores[0] !== scores[1])
  if (over) return { ...finished, phase: 'over' }
  const next = startHand(finished, state.handNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

function computeVoids(state: SpadesState): Record<PlayerId, Suit[]> {
  const voids = emptyRecord<Suit[]>(state.order, () => [])
  for (const trick of [...state.handTricks, state.trick]) {
    const led = trick[0]?.card.suit
    if (!led) continue
    for (const play of trick.slice(1)) {
      if (play.card.suit !== led && !voids[play.player]!.includes(led))
        voids[play.player]!.push(led)
    }
  }
  return voids
}

// --- Game definition ---------------------------------------------------------------------------

export const spadesRules = defineGame<SpadesState, SpadesAction, SpadesOptions, SpadesView>({
  id: 'spades',
  name: 'Spades',
  players: { min: 4, max: 4 },
  defaultOptions: DEFAULT_SPADES_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'targetScore',
      label: 'Spielende',
      description: 'Gespielt wird, bis ein Team diese Punktzahl erreicht – oder nur eine Hand.',
      choices: [
        { value: 250, label: '250 Punkte' },
        { value: 500, label: '500 Punkte' },
        { value: 0, label: 'Eine Hand' },
      ],
    },
    {
      type: 'boolean',
      key: 'nil',
      label: 'Nil ansagen',
      description: 'Wer 0 ansagt und keinen Stich macht, bekommt 100 Punkte – sonst −100.',
    },
    {
      type: 'boolean',
      key: 'bags',
      label: 'Bags-Strafe',
      description: 'Je 10 Überstiche („Bags“) kosten 100 Punkte.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(4)]!
    const base: SpadesState = {
      order,
      hands: {},
      phase: 'bidding',
      handNumber: 0,
      dealer,
      bids: {},
      tricks: {},
      trick: [],
      lastTrick: null,
      handTricks: [],
      turn: order[0]!,
      spadesBroken: false,
      scores: [0, 0],
      bags: [0, 0],
      handResults: [],
      events: [],
      options,
      rng: rng.state,
    }
    return startHand(base, 0, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'bidding') {
      const min = state.options.nil ? 0 : 1
      return Array.from({ length: 14 - min }, (_, i) => ({ type: 'bid' as const, tricks: i + min }))
    }
    return playableCards(state, player).map((card) => ({ type: 'play' as const, cardId: card.id }))
  },

  applyAction(state, player, action) {
    if (action.type === 'bid') {
      const bids = { ...state.bids, [player]: action.tricks }
      const events: SpadesEvent[] = [{ type: 'bid', player, tricks: action.tricks }]
      const next = nextPlayer(state.order, player)
      if (state.order.some((p) => bids[p] === null)) return { ...state, bids, turn: next, events }
      // Everybody bid: the player left of the dealer leads.
      return {
        ...state,
        bids,
        events,
        phase: 'playing',
        turn: nextPlayer(state.order, state.dealer),
      }
    }

    const hand = state.hands[player]!
    const card = hand.find((c) => c.id === action.cardId)!
    const trick = [...state.trick, { player, card }]
    const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
    const events: SpadesEvent[] = [{ type: 'played', player, card }]
    let spadesBroken = state.spadesBroken
    if (!spadesBroken && card.suit === 'spades') {
      spadesBroken = true
      events.push({ type: 'spadesBroken' })
    }
    if (trick.length < 4) {
      return { ...state, hands, trick, spadesBroken, turn: nextPlayer(state.order, player), events }
    }
    const winner = trickWinner(trick)
    events.push({ type: 'trick', winner })
    const next: SpadesState = {
      ...state,
      hands,
      trick: [],
      lastTrick: { cards: trick, winner },
      handTricks: [...state.handTricks, trick],
      tricks: { ...state.tricks, [winner]: state.tricks[winner]! + 1 },
      spadesBroken,
      turn: winner,
      events,
    }
    return next.handTricks.length === 13 ? scoreHand(next) : next
  },

  playerView: (state, player) => ({
    order: state.order,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
    phase: state.phase,
    handNumber: state.handNumber,
    dealer: state.dealer,
    bids: state.bids,
    tricks: state.tricks,
    trick: state.trick,
    lastTrick: state.lastTrick,
    played: [...state.handTricks.flat(), ...state.trick].map((t) => t.card),
    voids: computeVoids(state),
    turn: state.turn,
    spadesBroken: state.spadesBroken,
    scores: state.scores,
    bags: state.bags,
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

  describeAction: (action) =>
    action.type === 'bid' ? `bid ${action.tricks}` : `play ${action.cardId}`,
})
