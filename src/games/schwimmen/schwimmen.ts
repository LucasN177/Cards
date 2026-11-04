/**
 * Schwimmen (31) rules. Pure and deterministic; see `SchwimmenRules.tsx` for the rule text.
 */
import {
  type CardId,
  createDeck,
  deal,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  type Rank,
  Rng,
  type RngState,
  SUITS,
  type SuitedCard,
} from '@/engine'

export interface SchwimmenOptions {
  /** Lives before swimming; one more lost round while swimming means you are out. */
  readonly lives: 2 | 3 | 4
  /** With 31 ("Feuer") the round ends at once; who loses a life then. */
  readonly fire: 'lowest' | 'allOthers'
}

export const DEFAULT_SCHWIMMEN_OPTIONS: SchwimmenOptions = { lives: 3, fire: 'lowest' }

export type SchwimmenAction =
  | { readonly type: 'swap'; readonly handCardId: CardId; readonly middleCardId: CardId }
  | { readonly type: 'swapAll' }
  | { readonly type: 'pass' }
  | { readonly type: 'knock' }

export type SchwimmenEvent =
  | {
      readonly type: 'swapped'
      readonly player: PlayerId
      readonly gave: SuitedCard
      readonly took: SuitedCard
    }
  | { readonly type: 'swappedAll'; readonly player: PlayerId }
  | { readonly type: 'passed'; readonly player: PlayerId }
  | { readonly type: 'knocked'; readonly player: PlayerId }
  | { readonly type: 'newMiddle' }
  | { readonly type: 'fire'; readonly player: PlayerId }

export interface RoundResult {
  readonly round: number
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly values: Readonly<Record<PlayerId, number>>
  readonly losers: readonly PlayerId[]
  readonly eliminated: readonly PlayerId[]
  readonly fireBy: PlayerId | null
}

export interface SchwimmenState {
  /** All players in seating order (also the eliminated ones). */
  readonly seats: readonly PlayerId[]
  /** Human players: once they are all out, the game ends (nobody has to watch the rest). */
  readonly humans: readonly PlayerId[]
  readonly alive: readonly PlayerId[]
  readonly lives: Readonly<Record<PlayerId, number>>
  readonly swimming: Readonly<Record<PlayerId, boolean>>
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly middle: readonly SuitedCard[]
  readonly stock: readonly SuitedCard[]
  readonly turn: PlayerId
  readonly round: number
  readonly passesInRow: number
  readonly knockedBy: PlayerId | null
  /** Turns left after somebody knocked. */
  readonly turnsLeft: number
  readonly phase: 'playing' | 'over'
  readonly lastRound: RoundResult | null
  /** Order in which players dropped out (first out first). */
  readonly out: readonly PlayerId[]
  readonly events: readonly SchwimmenEvent[]
  readonly options: SchwimmenOptions
  readonly rng: RngState
}

export interface SchwimmenView {
  readonly seats: readonly PlayerId[]
  readonly alive: readonly PlayerId[]
  readonly lives: SchwimmenState['lives']
  readonly swimming: SchwimmenState['swimming']
  readonly hand: readonly SuitedCard[]
  readonly handValue: number
  readonly middle: readonly SuitedCard[]
  readonly stockCount: number
  readonly turn: PlayerId
  readonly round: number
  readonly knockedBy: PlayerId | null
  readonly passesInRow: number
  readonly phase: SchwimmenState['phase']
  readonly lastRound: RoundResult | null
  readonly events: readonly SchwimmenEvent[]
  readonly options: SchwimmenOptions
}

// --- Values ------------------------------------------------------------------------------------

export const cardValue = (rank: Rank) =>
  rank === 'A'
    ? 11
    : rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10'
      ? 10
      : Number(rank)

/** Best sum of one suit; three of a kind count 30.5. 31 is the best possible hand. */
export function handValue(cards: readonly SuitedCard[]): number {
  let best = 0
  for (const suit of SUITS) {
    const sum = cards.filter((c) => c.suit === suit).reduce((s, c) => s + cardValue(c.rank), 0)
    best = Math.max(best, sum)
  }
  const sameRank = cards.length === 3 && cards.every((c) => c.rank === cards[0]!.rank)
  return sameRank ? Math.max(best, 30.5) : best
}

