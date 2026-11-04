/**
 * Durak (throw-in variant) for 2–6 players with 36 cards. Attack and defence alternate card by
 * card, which keeps one player on turn at a time. Pure and deterministic; see `DurakRules.tsx`.
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
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface DurakOptions {
  /** Who may add cards to an attack: everybody or only the attacker. */
  readonly throwIn: 'all' | 'attacker'
  /** The very first attack of a game has at most five cards. */
  readonly firstAttackFive: boolean
}

export const DEFAULT_DURAK_OPTIONS: DurakOptions = { throwIn: 'all', firstAttackFive: true }

export const HAND_SIZE = 6

export type DurakAction =
  | { readonly type: 'attack'; readonly cardId: CardId }
  | { readonly type: 'defend'; readonly cardId: CardId }
  | { readonly type: 'take' }
  | { readonly type: 'done' }

export interface TablePair {
  readonly attack: SuitedCard
  readonly defense: SuitedCard | null
}

export type DurakEvent =
  | { readonly type: 'attacked'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'defended'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'done'; readonly player: PlayerId }
  | { readonly type: 'took'; readonly player: PlayerId; readonly count: number }
  | { readonly type: 'beaten'; readonly player: PlayerId }
  | { readonly type: 'finished'; readonly player: PlayerId }

export interface DurakState {
  readonly seats: readonly PlayerId[]
  readonly humans: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Cards to draw from the front; the last card is the trump card lying face up. */
  readonly stock: readonly SuitedCard[]
  readonly trumpCard: SuitedCard
  readonly table: readonly TablePair[]
  readonly attacker: PlayerId
  readonly defender: PlayerId
  readonly turn: PlayerId
  readonly phase: 'attack' | 'defend' | 'over'
  /** Attackers who said "done" since the last defence. */
  readonly done: readonly PlayerId[]
  /** Most attack cards allowed in this bout. */
  readonly limit: number
  readonly firstBout: boolean
  readonly discarded: number
  /** Players who got rid of all cards, in that order. */
  readonly finished: readonly PlayerId[]
  readonly durak: PlayerId | null
  readonly events: readonly DurakEvent[]
  readonly options: DurakOptions
}

export interface DurakView {
  readonly seats: readonly PlayerId[]
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly stockCount: number
  readonly trumpCard: SuitedCard
  readonly table: readonly TablePair[]
  readonly attacker: PlayerId
  readonly defender: PlayerId
  readonly turn: PlayerId
  readonly phase: DurakState['phase']
  readonly limit: number
  readonly discarded: number
  readonly finished: readonly PlayerId[]
  readonly durak: PlayerId | null
  readonly events: readonly DurakEvent[]
  readonly options: DurakOptions
}

// --- Cards -------------------------------------------------------------------------------------

const ORDER: readonly Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const strength = (card: SuitedCard) => ORDER.indexOf(card.rank)

/** Whether `defense` beats `attack`: higher of the same suit, or any trump on a non-trump. */
export function beats(defense: SuitedCard, attack: SuitedCard, trump: Suit) {
  if (defense.suit === attack.suit) return strength(defense) > strength(attack)
  return defense.suit === trump && attack.suit !== trump
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }

/** Non-trumps by suit and rank, trumps last. */
export function sortHand(cards: readonly SuitedCard[], trump: Suit) {
  const key = (c: SuitedCard) => (c.suit === trump ? 4 : SUIT_ORDER[c.suit]) * 10 + strength(c)
  return [...cards].sort((a, b) => key(a) - key(b))
}

// --- Flow --------------------------------------------------------------------------------------

const active = (state: Pick<DurakState, 'seats' | 'hands'>) =>
  state.seats.filter((p) => state.hands[p]!.length > 0)

function nextActive(state: DurakState, from: PlayerId): PlayerId {
  const players = active(state)
  let p = from
  for (let i = 0; i < state.seats.length; i++) {
    p = nextPlayer(state.seats, p)
    if (players.includes(p)) return p
  }
  return from
}

