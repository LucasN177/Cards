/**
 * Contract bridge (Chicago) for four players. North/South play against East/West; the auction
 * decides the contract, the declarer plays both their own hand and the dummy's.
 * Pure and deterministic; see `BridgeRules.tsx` for the rule text.
 *
 * Seats: the players are seated clockwise in the order given (the first player is South, then
 * West, North, East), so players 1+3 and 2+4 are partners.
 */
import {
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  RANKS,
  Rng,
  type RngState,
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface BridgeOptions {
  /** Deals in a match; Chicago rounds of four. */
  readonly deals: 4 | 8 | 12
}

export const DEFAULT_BRIDGE_OPTIONS: BridgeOptions = { deals: 4 }

export type Strain = Suit | 'notrump'
export const STRAINS: readonly Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump']

export interface Bid {
  readonly level: number
  readonly strain: Strain
}

export type Call =
  | { readonly type: 'bid'; readonly level: number; readonly strain: Strain }
  | { readonly type: 'pass' }
  | { readonly type: 'double' }
  | { readonly type: 'redouble' }

export type BridgeAction = Call | { readonly type: 'play'; readonly cardId: CardId }

export interface AuctionCall {
  readonly player: PlayerId
  readonly call: Call
}

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface Trick {
  readonly cards: readonly TrickCard[]
  readonly winner: PlayerId
}

export interface Contract extends Bid {
  readonly declarer: PlayerId
  readonly doubled: 0 | 1 | 2
}

export type Side = 'ns' | 'ew'

export interface DealResult {
  readonly number: number
  readonly contract: Contract | null
  readonly vulnerable: Readonly<Record<Side, boolean>>
  /** Tricks taken by the declarer's side. */
  readonly tricks: number
  /** Over- (positive) or undertricks (negative). */
  readonly overtricks: number
  readonly score: Readonly<Record<Side, number>>
}

export type BridgeEvent =
  | { readonly type: 'call'; readonly player: PlayerId; readonly call: Call }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId }
  | { readonly type: 'deal'; readonly result: DealResult }

export interface BridgeState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly phase: 'auction' | 'playing' | 'over'
  readonly auction: readonly AuctionCall[]
  readonly contract: Contract | null
  /** Whose seat plays next (the dummy's seat is played by the declarer). */
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly tricks: readonly Trick[]
  readonly dealNumber: number
  readonly scores: Readonly<Record<Side, number>>
  readonly results: readonly DealResult[]
  readonly events: readonly BridgeEvent[]
  readonly options: BridgeOptions
  readonly rng: RngState
}

export interface BridgeView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly phase: BridgeState['phase']
  readonly auction: readonly AuctionCall[]
  readonly contract: Contract | null
  readonly dummy: PlayerId | null
  /** The dummy's cards once the opening lead is made (not shown to the dummy themselves). */
  readonly dummyHand: readonly SuitedCard[] | null
  /** The seat that plays next. */
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly lastTrick: Trick | null
  readonly tricksWon: Readonly<Record<Side, number>>
  readonly played: readonly SuitedCard[]
  readonly vulnerable: Readonly<Record<Side, boolean>>
  readonly dealNumber: number
  readonly scores: BridgeState['scores']
  readonly results: readonly DealResult[]
  readonly events: readonly BridgeEvent[]
  readonly options: BridgeOptions
}

// --- Basics ------------------------------------------------------------------------------------

export const sideOf = (order: readonly PlayerId[], p: PlayerId): Side =>
  order.indexOf(p) % 2 === 0 ? 'ns' : 'ew'
export const partnerOf = (order: readonly PlayerId[], p: PlayerId) => nextPlayer(order, p, 2)

/** Seat names: the first player is South, then clockwise West, North, East. */
export const SEAT_NAMES = ['Süd', 'West', 'Nord', 'Ost'] as const
export const seatName = (order: readonly PlayerId[], p: PlayerId) => SEAT_NAMES[order.indexOf(p)]!

export const highValue = (c: SuitedCard) => RANKS.indexOf(c.rank) + 2

