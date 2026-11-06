/**
 * Hearts rules for three to five players. With three or five players the cards that do not
 * divide evenly go face down into a pot that the winner of the last trick takes. One game consists of several hands and ends when a player
 * reaches the target score (or after a single hand). Pure and deterministic.
 */
import {
  type CardId,
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
} from '@/engine'

// --- Types -------------------------------------------------------------------------------------

export interface HeartsOptions {
  /** The game ends once somebody reaches this score; 0 = play a single hand. */
  readonly targetScore: 0 | 50 | 51 | 100
  /** 52 cards (2–Ace, 13 each) or 32 cards (7–Ace, 8 each). */
  readonly deck: HeartsDeck
  /**
   * Pass three cards before each hand: left, right, across, then no passing (with three or five
   * players: left, right, none).
   */
  readonly passing: boolean
  /**
   * Taking all hearts and the queen of spades ("Durchmarsch"): the points go to everybody else,
   * or are taken off your own score. See `durchmarschPoints`.
   */
  readonly shootTheMoon: 'others' | 'self'
  /** Variant: whoever takes the jack of diamonds gets −10 points. */
  readonly jackOfDiamonds: boolean
  /**
   * Who opens each hand: in turn (hand 1 the first player, then clockwise; any card may be led)
   * or the holder of the lowest club, who must lead it.
   */
  readonly firstLead: 'rotate' | 'lowestClub'
}

export const DEFAULT_HEARTS_OPTIONS: HeartsOptions = {
  targetScore: 100,
  deck: 'standard52',
  passing: true,
  shootTheMoon: 'others',
  jackOfDiamonds: false,
  firstLead: 'rotate',
}

export type HeartsDeck = 'standard52' | 'piquet32'

export type PassDirection = 'left' | 'right' | 'across' | 'none'

export type HeartsAction =
  | { readonly type: 'pass'; readonly cardIds: readonly CardId[] }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export type HeartsEvent =
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'exchanged'; readonly direction: PassDirection }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId; readonly points: number }
  | {
      readonly type: 'hand'
      readonly points: Readonly<Record<PlayerId, number>>
      readonly moon: PlayerId | null
      /** The pot (revealed) and who took it with the last trick; null without a pot. */
      readonly pot: { readonly cards: readonly SuitedCard[]; readonly winner: PlayerId } | null
    }

export interface HeartsState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Left-over cards of the deal, face down; the winner of the last trick takes them. */
  readonly pot: readonly SuitedCard[]
  readonly phase: 'passing' | 'playing' | 'over'
  /** 0-based number of the current hand. */
  readonly handNumber: number
  readonly passes: Readonly<Record<PlayerId, readonly SuitedCard[] | null>>
  /** Cards each player received in the last exchange (shown to them). */
  readonly received: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly trick: readonly TrickCard[]
  readonly lastTrick: { readonly cards: readonly TrickCard[]; readonly winner: PlayerId } | null
  readonly turn: PlayerId
  readonly tricksPlayed: number
  /** Finished tricks of the current hand (public; used for card counting and voids). */
  readonly handTricks: readonly (readonly TrickCard[])[]
  /** Cards won in tricks during the current hand. */
  readonly taken: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Total score per player over all hands. */
  readonly scores: Readonly<Record<PlayerId, number>>
  /** Points per player for every finished hand. */
  readonly handResults: readonly Readonly<Record<PlayerId, number>>[]
  readonly moons: Readonly<Record<PlayerId, number>>
  readonly events: readonly HeartsEvent[]
  readonly options: HeartsOptions
  readonly rng: RngState
}

export interface HeartsView {
  readonly order: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  /** Number of face-down cards in the pot (3 or 5 players). */
  readonly potSize: number
  readonly phase: HeartsState['phase']
  readonly handNumber: number
  readonly passDirection: PassDirection
  /** Whom you pass to in this hand (null without passing). */
  readonly passTarget: PlayerId | null
  readonly hasPassed: Readonly<Record<PlayerId, boolean>>
  readonly received: readonly SuitedCard[]
  readonly trick: readonly TrickCard[]
  readonly lastTrick: HeartsState['lastTrick']
  readonly turn: PlayerId
  readonly tricksPlayed: number
  /** Points taken so far in the current hand (tricks are public). */
  readonly handPoints: Readonly<Record<PlayerId, number>>
  /** Every card already played this hand, for card counting. */
  readonly played: readonly SuitedCard[]
  /** Finished tricks of this hand (everybody saw them). */
  readonly handTricks: HeartsState['handTricks']
  /** Suits each player has shown to be out of (did not follow). */
  readonly voids: Readonly<Record<PlayerId, readonly Suit[]>>
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly handResults: HeartsState['handResults']
  readonly events: readonly HeartsEvent[]
  readonly options: HeartsOptions
  /** Your own passed cards: you know where they went. */
  readonly passedTo: { readonly player: PlayerId; readonly cards: readonly SuitedCard[] } | null
}

