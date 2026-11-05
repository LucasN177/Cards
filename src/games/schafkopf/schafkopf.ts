/**
 * Schafkopf (Bavarian) for four players with 32 cards: Sauspiel with a called ace, Wenz and suit
 * solos. Ober and Unter are trumps. Pure and deterministic; see `SchafkopfRules.tsx`.
 *
 * Card model: clubs = Eichel, spades = Gras, hearts = Herz, diamonds = Schellen;
 * Q = Ober, J = Unter, A = Sau.
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

export interface SchafkopfOptions {
  readonly games: 4 | 8 | 12
  readonly wenz: boolean
}

export const DEFAULT_SCHAFKOPF_OPTIONS: SchafkopfOptions = { games: 8, wenz: true }

export type SchafkopfGame =
  | { readonly type: 'sau'; readonly suit: Suit }
  | { readonly type: 'wenz' }
  | { readonly type: 'solo'; readonly suit: Suit }

export type SchafkopfAction =
  | { readonly type: 'pass' }
  | { readonly type: 'announce'; readonly game: SchafkopfGame }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface Trick {
  readonly cards: readonly TrickCard[]
  readonly winner: PlayerId
}

export interface SchafkopfResult {
  readonly number: number
  readonly player: PlayerId | null
  readonly game: SchafkopfGame | null
  readonly partner: PlayerId | null
  readonly points: number
  readonly won: boolean
  readonly schneider: boolean
  readonly schwarz: boolean
  readonly laufende: number
  readonly value: number
  readonly delta: Readonly<Record<PlayerId, number>>
}

export type SchafkopfEvent =
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'announced'; readonly player: PlayerId; readonly game: SchafkopfGame }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId; readonly points: number }
  | { readonly type: 'game'; readonly result: SchafkopfResult }

export interface SchafkopfState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** The cards everybody was dealt (for the Laufende). */
  readonly dealt: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly phase: 'bidding' | 'playing' | 'over'
  /** Highest game announced so far in the bidding. */
  readonly best: { readonly player: PlayerId; readonly game: SchafkopfGame } | null
  readonly bids: number
  readonly player: PlayerId | null
  readonly game: SchafkopfGame | null
  /** Holder of the called ace (secret until it is played). */
  readonly partner: PlayerId | null
  readonly partnerKnown: boolean
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly tricks: readonly Trick[]
  readonly gameNumber: number
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly results: readonly SchafkopfResult[]
  readonly events: readonly SchafkopfEvent[]
  readonly options: SchafkopfOptions
  readonly rng: RngState
}

export interface SchafkopfView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly phase: SchafkopfState['phase']
  readonly best: SchafkopfState['best']
  readonly player: PlayerId | null
  readonly game: SchafkopfGame | null
  /** The partner, once the called ace has been played (or to the partner themselves). */
  readonly partner: PlayerId | null
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly lastTrick: Trick | null
  readonly tricksWon: Readonly<Record<PlayerId, number>>
  readonly myPoints: number
  readonly played: readonly SuitedCard[]
  readonly gameNumber: number
  readonly scores: SchafkopfState['scores']
  readonly results: readonly SchafkopfResult[]
  readonly events: readonly SchafkopfEvent[]
  readonly options: SchafkopfOptions
}

// --- Cards -------------------------------------------------------------------------------------

export const SUIT_NAME: Readonly<Record<Suit, string>> = {
  clubs: 'Eichel',
  spades: 'Gras',
  hearts: 'Herz',
  diamonds: 'Schellen',
}

const VALUES: Readonly<Partial<Record<Rank, number>>> = { A: 11, '10': 10, K: 4, Q: 3, J: 2 }
export const cardPoints = (c: SuitedCard) => VALUES[c.rank] ?? 0
export const sumPoints = (cards: readonly SuitedCard[]) =>
  cards.reduce((s, c) => s + cardPoints(c), 0)

const SUIT_RANK: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds']
const TRUMP_SUIT_ORDER: readonly Rank[] = ['7', '8', '9', 'K', '10', 'A']

export const gameRank = (g: SchafkopfGame) => (g.type === 'sau' ? 1 : g.type === 'wenz' ? 2 : 3)