export const bidRank = (b: Bid) => (b.level - 1) * 5 + STRAINS.indexOf(b.strain)

export function lastBid(auction: readonly AuctionCall[]) {
  for (let i = auction.length - 1; i >= 0; i--) {
    const c = auction[i]!
    if (c.call.type === 'bid') return { ...c, bid: c.call as Bid, index: i }
  }
  return null
}

/** Doubling state after the last bid: 0 none, 1 doubled, 2 redoubled. */
function doubling(auction: readonly AuctionCall[]): 0 | 1 | 2 {
  const last = lastBid(auction)
  if (!last) return 0
  let d: 0 | 1 | 2 = 0
  for (const c of auction.slice(last.index + 1)) {
    if (c.call.type === 'double') d = 1
    if (c.call.type === 'redouble') d = 2
  }
  return d
}

export function legalCalls(
  state: Pick<BridgeState, 'auction' | 'order'>,
  player: PlayerId,
): Call[] {
  const last = lastBid(state.auction)
  const calls: Call[] = [{ type: 'pass' }]
  const minRank = last ? bidRank(last.bid) + 1 : 0
  for (let level = 1; level <= 7; level++)
    for (const strain of STRAINS)
      if (bidRank({ level, strain }) >= minRank) calls.push({ type: 'bid', level, strain })
  if (last) {
    const opponents = sideOf(state.order, last.player) !== sideOf(state.order, player)
    const d = doubling(state.auction)
    if (opponents && d === 0) calls.push({ type: 'double' })
    if (!opponents && d === 1) calls.push({ type: 'redouble' })
  }
  return calls
}

/** Chicago: deal 1 nobody, deals 2 and 3 the dealer's side, deal 4 both are vulnerable. */
export function vulnerability(order: readonly PlayerId[], dealNumber: number, dealer: PlayerId) {
  const k = (dealNumber - 1) % 4
  const side = sideOf(order, dealer)
  return {
    ns: k === 3 || ((k === 1 || k === 2) && side === 'ns'),
    ew: k === 3 || ((k === 1 || k === 2) && side === 'ew'),
  }
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 }

/** Spades, hearts, clubs, diamonds (alternating colours), high cards first. */
export const sortHand = (cards: readonly SuitedCard[]) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || highValue(b) - highValue(a))

export function trickWinner(trick: readonly TrickCard[], strain: Strain): PlayerId {
  const led = trick[0]!.card.suit
  const value = (c: SuitedCard) =>
    c.suit === strain ? 100 + highValue(c) : c.suit === led ? highValue(c) : 0
  return trick.reduce((best, t) => (value(t.card) > value(best.card) ? t : best)).player
}

/** The player who decides on a card now: the declarer plays for the dummy. */
export function actingPlayer(state: Pick<BridgeState, 'phase' | 'turn' | 'contract' | 'order'>) {
  if (state.phase === 'playing' && state.contract) {
    const dummy = partnerOf(state.order, state.contract.declarer)
    if (state.turn === dummy) return state.contract.declarer
  }
  return state.turn
}

export function playableCards(state: BridgeState): SuitedCard[] {
  if (state.phase !== 'playing') return []
  const hand = state.hands[state.turn]!
  if (state.trick.length === 0) return [...hand]
  const led = state.trick[0]!.card.suit
  const follow = hand.filter((c) => c.suit === led)
  return follow.length > 0 ? follow : [...hand]
}

// --- Scoring -----------------------------------------------------------------------------------