// --- Helpers -----------------------------------------------------------------------------------

/** 2 = 2 … Ace = 14. */
export const highValue = (card: SuitedCard) => RANKS.indexOf(card.rank) + 2

export const isQueenOfSpades = (card: SuitedCard) => card.suit === 'spades' && card.rank === 'Q'
const isJackOfDiamonds = (card: SuitedCard) => card.suit === 'diamonds' && card.rank === 'J'

/** Cards per suit: 13 with 52 cards, 8 with 32. */
export const suitSizeOf = (deck: HeartsDeck) => (deck === 'piquet32' ? 8 : 13)

/** Cards each player gets; the rest goes into the pot. */
export const handSizeOf = (deck: HeartsDeck, players = 4) =>
  Math.floor((suitSizeOf(deck) * 4) / players)

/** Lowest club among `cards` – the lowest dealt club opens the first trick. */
export function lowestClub(cards: readonly SuitedCard[]): SuitedCard | undefined {
  let low: SuitedCard | undefined
  for (const c of cards) if (c.suit === 'clubs' && (!low || highValue(c) < highValue(low))) low = c
  return low
}

/** Value of the queen of spades: 13 with 52 cards, 8 with 32. */
export const queenPenalty = (deck: HeartsDeck) => (deck === 'piquet32' ? 8 : 13)

/** All penalty points in the deck: 26 with 52 cards, 16 with 32 (eight hearts + 8). */
export const totalPenalty = (deck: HeartsDeck) => suitSizeOf(deck) + queenPenalty(deck)

/** What a Durchmarsch is worth: 16 when playing to 51, otherwise all penalty points. */
export const durchmarschPoints = (options: HeartsOptions) =>
  options.targetScore === 51 ? 16 : totalPenalty(options.deck)

/** Penalty points of a card (hearts 1, queen of spades 13 – or 8 with 32 cards). */
export function cardPenalty(card: SuitedCard, deck: HeartsDeck = 'standard52'): number {
  if (card.suit === 'hearts') return 1
  return isQueenOfSpades(card) ? queenPenalty(deck) : 0
}

const DIRECTIONS: readonly PassDirection[] = ['left', 'right', 'across', 'none']

/** Without four players there is no "across". */
const ODD_DIRECTIONS: readonly PassDirection[] = ['left', 'right', 'none']

export function passDirection(
  handNumber: number,
  options: HeartsOptions,
  players = 4,
): PassDirection {
  if (!options.passing) return 'none'
  const cycle = players === 4 ? DIRECTIONS : ODD_DIRECTIONS
  return cycle[handNumber % cycle.length]!
}

/** Player order is clockwise; "left" is the next player. */
export function passTargetOf(
  order: readonly PlayerId[],
  player: PlayerId,
  direction: PassDirection,
) {
  const steps = { left: 1, across: 2, right: 3, none: 0 }[direction]
  return steps ? nextPlayer(order, player, steps) : null
}

export function trickWinner(trick: readonly TrickCard[]): PlayerId {
  const led = trick[0]!.card.suit
  return trick.reduce((best, play) =>
    play.card.suit === led && highValue(play.card) > highValue(best.card) ? play : best,
  ).player
}

export const trickPoints = (cards: readonly SuitedCard[], deck: HeartsDeck = 'standard52') =>
  cards.reduce((sum, card) => sum + cardPenalty(card, deck), 0)

/**
 * Cards `player` may play now. Hearts may be led and discarded at any time (no "breaking").
 * Whoever cannot follow suit and holds the queen of spades must discard her.
 */