/** Trump strength (higher is better) or −1. */
export function trumpRank(c: SuitedCard, game: SchafkopfGame): number {
  const order = 3 - SUIT_RANK.indexOf(c.suit)
  if (game.type === 'wenz') return c.rank === 'J' ? 10 + order : -1
  if (c.rank === 'Q') return 90 + order
  if (c.rank === 'J') return 80 + order
  const suit = game.type === 'solo' ? game.suit : 'hearts'
  return c.suit === suit ? 50 + TRUMP_SUIT_ORDER.indexOf(c.rank) : -1
}

function plainOrder(game: SchafkopfGame): readonly Rank[] {
  return game.type === 'wenz'
    ? ['7', '8', '9', 'Q', 'K', '10', 'A']
    : ['7', '8', '9', 'K', '10', 'A']
}

export const isTrump = (c: SuitedCard, game: SchafkopfGame) => trumpRank(c, game) >= 0
export const suitOf = (c: SuitedCard, game: SchafkopfGame): Suit | 'trump' =>
  isTrump(c, game) ? 'trump' : c.suit

function power(c: SuitedCard, game: SchafkopfGame, led: Suit | 'trump') {
  const t = trumpRank(c, game)
  if (t >= 0) return 1000 + t
  return c.suit === led ? plainOrder(game).indexOf(c.rank) : -1
}

export function trickWinner(trick: readonly TrickCard[], game: SchafkopfGame): PlayerId {
  const led = suitOf(trick[0]!.card, game)
  return trick.reduce((best, t) =>
    power(t.card, game, led) > power(best.card, game, led) ? t : best,
  ).player
}

const SORT_SUIT: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }
const SAU_GAME: SchafkopfGame = { type: 'sau', suit: 'clubs' }

export function sortHand(cards: readonly SuitedCard[], game: SchafkopfGame | null) {
  const g = game ?? SAU_GAME
  const key = (c: SuitedCard) => {
    const t = trumpRank(c, g)
    if (t >= 0) return -t
    return SORT_SUIT[c.suit] * 10 - plainOrder(g).indexOf(c.rank)
  }
  return [...cards].sort((a, b) => key(a) - key(b))
}

const isCalledAce = (c: SuitedCard, game: SchafkopfGame) =>
  game.type === 'sau' && c.suit === game.suit && c.rank === 'A'

/** Plain cards of a suit (no Ober/Unter) – what counts for the called suit. */
const plainOf = (hand: readonly SuitedCard[], suit: Suit, game: SchafkopfGame) =>
  hand.filter((c) => c.suit === suit && !isTrump(c, game))

/** Aces a player may call: a suit other than hearts, without its ace but with a card of it. */
export function callableSuits(hand: readonly SuitedCard[]): Suit[] {
  return (['clubs', 'spades', 'diamonds'] as const).filter(
    (s) =>
      !hand.some((c) => c.suit === s && c.rank === 'A') &&
      plainOf(hand, s, { type: 'sau', suit: s }).length > 0,
  )
}

export function playableCards(state: SchafkopfState, player: PlayerId): SuitedCard[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const game = state.game!
  const hand = state.hands[player]!
  const ace = hand.find((c) => isCalledAce(c, game))
  const lastTrick = hand.length === 1
  if (state.trick.length === 0) {
    if (!ace || lastTrick) return [...hand]
    // Leading the called suit means leading the ace – unless "davonlaufen" with four or more.
    const suitCards = plainOf(hand, ace.suit, game)
    if (suitCards.length >= 4) return [...hand]
    return hand.filter((c) => c === ace || c.suit !== ace.suit || isTrump(c, game))
  }
  const led = suitOf(state.trick[0]!.card, game)
  const follow = hand.filter((c) => suitOf(c, game) === led)
  if (follow.length > 0) {
    // The called suit is led: the ace must be played.
    if (ace && led === ace.suit) return [ace]
    return follow
  }
  // The called ace may not be thrown away (except in the last trick).
  return ace && !lastTrick ? hand.filter((c) => c !== ace) : [...hand]
}

// --- Flow --------------------------------------------------------------------------------------