export const formatValue = (value: number) => (value === 30.5 ? '30½' : String(value))

// --- Round flow --------------------------------------------------------------------------------

function dealRound(
  state: Omit<SchwimmenState, 'hands' | 'middle' | 'stock' | 'turn'>,
  starter: PlayerId,
): SchwimmenState {
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('piquet32')) as SuitedCard[]
  const { hands, rest } = deal(deck, state.alive.length + 1, 3)
  return {
    ...state,
    hands: Object.fromEntries(state.alive.map((p, i) => [p, hands[i]!])),
    middle: hands[state.alive.length]!,
    stock: rest,
    turn: starter,
    passesInRow: 0,
    knockedBy: null,
    turnsLeft: 0,
    rng: rng.state,
  }
}

/** Ends the round: the lowest hand(s) lose a life; swimmers who lose are out. */
function endRound(state: SchwimmenState, fireBy: PlayerId | null): SchwimmenState {
  const values = Object.fromEntries(state.alive.map((p) => [p, handValue(state.hands[p]!)]))
  const lowest = Math.min(...state.alive.map((p) => values[p]!))
  const losers =
    fireBy && state.options.fire === 'allOthers'
      ? state.alive.filter((p) => p !== fireBy)
      : state.alive.filter((p) => values[p] === lowest && p !== fireBy)

  const lives = { ...state.lives }
  const swimming = { ...state.swimming }
  const eliminated: PlayerId[] = []
  // If every remaining swimmer would drown at once, nobody does and the round is replayed.
  const allDrown = state.alive.every((p) => losers.includes(p) && swimming[p])
  for (const p of losers) {
    if (allDrown) continue
    if (swimming[p]) eliminated.push(p)
    else if (lives[p]! <= 1) {
      lives[p] = 0
      swimming[p] = true
    } else lives[p] = lives[p]! - 1
  }
  const alive = state.alive.filter((p) => !eliminated.includes(p))
  const lastRound: RoundResult = {
    round: state.round,
    hands: state.hands,
    values,
    losers,
    eliminated,
    fireBy,
  }
  const base = {
    ...state,
    alive,
    lives,
    swimming,
    lastRound,
    out: [...state.out, ...eliminated],
  }
  const humansOut = state.humans.length > 0 && state.humans.every((h) => !alive.includes(h))
  if (alive.length <= 1 || humansOut) return { ...base, phase: 'over' }
  // The next round starts with the player after the last starter who is still in.
  const starter = alive.includes(state.turn) ? nextPlayer(alive, state.turn) : alive[0]!
  return { ...dealRound({ ...base, round: state.round + 1 }, starter), events: state.events }
}

/** After a move: 31 ends the round, a knock counts down, otherwise the next player is on. */
function afterMove(state: SchwimmenState, player: PlayerId): SchwimmenState {
  if (handValue(state.hands[player]!) === 31) {
    return endRound({ ...state, events: [...state.events, { type: 'fire', player }] }, player)
  }
  if (state.knockedBy) {
    const turnsLeft = state.turnsLeft - 1
    if (turnsLeft <= 0) return endRound({ ...state, turnsLeft: 0 }, null)
    return { ...state, turnsLeft, turn: nextPlayer(state.alive, player) }
  }
  return { ...state, turn: nextPlayer(state.alive, player) }
}

// --- Game definition ---------------------------------------------------------------------------

export const schwimmenRules = defineGame<
  SchwimmenState,
  SchwimmenAction,
  SchwimmenOptions,
  SchwimmenView