export function playableCards(state: HeartsState, player: PlayerId): SuitedCard[] {
  const hand = state.hands[player] ?? []
  if (state.phase !== 'playing' || state.turn !== player) return []

  if (state.trick.length === 0) {
    if (state.tricksPlayed === 0 && state.options.firstLead !== 'rotate') {
      const start = lowestClub(hand)
      return start ? [start] : [...hand]
    }
    return [...hand]
  }
  const led = state.trick[0]!.card.suit
  const following = hand.filter((c) => c.suit === led)
  if (following.length > 0) return following
  const queen = hand.filter(isQueenOfSpades)
  return queen.length > 0 ? queen : [...hand]
}

function dealHand(order: readonly PlayerId[], rngState: RngState, deck: HeartsDeck) {
  const rng = new Rng(rngState)
  const cards = rng.shuffle(createDeck(deck)) as SuitedCard[]
  const { hands, rest } = deal(cards, order.length, handSizeOf(deck, order.length))
  return {
    hands: Object.fromEntries(order.map((id, i) => [id, sortHand(hands[i]!)])),
    pot: rest,
    rng: rng.state,
  }
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }

/** Sorted by suit, then rank – how a player holds the cards. */
export const sortHand = (cards: readonly SuitedCard[]) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || highValue(a) - highValue(b))

/**
 * Who leads the first trick of a hand: in turn clockwise, or whoever holds the lowest dealt club
 * (the pot holds at most two cards).
 */
export function firstLeader(
  hands: HeartsState['hands'],
  order: readonly PlayerId[],
  handNumber: number,
  options: HeartsOptions,
): PlayerId {
  if (options.firstLead === 'rotate') return order[handNumber % order.length]!
  const start = lowestClub(order.flatMap((p) => hands[p]!))
  return order.find((p) => hands[p]!.some((c) => c === start)) ?? order[0]!
}

const emptyRecord = <T>(order: readonly PlayerId[], value: () => T) =>
  Object.fromEntries(order.map((p) => [p, value()])) as Record<PlayerId, T>

/** Starts hand `handNumber`: deal, then passing or directly the first trick. */
function startHand(
  state: Omit<HeartsState, 'hands' | 'pot' | 'phase' | 'turn' | 'passes'> & Partial<HeartsState>,
  handNumber: number,
): HeartsState {
  const { hands, pot, rng } = dealHand(state.order, state.rng, state.options.deck)
  const direction = passDirection(handNumber, state.options, state.order.length)
  const base = {
    ...state,
    hands,
    pot,
    rng,
    handNumber,
    passes: emptyRecord(state.order, () => null),
    received: emptyRecord<SuitedCard[]>(state.order, () => []),
    trick: [],
    lastTrick: null,
    tricksPlayed: 0,
    handTricks: [],
    taken: emptyRecord<SuitedCard[]>(state.order, () => []),
  } as HeartsState
  return direction === 'none'
    ? {
        ...base,
        phase: 'playing',
        turn: firstLeader(hands, state.order, handNumber, state.options),
      }
    : { ...base, phase: 'passing', turn: state.order[0]! }
}

function scoreHand(state: HeartsState, potWinner: PlayerId): HeartsState {
  const points = emptyRecord(state.order, () => 0)
  for (const player of state.order) {
    points[player] = trickPoints(state.taken[player]!, state.options.deck)
  }
  const all = totalPenalty(state.options.deck)
  const moon = state.order.find((p) => points[p] === all) ?? null
  if (moon) {
    const value = durchmarschPoints(state.options)
    for (const player of state.order) {
      points[player] =
        state.options.shootTheMoon === 'others'
          ? player === moon
            ? 0
            : value
          : player === moon
            ? -value
            : 0
    }
  }
  if (state.options.jackOfDiamonds) {
    const holder = state.order.find((p) => state.taken[p]!.some(isJackOfDiamonds))
    if (holder) points[holder] = points[holder]! - 10
  }
  const scores = Object.fromEntries(state.order.map((p) => [p, state.scores[p]! + points[p]!]))
  const moons = moon ? { ...state.moons, [moon]: state.moons[moon]! + 1 } : state.moons
  const finished: HeartsState = {
    ...state,
    scores,
    moons,
    handResults: [...state.handResults, points],
    events: [
      ...state.events,
      {
        type: 'hand',
        points,
        moon,
        pot: state.pot.length > 0 ? { cards: state.pot, winner: potWinner } : null,
      },
    ],
  }
  const target = state.options.targetScore
  const gameOver = target === 0 || state.order.some((p) => scores[p]! >= target)
  if (gameOver) return { ...finished, phase: 'over' }
  return { ...startHand(finished, state.handNumber + 1), events: finished.events }
}