/** Who may attack, in order: the attacker, then the others after the defender. */
function attackers(state: DurakState): PlayerId[] {
  if (state.options.throwIn === 'attacker') return [state.attacker]
  const order: PlayerId[] = [state.attacker]
  let p = state.defender
  for (let i = 0; i < state.seats.length; i++) {
    p = nextPlayer(state.seats, p)
    if (p !== state.attacker && p !== state.defender) order.push(p)
  }
  return order
}

const tableRanks = (state: DurakState) =>
  new Set(state.table.flatMap((t) => [t.attack.rank, ...(t.defense ? [t.defense.rank] : [])]))

function canAttackWith(state: DurakState, card: SuitedCard) {
  if (state.table.length >= state.limit) return false
  return state.table.length === 0 || tableRanks(state).has(card.rank)
}

/** The next attacker who has not said "done" and still has cards, or null. */
function nextAttacker(state: DurakState): PlayerId | null {
  return attackers(state).find((p) => !state.done.includes(p) && state.hands[p]!.length > 0) ?? null
}

/** Draw up to six cards: attackers first, the defender last. */
function refill(state: DurakState): DurakState {
  const hands = { ...state.hands }
  let stock = state.stock
  for (const p of [...attackers(state), state.defender]) {
    const need = Math.max(0, HAND_SIZE - hands[p]!.length)
    if (need === 0 || stock.length === 0) continue
    hands[p] = sortHand([...hands[p]!, ...stock.slice(0, need)], state.trumpCard.suit)
    stock = stock.slice(need)
  }
  return { ...state, hands, stock }
}

function startBout(state: DurakState, attacker: PlayerId): DurakState {
  // Players without cards (and nothing left to draw) are out.
  const out = state.seats.filter((p) => state.hands[p]!.length === 0 && !state.finished.includes(p))
  const finished = [...state.finished, ...out]
  const events: DurakEvent[] = [
    ...state.events,
    ...out.map((player) => ({ type: 'finished' as const, player })),
  ]
  const players = active(state)
  const humansOut = state.humans.length > 0 && state.humans.every((h) => finished.includes(h))
  if (players.length <= 1 || humansOut) {
    return {
      ...state,
      finished,
      events,
      table: [],
      phase: 'over',
      durak: players.length === 1 ? players[0]! : null,
    }
  }
  const first = players.includes(attacker) ? attacker : nextActive(state, attacker)
  const defender = nextActive(state, first)
  const base = { ...state, finished, events, table: [], done: [], attacker: first, defender }
  const cap = state.firstBout && state.options.firstAttackFive ? 5 : HAND_SIZE
  return {
    ...base,
    limit: Math.min(cap, state.hands[defender]!.length),
    turn: first,
    phase: 'attack',
  }
}

/** All attacks were beaten and nobody adds more: the cards go away and the defender attacks. */
function beaten(state: DurakState): DurakState {
  const next = refill({
    ...state,
    discarded: state.discarded + state.table.length * 2,
    table: [],
    firstBout: false,
    events: [...state.events, { type: 'beaten', player: state.defender }],
  })
  return startBout(next, state.defender)
}

/** After a defence or a "done": the next attacker, or the bout ends. */
function continueAttack(state: DurakState): DurakState {
  const defenderEmpty = state.hands[state.defender]!.length === 0
  const next = state.table.length >= state.limit || defenderEmpty ? null : nextAttacker(state)
  if (!next) return beaten(state)
  return { ...state, phase: 'attack', turn: next }
}

// --- Game definition ---------------------------------------------------------------------------