>({
  id: 'schwimmen',
  name: 'Schwimmen (31)',
  players: { min: 2, max: 9 },
  defaultOptions: DEFAULT_SCHWIMMEN_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'lives',
      label: 'Leben',
      description: 'Danach schwimmt man noch eine Runde, bevor man ausscheidet.',
      choices: [
        { value: 2, label: '2' },
        { value: 3, label: '3' },
        { value: 4, label: '4' },
      ],
    },
    {
      type: 'choice',
      key: 'fire',
      label: 'Bei 31 („Feuer“) verliert …',
      choices: [
        { value: 'lowest', label: 'wer am wenigsten hat' },
        { value: 'allOthers', label: 'jeder andere' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const seats = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    return dealRound(
      {
        seats,
        humans: players.filter((p) => p.kind === 'human').map((p) => p.id),
        alive: seats,
        lives: Object.fromEntries(seats.map((p) => [p, options.lives])),
        swimming: Object.fromEntries(seats.map((p) => [p, false])),
        round: 1,
        passesInRow: 0,
        knockedBy: null,
        turnsLeft: 0,
        phase: 'playing',
        lastRound: null,
        out: [],
        events: [],
        options,
        rng: rng.state,
      },
      seats[rng.int(seats.length)]!,
    )
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const hand = state.hands[player]!
    const swaps: SchwimmenAction[] = hand.flatMap((h) =>
      state.middle.map((m) => ({ type: 'swap' as const, handCardId: h.id, middleCardId: m.id })),
    )
    return [
      ...swaps,
      { type: 'swapAll' },
      { type: 'pass' },
      ...(state.knockedBy ? [] : [{ type: 'knock' as const }]),
    ]
  },

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    switch (action.type) {
      case 'swap': {
        const gave = hand.find((c) => c.id === action.handCardId)!
        const took = state.middle.find((c) => c.id === action.middleCardId)!
        return afterMove(
          {
            ...state,
            hands: { ...state.hands, [player]: hand.map((c) => (c === gave ? took : c)) },
            middle: state.middle.map((c) => (c === took ? gave : c)),
            passesInRow: 0,
            events: [{ type: 'swapped', player, gave, took }],
          },
          player,
        )
      }
      case 'swapAll':
        return afterMove(
          {
            ...state,
            hands: { ...state.hands, [player]: state.middle },
            middle: hand,
            passesInRow: 0,
            events: [{ type: 'swappedAll', player }],
          },
          player,
        )
      case 'knock':
        // Everybody else gets exactly one more turn.
        return {
          ...state,
          knockedBy: player,
          turnsLeft: state.alive.length - 1,
          turn: nextPlayer(state.alive, player),
          passesInRow: 0,
          events: [{ type: 'knocked', player }],
        }
      case 'pass': {
        const events: SchwimmenEvent[] = [{ type: 'passed', player }]
        const passesInRow = state.passesInRow + 1
        // Everybody passed in a row: three new cards come into the middle (if there are any).
        if (!state.knockedBy && passesInRow >= state.alive.length) {
          if (state.stock.length < 3) return endRound({ ...state, events }, null)
          return afterMove(
            {
              ...state,
              middle: state.stock.slice(0, 3),
              stock: state.stock.slice(3),
              passesInRow: 0,
              events: [...events, { type: 'newMiddle' }],
            },
            player,
          )
        }
        return afterMove({ ...state, passesInRow, events }, player)
      }
    }
  },

  playerView: (state, player) => ({
    seats: state.seats,
    alive: state.alive,
    lives: state.lives,
    swimming: state.swimming,
    hand: state.hands[player] ?? [],
    handValue: handValue(state.hands[player] ?? []),
    middle: state.middle,
    stockCount: state.stock.length,
    turn: state.turn,
    round: state.round,
    knockedBy: state.knockedBy,
    passesInRow: state.passesInRow,
    phase: state.phase,
    lastRound: state.lastRound,
    events: state.events,
    options: state.options,
  }),

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    // Players still in rank by lives left (swimming counts as zero), then who dropped out later.
    const lifeScore = (p: PlayerId) => (state.alive.includes(p) ? state.lives[p]! : -1)
    const stillIn = [...state.alive].sort((a, b) => lifeScore(b) - lifeScore(a))
    const ranking = [...stillIn, ...[...state.out].reverse()]
    const best = lifeScore(stillIn[0]!)
    return {
      scores: Object.fromEntries(state.seats.map((p) => [p, Math.max(0, lifeScore(p))])),
      winners: stillIn.filter((p) => lifeScore(p) === best),
      ranking,
      scoreLabel: 'Leben',
    }
  },

  describeAction: (action) =>
    action.type === 'swap' ? `swap ${action.handCardId} ↔ ${action.middleCardId}` : action.type,
})