/** Duplicate-style score for the declaring side (negative when the contract fails). */
export function contractScore(contract: Contract, tricks: number, vulnerable: boolean): number {
  const needed = contract.level + 6
  const mult = contract.doubled === 2 ? 4 : contract.doubled === 1 ? 2 : 1
  if (tricks < needed) {
    const down = needed - tricks
    if (contract.doubled === 0) return -down * (vulnerable ? 100 : 50)
    let penalty = 0
    for (let i = 1; i <= down; i++) {
      if (vulnerable) penalty += i === 1 ? 200 : 300
      else penalty += i === 1 ? 100 : i <= 3 ? 200 : 300
    }
    return -penalty * (contract.doubled === 2 ? 2 : 1)
  }
  const perTrick = contract.strain === 'clubs' || contract.strain === 'diamonds' ? 20 : 30
  const trickScore =
    (contract.strain === 'notrump' ? 40 + (contract.level - 1) * 30 : contract.level * perTrick) *
    mult
  let score = trickScore
  score += trickScore >= 100 ? (vulnerable ? 500 : 300) : 50
  if (contract.level === 6) score += vulnerable ? 750 : 500
  if (contract.level === 7) score += vulnerable ? 1500 : 1000
  if (contract.doubled === 1) score += 50
  if (contract.doubled === 2) score += 100
  const over = tricks - needed
  if (contract.doubled === 0) score += over * (contract.strain === 'notrump' ? 30 : perTrick)
  else score += over * (vulnerable ? 200 : 100) * (contract.doubled === 2 ? 2 : 1)
  return score
}

// --- Flow --------------------------------------------------------------------------------------

function startDeal(state: BridgeState, number: number, dealer: PlayerId): BridgeState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('standard52')) as SuitedCard[]
  const hands = Object.fromEntries(
    state.order.map((p, i) => [p, sortHand(deck.slice(i * 13, (i + 1) * 13))]),
  )
  return {
    ...state,
    dealer,
    hands,
    phase: 'auction',
    auction: [],
    contract: null,
    turn: dealer,
    trick: [],
    tricks: [],
    dealNumber: number,
    rng: rng.state,
  }
}