export const durakRules = defineGame<DurakState, DurakAction, DurakOptions, DurakView>({
  id: 'durak',
  name: 'Durak',
  players: { min: 2, max: 6 },
  defaultOptions: DEFAULT_DURAK_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'throwIn',
      label: 'Beilegen',
      description: 'Wer zu einem Angriff weitere Karten mit passendem Wert legen darf.',
      choices: [
        { value: 'all', label: 'alle Mitspieler' },
        { value: 'attacker', label: 'nur der Angreifer' },
      ],
    },
    {
      type: 'boolean',
      key: 'firstAttackFive',
      label: 'Erster Angriff höchstens 5 Karten',
    },
  ],

  setup({ players, options, seed }) {
    const seats = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const deck = rng.shuffle(createDeck('short36')) as SuitedCard[]
    const trumpCard = deck.at(-1)!
    const hands = Object.fromEntries(
      seats.map((p, i) => [
        p,
        sortHand(deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE), trumpCard.suit),
      ]),
    )
    const stock = deck.slice(seats.length * HAND_SIZE)
    // The lowest trump starts; without trumps a random player.
    const lowestTrump = (p: PlayerId) =>
      Math.min(
        ...hands[p]!.filter((c) => c.suit === trumpCard.suit).map(strength),
        Number.POSITIVE_INFINITY,
      )
    const byTrump = [...seats].sort((a, b) => lowestTrump(a) - lowestTrump(b))
    const starter =
      lowestTrump(byTrump[0]!) === Number.POSITIVE_INFINITY ? rng.pick(seats) : byTrump[0]!
    const state: DurakState = {
      seats,
      humans: players.filter((p) => p.kind === 'human').map((p) => p.id),
      hands,
      stock,
      trumpCard,
      table: [],
      attacker: starter,
      defender: starter,
      turn: starter,
      phase: 'attack',
      done: [],
      limit: HAND_SIZE,
      firstBout: true,
      discarded: 0,
      finished: [],
      durak: null,
      events: [],
      options,
    }
    return startBout(state, starter)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const hand = state.hands[player]!
    if (state.phase === 'defend') {
      const open = state.table.find((t) => !t.defense)!
      return [
        ...hand
          .filter((c) => beats(c, open.attack, state.trumpCard.suit))
          .map((c) => ({ type: 'defend' as const, cardId: c.id })),
        { type: 'take' },
      ]
    }
    const attacks = hand
      .filter((c) => canAttackWith(state, c))
      .map((c) => ({ type: 'attack' as const, cardId: c.id }))
    return state.table.length === 0 ? attacks : [...attacks, { type: 'done' }]
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    switch (action.type) {
      case 'attack': {
        const card = hand.find((c) => c.id === action.cardId)!
        return {
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c !== card) },
          table: [...state.table, { attack: card, defense: null }],
          phase: 'defend',
          turn: state.defender,
          events: [{ type: 'attacked', player, card }],
        }
      }
      case 'defend': {
        const card = hand.find((c) => c.id === action.cardId)!
        return continueAttack({
          ...state,
          hands: { ...state.hands, [player]: hand.filter((c) => c !== card) },
          table: state.table.map((t) => (t.defense ? t : { ...t, defense: card })),
          done: [],
          events: [{ type: 'defended', player, card }],
        })
      }
      case 'done':
        return continueAttack({
          ...state,
          done: [...state.done, player],
          events: [{ type: 'done', player }],
        })
      case 'take': {
        const taken = state.table.flatMap((t) => (t.defense ? [t.attack, t.defense] : [t.attack]))
        const next = refill({
          ...state,
          hands: {
            ...state.hands,
            [player]: sortHand([...hand, ...taken], state.trumpCard.suit),
          },
          table: [],
          firstBout: false,
          events: [{ type: 'took', player, count: taken.length }],
        })
        // The defender who took is skipped: the player after them attacks next.
        return startBout(next, nextActive(next, state.defender))
      }
    }
  },

  playerView: (state, player) => ({
    seats: state.seats,
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.seats.map((p) => [p, state.hands[p]!.length])),
    stockCount: state.stock.length,
    trumpCard: state.trumpCard,
    table: state.table,
    attacker: state.attacker,
    defender: state.defender,
    turn: state.turn,
    phase: state.phase,
    limit: state.limit,
    discarded: state.discarded,
    finished: state.finished,
    durak: state.durak,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const rest = state.seats.filter((p) => !state.finished.includes(p))
    const ranking = [...state.finished, ...rest]
    const losers = state.durak ? [state.durak] : rest.filter((p) => !state.finished.includes(p))
    const scores = Object.fromEntries(state.seats.map((p) => [p, losers.includes(p) ? 0 : 1]))
    return {
      scores,
      // Everybody but the Durak wins; when the last two finish together nobody is the Durak.
      winners: state.seats.filter((p) => !losers.includes(p)),
      ranking,
    }
  },

  describeAction: (action) =>
    action.type === 'attack' || action.type === 'defend'
      ? `${action.type} ${action.cardId}`
      : action.type,
})