// --- Game definition ---------------------------------------------------------------------------

export const heartsRules = defineGame<HeartsState, HeartsAction, HeartsOptions, HeartsView>({
  id: 'hearts',
  name: 'Hearts',
  players: { min: 3, max: 5, default: 4 },
  defaultOptions: DEFAULT_HEARTS_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'targetScore',
      label: 'Spielende',
      description: 'Gespielt wird, bis jemand diese Punktzahl erreicht – oder nur eine Hand.',
      choices: [
        { value: 100, label: '100 Punkte' },
        { value: 51, label: '51 Punkte' },
        { value: 50, label: '50 Punkte' },
        { value: 0, label: 'Eine Hand' },
      ],
    },
    {
      type: 'choice',
      key: 'deck',
      label: 'Karten',
      choices: [
        { value: 'standard52', label: '52 Karten (2 bis Ass)' },
        { value: 'piquet32', label: '32 Karten (7 bis Ass)' },
      ],
    },
    {
      type: 'boolean',
      key: 'passing',
      label: 'Karten weitergeben',
      description:
        'Vor jeder Hand drei Karten abgeben: nach links, rechts, gegenüber, dann keine (zu dritt oder zu fünft ohne gegenüber).',
    },
    {
      type: 'choice',
      key: 'shootTheMoon',
      label: 'Durchmarsch (alle Strafkarten)',
      description:
        'Wer alle Herzen und die Pik-Dame bekommt (auch über den Topf): 26 Punkte, mit 32 Karten 16 – beim Spiel bis 51 immer 16.',
      choices: [
        { value: 'others', label: '… gibt allen anderen die Punkte' },
        { value: 'self', label: '… bekommt sie selbst abgezogen' },
      ],
    },
    {
      type: 'choice',
      key: 'firstLead',
      label: 'Wer spielt jede Hand aus',
      description:
        'Reihum: jede Hand beginnt der nächste Spieler im Uhrzeigersinn mit einer beliebigen Karte. Sonst beginnt, wer die niedrigste Kreuz hat.',
      choices: [
        { value: 'rotate', label: 'Reihum' },
        { value: 'lowestClub', label: 'Niedrigste Kreuz' },
      ],
    },
    {
      type: 'boolean',
      key: 'jackOfDiamonds',
      label: 'Karo-Bube −10',
      description: 'Wer den Karo-Buben im Stich bekommt, erhält 10 Punkte abgezogen.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    return startHand(
      {
        order,
        received: emptyRecord<SuitedCard[]>(order, () => []),
        lastTrick: null,
        trick: [],
        tricksPlayed: 0,
        handTricks: [],
        taken: emptyRecord<SuitedCard[]>(order, () => []),
        scores: emptyRecord(order, () => 0),
        handResults: [],
        moons: emptyRecord(order, () => 0),
        events: [],
        options,
        rng: Rng.fromSeed(seed).state,
        handNumber: 0,
      },
      0,
    )
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'passing') {
      // Enumerating all 286 combinations is pointless; validateAction checks passes.
      if (player !== state.turn || state.passes[player]) return []
      const hand = state.hands[player]!
      return [{ type: 'pass', cardIds: hand.slice(-3).map((c) => c.id) }]
    }
    return playableCards(state, player).map((card) => ({ type: 'play', cardId: card.id }))
  },

  validateAction(state, player, action) {
    if (state.turn !== player) return 'Du bist nicht am Zug'
    if (action.type === 'pass') {
      if (state.phase !== 'passing') return 'Jetzt wird nicht weitergegeben'
      const ids = new Set(action.cardIds)
      const hand = state.hands[player]!
      if (ids.size !== 3 || ![...ids].every((id) => hand.some((c) => c.id === id))) {
        return 'Wähle genau drei Karten aus deiner Hand'
      }
      return null
    }
    if (state.phase !== 'playing') return 'Erst werden Karten weitergegeben'
    return playableCards(state, player).some((c) => c.id === action.cardId)
      ? null
      : 'Diese Karte darfst du jetzt nicht spielen'
  },

  applyAction(state, player, action) {
    if (action.type === 'pass') {
      const hand = state.hands[player]!
      const cards = hand.filter((c) => action.cardIds.includes(c.id))
      const passes = { ...state.passes, [player]: cards }
      const events: HeartsEvent[] = [{ type: 'passed', player }]
      const waiting = state.order.find((p) => !passes[p])
      if (waiting) return { ...state, passes, turn: waiting, events }

      // Everybody has chosen: exchange the cards.
      const direction = passDirection(state.handNumber, state.options, state.order.length)
      const hands: Record<PlayerId, SuitedCard[]> = {}
      const received: Record<PlayerId, SuitedCard[]> = {}
      for (const p of state.order) {
        hands[p] = state.hands[p]!.filter((c) => !passes[p]!.includes(c))
        received[p] = []
      }
      for (const p of state.order) {
        const to = passTargetOf(state.order, p, direction)!
        hands[to]!.push(...passes[p]!)
        received[to] = [...passes[p]!]
      }
      for (const p of state.order) hands[p] = sortHand(hands[p]!)
      return {
        ...state,
        hands,
        received,
        passes,
        phase: 'playing',
        turn: firstLeader(hands, state.order, state.handNumber, state.options),
        events: [...events, { type: 'exchanged', direction }],
      }
    }

    const hand = state.hands[player]!
    const card = hand.find((c) => c.id === action.cardId)!
    const trick = [...state.trick, { player, card }]
    const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
    const events: HeartsEvent[] = [{ type: 'played', player, card }]

    if (trick.length < state.order.length) {
      return { ...state, hands, trick, turn: nextPlayer(state.order, player), events }
    }

    const winner = trickWinner(trick)
    const lastTrickOfHand = state.order.every((p) => hands[p]!.length === 0)
    // The winner of the last trick also takes the pot.
    const cards = [...trick.map((t) => t.card), ...(lastTrickOfHand ? state.pot : [])]
    events.push({ type: 'trick', winner, points: trickPoints(cards, state.options.deck) })
    const next: HeartsState = {
      ...state,
      hands,
      trick: [],
      lastTrick: { cards: trick, winner },
      tricksPlayed: state.tricksPlayed + 1,
      handTricks: [...state.handTricks, trick],
      taken: { ...state.taken, [winner]: [...state.taken[winner]!, ...cards] },
      turn: winner,
      events,
    }
    return lastTrickOfHand ? scoreHand(next, winner) : next
  },

  playerView(state, player) {
    const direction = passDirection(state.handNumber, state.options, state.order.length)
    const played = [...state.handTricks.flat(), ...state.trick].map((t) => t.card)
    return {
      order: state.order,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]!.length])),
      potSize: state.phase === 'over' ? 0 : state.pot.length,
      phase: state.phase,
      handNumber: state.handNumber,
      passDirection: direction,
      passTarget: passTargetOf(state.order, player, direction),
      hasPassed: Object.fromEntries(state.order.map((p) => [p, state.passes[p] !== null])),
      received:
        state.phase === 'playing' && state.tricksPlayed === 0 ? (state.received[player] ?? []) : [],
      trick: state.trick,
      lastTrick: state.lastTrick,
      turn: state.turn,
      tricksPlayed: state.tricksPlayed,
      handPoints: Object.fromEntries(
        state.order.map((p) => [p, trickPoints(state.taken[p]!, state.options.deck)]),
      ),
      played,
      handTricks: state.handTricks,
      voids: computeVoids(state),
      scores: state.scores,
      handResults: state.handResults,
      events: state.events,
      options: state.options,
      passedTo:
        direction !== 'none' && state.passes[player]
          ? { player: passTargetOf(state.order, player, direction)!, cards: state.passes[player]! }
          : null,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.order].sort((a, b) => state.scores[a]! - state.scores[b]!)
    const best = state.scores[ranking[0]!]!
    return {
      scores: state.scores,
      winners: state.order.filter((p) => state.scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
      lowerScoreIsBetter: true,
    }
  },

  describeAction: (action) =>
    action.type === 'pass' ? `pass ${action.cardIds.join(' ')}` : `play ${action.cardId}`,
})

/** Suits a player did not follow in this hand – they hold none of them any more. */
function computeVoids(state: HeartsState): Record<PlayerId, Suit[]> {
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