function finishDeal(state: BridgeState): BridgeState {
  const vul = vulnerability(state.order, state.dealNumber, state.dealer)
  const c = state.contract
  let result: DealResult
  if (!c) {
    result = {
      number: state.dealNumber,
      contract: null,
      vulnerable: vul,
      tricks: 0,
      overtricks: 0,
      score: { ns: 0, ew: 0 },
    }
  } else {
    const side = sideOf(state.order, c.declarer)
    const tricks = state.tricks.filter((t) => sideOf(state.order, t.winner) === side).length
    const points = contractScore(c, tricks, vul[side])
    // The side that earns the points gets them; the other gets nothing.
    const score =
      points >= 0
        ? { ns: side === 'ns' ? points : 0, ew: side === 'ew' ? points : 0 }
        : { ns: side === 'ns' ? 0 : -points, ew: side === 'ew' ? 0 : -points }
    result = {
      number: state.dealNumber,
      contract: c,
      vulnerable: vul,
      tricks,
      overtricks: tricks - (c.level + 6),
      score,
    }
  }
  const scores = { ns: state.scores.ns + result.score.ns, ew: state.scores.ew + result.score.ew }
  const finished: BridgeState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'deal', result }],
  }
  if (state.dealNumber >= state.options.deals) return { ...finished, phase: 'over' }
  const next = startDeal(finished, state.dealNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

function endAuction(state: BridgeState): BridgeState {
  const last = lastBid(state.auction)
  if (!last) return finishDeal(state)
  const side = sideOf(state.order, last.player)
  // The declarer is the first player of the side who named the final strain.
  const declarer = state.auction.find(
    (c) =>
      c.call.type === 'bid' &&
      c.call.strain === last.bid.strain &&
      sideOf(state.order, c.player) === side,
  )!.player
  const contract: Contract = {
    level: last.bid.level,
    strain: last.bid.strain,
    declarer,
    doubled: doubling(state.auction),
  }
  return { ...state, contract, phase: 'playing', turn: nextPlayer(state.order, declarer) }
}

// --- Game definition ---------------------------------------------------------------------------

export const bridgeRules = defineGame<BridgeState, BridgeAction, BridgeOptions, BridgeView>({
  id: 'bridge',
  name: 'Bridge',
  players: { min: 4, max: 4 },
  defaultOptions: DEFAULT_BRIDGE_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'deals',
      label: 'Austeilungen',
      description: 'Chicago: Je vier Austeilungen mit wechselnder Gefahrenlage.',
      choices: [
        { value: 4, label: '4 (ein Chicago)' },
        { value: 8, label: '8' },
        { value: 12, label: '12' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const base = {
      order,
      scores: { ns: 0, ew: 0 },
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as BridgeState
    return startDeal(base, 1, order[rng.int(4)]!)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : actingPlayer(state)),

  legalActions(state, player) {
    if (state.phase === 'over' || actingPlayer(state) !== player) return []
    if (state.phase === 'auction') return legalCalls(state, player)
    return playableCards(state).map((c) => ({ type: 'play' as const, cardId: c.id }))
  },

  applyAction(state, player, action) {
    if (action.type !== 'play') {
      const auction = [...state.auction, { player, call: action }]
      const events: BridgeEvent[] = [{ type: 'call', player, call: action }]
      const next = { ...state, auction, events }
      const passes = (n: number) => auction.slice(-n).every((c) => c.call.type === 'pass')
      const anyBid = auction.some((c) => c.call.type === 'bid')
      if ((anyBid && auction.length >= 4 && passes(3)) || (!anyBid && auction.length === 4))
        return endAuction(next)
      return { ...next, turn: nextPlayer(state.order, player) }
    }
    const seat = state.turn
    const hand = state.hands[seat]!
    const card = hand.find((c) => c.id === action.cardId)!
    const trick = [...state.trick, { player: seat, card }]
    const hands = { ...state.hands, [seat]: hand.filter((c) => c !== card) }
    const events: BridgeEvent[] = [{ type: 'played', player: seat, card }]
    if (trick.length < 4) {
      return { ...state, hands, trick, events, turn: nextPlayer(state.order, seat) }
    }
    const winner = trickWinner(trick, state.contract!.strain)
    const next: BridgeState = {
      ...state,
      hands,
      trick: [],
      tricks: [...state.tricks, { cards: trick, winner }],
      turn: winner,
      events: [...events, { type: 'trick', winner }],
    }
    return next.tricks.length === 13 ? finishDeal(next) : next
  },

  playerView(state, player) {
    const c = state.contract
    const dummy = c ? partnerOf(state.order, c.declarer) : null
    const leadMade = state.tricks.length > 0 || state.trick.length > 0
    // The dummy is laid open after the opening lead.
    const showDummy = dummy !== null && state.phase === 'playing' && leadMade
    const tricksWon = { ns: 0, ew: 0 }
    for (const t of state.tricks) tricksWon[sideOf(state.order, t.winner)]++
    return {
      order: state.order,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
      phase: state.phase,
      auction: state.auction,
      contract: c,
      dummy,
      dummyHand: showDummy && dummy !== player ? state.hands[dummy]! : null,
      turn: state.turn,
      trick: state.trick,
      lastTrick: state.tricks.at(-1) ?? null,
      tricksWon,
      played: [
        ...state.tricks.flatMap((t) => t.cards.map((x) => x.card)),
        ...state.trick.map((t) => t.card),
      ],
      vulnerable: vulnerability(state.order, state.dealNumber, state.dealer),
      dealNumber: state.dealNumber,
      scores: state.scores,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const scores = Object.fromEntries(
      state.order.map((p) => [p, state.scores[sideOf(state.order, p)]]),
    )
    const best = Math.max(state.scores.ns, state.scores.ew)
    const ranking = [...state.order].sort((a, b) => scores[b]! - scores[a]!)
    return {
      scores,
      winners: state.order.filter((p) => scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) =>
    action.type === 'play'
      ? `play ${action.cardId}`
      : action.type === 'bid'
        ? `bid ${action.level} ${action.strain}`
        : action.type,
})

export const STRAIN_SYMBOL: Readonly<Record<Strain, string>> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
  notrump: 'SA',
}

export const callLabel = (call: Call) =>
  call.type === 'bid'
    ? `${call.level}${STRAIN_SYMBOL[call.strain]}`
    : call.type === 'pass'
      ? 'Passe'
      : call.type === 'double'
        ? 'Kontra'
        : 'Rekontra'

export const contractLabel = (c: Contract) =>
  `${c.level}${STRAIN_SYMBOL[c.strain]}${c.doubled === 2 ? ' XX' : c.doubled === 1 ? ' X' : ''}`