function startGame(state: SchafkopfState, number: number, dealer: PlayerId): SchafkopfState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('piquet32')) as SuitedCard[]
  const hands = Object.fromEntries(
    state.order.map((p, i) => [p, sortHand(deck.slice(i * 8, (i + 1) * 8), null)]),
  )
  return {
    ...state,
    dealer,
    hands,
    dealt: hands,
    phase: 'bidding',
    best: null,
    bids: 0,
    player: null,
    game: null,
    partner: null,
    partnerKnown: false,
    turn: nextPlayer(state.order, dealer),
    trick: [],
    tricks: [],
    gameNumber: number,
    rng: rng.state,
  }
}

function nextGame(state: SchafkopfState, result: SchafkopfResult): SchafkopfState {
  const scores = Object.fromEntries(
    state.order.map((p) => [p, state.scores[p]! + (result.delta[p] ?? 0)]),
  )
  const finished: SchafkopfState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'game', result }],
  }
  if (state.gameNumber >= state.options.games) return { ...finished, phase: 'over' }
  const next = startGame(finished, state.gameNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

function startPlay(state: SchafkopfState): SchafkopfState {
  const { player, game } = state.best!
  const partner =
    game.type === 'sau'
      ? state.order.find((p) => state.hands[p]!.some((c) => isCalledAce(c, game)))!
      : null
  return {
    ...state,
    phase: 'playing',
    player,
    game,
    partner,
    hands: Object.fromEntries(state.order.map((p) => [p, sortHand(state.hands[p]!, game)])),
    turn: nextPlayer(state.order, state.dealer),
  }
}

/** Top trumps in a row that a team holds – or is missing ("ohne"). */
export function laufende(cards: readonly SuitedCard[], game: SchafkopfGame): number {
  const all = (createDeck('piquet32') as SuitedCard[])
    .filter((c) => isTrump(c, game))
    .sort((a, b) => trumpRank(b, game) - trumpRank(a, game))
  const held = new Set(cards.map((c) => c.id))
  const first = held.has(all[0]!.id)
  let n = 0
  for (const c of all) {
    if (held.has(c.id) !== first) break
    n++
  }
  return n
}

export const baseTariff = (game: SchafkopfGame) => (game.type === 'sau' ? 10 : 50)

function scoreGame(state: SchafkopfState): SchafkopfState {
  const game = state.game!
  const team = [state.player!, ...(state.partner ? [state.partner] : [])]
  const teamTricks = state.tricks.filter((t) => team.includes(t.winner))
  const points = sumPoints(teamTricks.flatMap((t) => t.cards.map((x) => x.card)))
  const won = points >= 61
  const schneider = points >= 91 || points <= 30
  const schwarz = teamTricks.length === 0 || teamTricks.length === state.tricks.length
  const runs = laufende(
    team.flatMap((p) => state.dealt[p]!),
    game,
  )
  const minRuns = game.type === 'wenz' ? 2 : 3
  const counted = runs >= minRuns ? runs : 0
  const value = baseTariff(game) + (schneider ? 10 : 0) + (schwarz ? 10 : 0) + counted * 10
  const sign = won ? 1 : -1
  const delta: Record<PlayerId, number> = {}
  for (const p of state.order) {
    const mine = team.includes(p)
    if (game.type === 'sau') delta[p] = (mine ? 1 : -1) * sign * value
    else delta[p] = mine ? 3 * sign * value : -sign * value
  }
  return nextGame(state, {
    number: state.gameNumber,
    player: state.player,
    game,
    partner: state.partner,
    points,
    won,
    schneider,
    schwarz,
    laufende: counted,
    value,
    delta,
  })
}

// --- Game definition ---------------------------------------------------------------------------

function announceOptions(state: SchafkopfState, player: PlayerId): SchafkopfGame[] {
  const hand = state.hands[player]!
  const games: SchafkopfGame[] = [
    ...callableSuits(hand).map((suit) => ({ type: 'sau' as const, suit })),
    ...(state.options.wenz ? [{ type: 'wenz' as const }] : []),
    ...(['clubs', 'spades', 'hearts', 'diamonds'] as const).map((suit) => ({
      type: 'solo' as const,
      suit,
    })),
  ]
  const best = state.best ? gameRank(state.best.game) : 0
  return games.filter((g) => gameRank(g) > best)
}

export const schafkopfRules = defineGame<
  SchafkopfState,
  SchafkopfAction,
  SchafkopfOptions,
  SchafkopfView
>({
  id: 'schafkopf',
  name: 'Schafkopf',
  players: { min: 4, max: 4 },
  defaultOptions: DEFAULT_SCHAFKOPF_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'games',
      label: 'Spiele',
      choices: [
        { value: 4, label: '4 Spiele' },
        { value: 8, label: '8 Spiele' },
        { value: 12, label: '12 Spiele' },
      ],
    },
    {
      type: 'boolean',
      key: 'wenz',
      label: 'Wenz',
      description: 'Solo, bei dem nur die Unter Trumpf sind.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(4)]!
    const base = {
      order,
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as SchafkopfState
    return startGame(base, 1, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'bidding') {
      return [
        { type: 'pass' },
        ...announceOptions(state, player).map((game) => ({ type: 'announce' as const, game })),
      ]
    }
    return playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id }))
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'pass':
      case 'announce': {
        const best = action.type === 'announce' ? { player, game: action.game } : state.best
        const events: SchafkopfEvent[] =
          action.type === 'announce'
            ? [{ type: 'announced', player, game: action.game }]
            : [{ type: 'passed', player }]
        const bids = state.bids + 1
        const next = { ...state, best, bids, events }
        if (bids < 4) return { ...next, turn: nextPlayer(state.order, player) }
        if (best) return startPlay(next)
        // Everybody passed: the cards are thrown in.
        return nextGame(next, {
          number: state.gameNumber,
          player: null,
          game: null,
          partner: null,
          points: 0,
          won: false,
          schneider: false,
          schwarz: false,
          laufende: 0,
          value: 0,
          delta: {},
        })
      }
      case 'play': {
        const game = state.game!
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const trick = [...state.trick, { player, card }]
        const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
        const partnerKnown = state.partnerKnown || isCalledAce(card, game)
        const events: SchafkopfEvent[] = [{ type: 'played', player, card }]
        if (trick.length < 4) {
          return {
            ...state,
            hands,
            trick,
            partnerKnown,
            events,
            turn: nextPlayer(state.order, player),
          }
        }
        const winner = trickWinner(trick, game)
        const next: SchafkopfState = {
          ...state,
          hands,
          partnerKnown,
          trick: [],
          tricks: [...state.tricks, { cards: trick, winner }],
          turn: winner,
          events: [
            ...events,
            { type: 'trick', winner, points: sumPoints(trick.map((t) => t.card)) },
          ],
        }
        return hands[player]!.length === 0 ? scoreGame(next) : next
      }
    }
  },

  playerView(state, player) {
    // Your own tricks, plus your side's once you know who belongs to it.
    const team =
      state.player === null ? [] : [state.player, ...(state.partner ? [state.partner] : [])]
    const sameSide = (p: PlayerId) => team.includes(p) === team.includes(player)
    const sidesKnown = state.partner === null || state.partnerKnown || player === state.partner
    const myPoints = state.tricks
      .filter(
        (t) => t.winner === player || (sidesKnown && state.player !== null && sameSide(t.winner)),
      )
      .reduce((s, t) => s + sumPoints(t.cards.map((x) => x.card)), 0)
    return {
      order: state.order,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
      phase: state.phase,
      best: state.best,
      player: state.player,
      game: state.game,
      partner:
        state.partner && (state.partnerKnown || state.partner === player) ? state.partner : null,
      turn: state.turn,
      trick: state.trick,
      lastTrick: state.tricks.at(-1) ?? null,
      tricksWon: Object.fromEntries(
        state.order.map((p) => [p, state.tricks.filter((t) => t.winner === p).length]),
      ),
      myPoints,
      played: [
        ...state.tricks.flatMap((t) => t.cards.map((x) => x.card)),
        ...state.trick.map((t) => t.card),
      ],
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

  describeAction: (action) =>
    action.type === 'play'
      ? `play ${action.cardId}`
      : action.type === 'announce'
        ? `announce ${JSON.stringify(action.game)}`
        : 'pass',
})

export const gameName = (g: SchafkopfGame) =>
  g.type === 'sau'
    ? `Sauspiel auf die ${SUIT_NAME[g.suit]}-Sau`
    : g.type === 'wenz'
      ? 'Wenz'
      : `${SUIT_NAME[g.suit]}-Solo`
