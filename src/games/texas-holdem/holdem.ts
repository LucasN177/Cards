/**
 * No-limit Texas Hold'em for 2–9 players with play chips: blinds, four betting rounds, side
 * pots and showdown. The game runs until one player has all chips, the human is out, or the hand
 * limit is reached. Pure and deterministic.
 */
import {
  createDeck,
  defineGame,
  type GameResult,
  type PlayerId,
  Rng,
  type RngState,
  type SuitedCard,
} from '@/engine'
import { evaluate } from './handRank'

export interface HoldemOptions {
  /** Chips everybody starts with (the big blind starts at 20). */
  readonly startingStack: 1000 | 2000 | 5000
  /** The blinds rise by half every ten hands. */
  readonly risingBlinds: boolean
  /** End after this many hands (0: until one player has all chips). */
  readonly handLimit: 0 | 30 | 60
}

export const DEFAULT_HOLDEM_OPTIONS: HoldemOptions = {
  startingStack: 1000,
  risingBlinds: true,
  handLimit: 0,
}

export const START_BIG_BLIND = 20
export const BLIND_LEVEL_HANDS = 10

export type HoldemAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  /** Bet or raise to a total of `to` chips in this betting round. */
  | { readonly type: 'raise'; readonly to: number }

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface PotAward {
  readonly amount: number
  readonly winners: readonly PlayerId[]
  /** Everybody who could win this pot. */
  readonly eligible: readonly PlayerId[]
}

export interface HandResult {
  readonly hand: number
  readonly board: readonly SuitedCard[]
  /** Hole cards of the players who went to showdown (empty when everybody else folded). */
  readonly shown: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  /** Hand score of each shown player (see `handRank.ts`). */
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly pots: readonly PotAward[]
  /** Net chips won (or lost) per player in this hand. */
  readonly net: Readonly<Record<PlayerId, number>>
  /** Players eliminated in this hand. */
  readonly busted: readonly PlayerId[]
}

export type HoldemEvent =
  | { readonly type: 'blinds'; readonly small: PlayerId; readonly big: PlayerId }
  | {
      readonly type: 'acted'
      readonly player: PlayerId
      readonly action: HoldemAction
      readonly amount: number
    }
  | { readonly type: 'street'; readonly street: Street }
  | { readonly type: 'hand'; readonly result: HandResult }

export interface HoldemState {
  readonly order: readonly PlayerId[]
  readonly stacks: Readonly<Record<PlayerId, number>>
  /** Players still in the game (stack > 0 at the start of the hand), in seat order. */
  readonly seated: readonly PlayerId[]
  readonly button: PlayerId
  readonly hole: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly deck: readonly SuitedCard[]
  readonly board: readonly SuitedCard[]
  readonly street: Street
  readonly folded: readonly PlayerId[]
  /** Chips put in during the current betting round. */
  readonly bets: Readonly<Record<PlayerId, number>>
  /** Chips put in during the whole hand. */
  readonly contributed: Readonly<Record<PlayerId, number>>
  readonly currentBet: number
  /** Size of the last full raise (the minimum for the next one). */
  readonly lastRaise: number
  /** Players who still have to act in this betting round. */
  readonly pending: readonly PlayerId[]
  readonly turn: PlayerId
  readonly smallBlind: number
  readonly bigBlind: number
  readonly handNumber: number
  readonly phase: 'betting' | 'over'
  /** Hand number in which each eliminated player went out. */
  readonly bustedIn: Readonly<Record<PlayerId, number>>
  readonly results: readonly HandResult[]
  readonly events: readonly HoldemEvent[]
  readonly options: HoldemOptions
  /** The player who must not be eliminated for the game to go on (the human), if any. */
  readonly protagonist: PlayerId | null
  readonly rng: RngState
}

export interface HoldemView {
  readonly order: readonly PlayerId[]
  readonly seated: readonly PlayerId[]
  readonly stacks: HoldemState['stacks']
  readonly button: PlayerId
  readonly hole: readonly SuitedCard[]
  readonly board: readonly SuitedCard[]
  readonly street: Street
  readonly folded: readonly PlayerId[]
  readonly bets: HoldemState['bets']
  readonly contributed: HoldemState['contributed']
  readonly pot: number
  readonly currentBet: number
  readonly lastRaise: number
  /** Chips the viewer needs to call. */
  readonly toCall: number
  /** Smallest legal raise target (or all-in if less). */
  readonly minRaiseTo: number
  /** All-in target for the viewer. */
  readonly maxRaiseTo: number
  readonly turn: PlayerId
  readonly smallBlind: number
  readonly bigBlind: number
  readonly handNumber: number
  readonly phase: HoldemState['phase']
  readonly bustedIn: HoldemState['bustedIn']
  readonly results: readonly HandResult[]
  readonly events: readonly HoldemEvent[]
  readonly options: HoldemOptions
}

// --- Helpers -----------------------------------------------------------------------------------

const record = <T>(ids: readonly PlayerId[], value: (p: PlayerId) => T) =>
  Object.fromEntries(ids.map((p) => [p, value(p)])) as Record<PlayerId, T>

/** The next player after `player` among `among` (seat order), wrapping around. */
function nextIn(order: readonly PlayerId[], among: readonly PlayerId[], player: PlayerId) {
  const start = order.indexOf(player)
  for (let i = 1; i <= order.length; i++) {
    const p = order[(start + i) % order.length]!
    if (among.includes(p)) return p
  }
  return player
}

/** Blinds for a hand: they rise by half every ten hands (rounded to 5 chips). */
export function blindsFor(handNumber: number, options: HoldemOptions) {
  const level = options.risingBlinds ? Math.floor(handNumber / BLIND_LEVEL_HANDS) : 0
  const big = Math.round((START_BIG_BLIND * 1.5 ** level) / 10) * 10
  return { small: big / 2, big }
}

/** Players still contesting the pot. */
export const liveIn = (state: HoldemState) => state.seated.filter((p) => !state.folded.includes(p))
/** Live players who can still bet (not all-in). */
const canAct = (state: HoldemState) => liveIn(state).filter((p) => state.stacks[p]! > 0)

export const potOf = (state: Pick<HoldemState, 'contributed'>) =>
  Object.values(state.contributed).reduce((s, n) => s + n, 0)

/** Moves `amount` chips of `player` into the pot (capped by the stack). */
function pay(state: HoldemState, player: PlayerId, amount: number): HoldemState {
  const paid = Math.min(amount, state.stacks[player]!)
  return {
    ...state,
    stacks: { ...state.stacks, [player]: state.stacks[player]! - paid },
    bets: { ...state.bets, [player]: state.bets[player]! + paid },
    contributed: { ...state.contributed, [player]: state.contributed[player]! + paid },
  }
}

// --- Hands -------------------------------------------------------------------------------------

function startHand(state: HoldemState, button: PlayerId, handNumber: number): HoldemState {
  const seated = state.order.filter((p) => state.stacks[p]! > 0)
  const rng = new Rng(state.rng)
  const deck = rng.shuffle(createDeck('standard52')) as SuitedCard[]
  const hole: Record<PlayerId, SuitedCard[]> = {}
  for (const p of seated) hole[p] = [deck.pop()!, deck.pop()!]
  const { small, big } = blindsFor(handNumber, state.options)
  // Heads-up the button posts the small blind and acts first before the flop.
  const sbPlayer = seated.length === 2 ? button : nextIn(state.order, seated, button)
  const bbPlayer = nextIn(state.order, seated, sbPlayer)
  let next: HoldemState = {
    ...state,
    seated,
    button,
    hole,
    deck,
    board: [],
    street: 'preflop',
    folded: [],
    bets: record(state.order, () => 0),
    contributed: record(state.order, () => 0),
    currentBet: 0,
    lastRaise: big,
    pending: [],
    turn: button,
    smallBlind: small,
    bigBlind: big,
    handNumber,
    rng: rng.state,
  }
  next = pay(pay(next, sbPlayer, small), bbPlayer, big)
  const first = nextIn(state.order, seated, bbPlayer)
  // Everybody acts once; the big blind gets the option at the end.
  const pending = seatedFrom(state.order, seated, first).filter((p) => next.stacks[p]! > 0)
  next = {
    ...next,
    currentBet: Math.max(next.bets[sbPlayer]!, next.bets[bbPlayer]!, big),
    pending,
    turn: pending[0] ?? first,
    events: [...state.events, { type: 'blinds', small: sbPlayer, big: bbPlayer }],
  }
  // Blinds put everybody all-in: nothing to decide.
  return pending.length === 0 ||
    (pending.length === 1 && next.bets[pending[0]!]! >= next.currentBet)
    ? runOut(next)
    : next
}

/** `among` in seat order, starting with `first`. */
function seatedFrom(order: readonly PlayerId[], among: readonly PlayerId[], first: PlayerId) {
  const start = order.indexOf(first)
  return [...order.slice(start), ...order.slice(0, start)].filter((p) => among.includes(p))
}

/** Deals the next street and opens its betting round (or ends the hand). */
function nextStreet(state: HoldemState): HoldemState {
  const deck = [...state.deck]
  const board = [...state.board]
  const street: Street =
    state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river'
  if (state.street === 'river') return showdown(state)
  deck.pop() // burn
  for (let i = 0; i < (street === 'flop' ? 3 : 1); i++) board.push(deck.pop()!)
  const opened: HoldemState = {
    ...state,
    deck,
    board,
    street,
    bets: record(state.order, () => 0),
    currentBet: 0,
    lastRaise: state.bigBlind,
    events: [...state.events, { type: 'street', street }],
  }
  const actors = canAct(opened)
  // Nobody (or only one) can bet any more: deal the rest without betting.
  if (actors.length <= 1) return nextStreet({ ...opened, pending: [] })
  const first = nextIn(state.order, actors, state.button)
  const pending = seatedFrom(state.order, actors, first)
  return { ...opened, pending, turn: pending[0]! }
}

/** All-in before the river: deal the remaining board and show down. */
function runOut(state: HoldemState): HoldemState {
  // With at most one player able to bet, `nextStreet` deals on by itself up to the showdown.
  return nextStreet({ ...state, pending: [] })
}

/** Splits the pot into main and side pots and pays the best hands. */
function showdown(state: HoldemState): HoldemState {
  const live = liveIn(state)
  const scores = record(live, (p) => evaluate([...state.hole[p]!, ...state.board]))
  return finishHand(state, live, scores)
}

/** Ends the hand: pots to the winners, eliminations, next hand or game over. */
function finishHand(
  state: HoldemState,
  live: readonly PlayerId[],
  scores: Readonly<Record<PlayerId, number>>,
): HoldemState {
  const contributions = state.seated.map((p) => state.contributed[p]!)
  const levels = [
    ...new Set(state.seated.filter((p) => live.includes(p)).map((p) => state.contributed[p]!)),
  ].sort((a, b) => a - b)
  const stacks = { ...state.stacks }
  const pots: PotAward[] = []
  let previous = 0
  for (const level of levels) {
    const amount = contributions.reduce(
      (sum, c) => sum + Math.max(0, Math.min(c, level) - previous),
      0,
    )
    const eligible = live.filter((p) => state.contributed[p]! >= level)
    previous = level
    if (amount === 0) continue
    const best = Math.max(...eligible.map((p) => scores[p] ?? 0))
    const winners = eligible.filter((p) => (scores[p] ?? 0) === best)
    // The odd chip goes to the first winner left of the button.
    const ordered = seatedFrom(state.order, winners, nextIn(state.order, winners, state.button))
    const share = Math.floor(amount / winners.length)
    ordered.forEach((p, i) => {
      stacks[p] = stacks[p]! + share + (i < amount - share * winners.length ? 1 : 0)
    })
    pots.push({ amount, winners: ordered, eligible })
  }
  // Folded chips above the highest live level (rare) go to the last pot's winner.
  const leftover = potOf(state) - pots.reduce((s, p) => s + p.amount, 0)
  if (leftover > 0) {
    const taker = pots.at(-1)?.winners[0] ?? live[0]!
    stacks[taker] = stacks[taker]! + leftover
  }
  const net = record(state.seated, (p) => stacks[p]! - state.stacks[p]! - state.contributed[p]!)
  const busted = state.seated.filter((p) => stacks[p] === 0)
  const shown =
    live.length > 1 ? record(live, (p) => state.hole[p]!) : ({} as Record<PlayerId, SuitedCard[]>)
  const result: HandResult = {
    hand: state.handNumber,
    board: state.board,
    shown,
    scores: live.length > 1 ? scores : {},
    pots,
    net,
    busted,
  }
  const bustedIn = { ...state.bustedIn, ...record(busted, () => state.handNumber) }
  const done: HoldemState = {
    ...state,
    stacks,
    bustedIn,
    pending: [],
    results: [...state.results, result],
    events: [...state.events, { type: 'hand', result }],
  }
  const remaining = state.order.filter((p) => stacks[p]! > 0)
  const limit = state.options.handLimit
  const over =
    remaining.length <= 1 ||
    (state.protagonist !== null && stacks[state.protagonist] === 0) ||
    (limit > 0 && state.handNumber + 1 >= limit)
  if (over) return { ...done, phase: 'over' }
  const next = startHand(done, nextIn(state.order, remaining, state.button), state.handNumber + 1)
  return { ...next, events: done.events }
}

/** After an action: next player, next street, or the end of the hand. */
function advance(state: HoldemState, player: PlayerId): HoldemState {
  const live = liveIn(state)
  if (live.length === 1) return finishHand(state, live, { [live[0]!]: 0 })
  if (state.pending.length > 0) {
    const turn = seatedFrom(
      state.order,
      state.pending,
      nextIn(state.order, state.pending, player),
    )[0]!
    return { ...state, turn }
  }
  // Betting round complete.
  if (canAct(state).length <= 1 && state.street !== 'river') return runOut(state)
  return nextStreet(state)
}

// --- Game definition ---------------------------------------------------------------------------

/** Smallest raise target: the current bet plus the last raise (never above all-in). */
const minRaiseTo = (state: HoldemState, player: PlayerId) =>
  Math.min(state.currentBet + state.lastRaise, state.bets[player]! + state.stacks[player]!)

export const holdemRules = defineGame<HoldemState, HoldemAction, HoldemOptions, HoldemView>({
  id: 'texas-holdem',
  name: "Texas Hold'em",
  players: { min: 2, max: 9, default: 6 },
  defaultOptions: DEFAULT_HOLDEM_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'startingStack',
      label: 'Startchips',
      description: 'Der Big Blind beginnt bei 20 Chips.',
      choices: [
        { value: 1000, label: '1000' },
        { value: 2000, label: '2000' },
        { value: 5000, label: '5000' },
      ],
    },
    {
      type: 'boolean',
      key: 'risingBlinds',
      label: 'Steigende Blinds',
      description: 'Alle zehn Hände steigen die Blinds um die Hälfte.',
    },
    {
      type: 'choice',
      key: 'handLimit',
      label: 'Spielende',
      description: 'Bis einer alle Chips hat – oder nach einer festen Zahl von Händen.',
      choices: [
        { value: 0, label: 'Bis einer übrig ist' },
        { value: 30, label: '30 Hände' },
        { value: 60, label: '60 Hände' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const human = players.find((p) => p.kind === 'human')?.id ?? null
    const base = {
      order,
      stacks: record(order, () => options.startingStack),
      bustedIn: {},
      results: [],
      events: [],
      options,
      protagonist: human,
      phase: 'betting',
      rng: rng.state,
    } as unknown as HoldemState
    return startHand(base, order[rng.int(order.length)]!, 0)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    const toCall = state.currentBet - state.bets[player]!
    const actions: HoldemAction[] = []
    if (toCall > 0) actions.push({ type: 'fold' }, { type: 'call' })
    else actions.push({ type: 'check' })
    const allIn = state.bets[player]! + state.stacks[player]!
    if (allIn > state.currentBet) {
      const min = minRaiseTo(state, player)
      actions.push({ type: 'raise', to: min })
      if (allIn > min) actions.push({ type: 'raise', to: allIn })
    }
    return actions
  },

  validateAction(state, player, action) {
    if (state.phase === 'over' || state.turn !== player) return 'Du bist nicht am Zug'
    const toCall = state.currentBet - state.bets[player]!
    switch (action.type) {
      case 'fold':
        return null
      case 'check':
        return toCall === 0 ? null : 'Du musst mitgehen, erhöhen oder aussteigen'
      case 'call':
        return toCall > 0 ? null : 'Es gibt nichts mitzugehen – du kannst schieben'
      case 'raise': {
        const allIn = state.bets[player]! + state.stacks[player]!
        if (!Number.isInteger(action.to)) return 'Ungültiger Betrag'
        if (action.to <= state.currentBet) return 'Das ist keine Erhöhung'
        if (action.to > allIn) return 'So viele Chips hast du nicht'
        if (action.to < minRaiseTo(state, player))
          return `Erhöhe auf mindestens ${minRaiseTo(state, player)}`
        return null
      }
    }
  },

  applyAction(state, player, action) {
    let next: HoldemState = {
      ...state,
      pending: state.pending.filter((p) => p !== player),
      events: [],
    }
    let amount = 0
    switch (action.type) {
      case 'fold':
        next = { ...next, folded: [...state.folded, player] }
        break
      case 'check':
        break
      case 'call':
        amount = Math.min(state.currentBet - state.bets[player]!, state.stacks[player]!)
        next = pay(next, player, amount)
        break
      case 'raise': {
        amount = action.to - state.bets[player]!
        next = pay(next, player, amount)
        const raise = action.to - state.currentBet
        const full = raise >= state.lastRaise
        // A full raise reopens the betting for everybody else who can still act.
        const others = canAct(next).filter((p) => p !== player)
        next = {
          ...next,
          currentBet: action.to,
          lastRaise: full ? raise : state.lastRaise,
          pending: full
            ? seatedFrom(state.order, others, nextIn(state.order, others, player))
            : [...new Set([...next.pending, ...others.filter((p) => next.bets[p]! < action.to)])],
        }
        break
      }
    }
    next = { ...next, events: [{ type: 'acted', player, action, amount }] }
    return advance(next, player)
  },

  playerView(state, player) {
    const toCall = Math.max(0, state.currentBet - (state.bets[player] ?? 0))
    return {
      order: state.order,
      seated: state.seated,
      stacks: state.stacks,
      button: state.button,
      hole: state.hole[player] ?? [],
      board: state.board,
      street: state.street,
      folded: state.folded,
      bets: state.bets,
      contributed: state.contributed,
      pot: potOf(state),
      currentBet: state.currentBet,
      lastRaise: state.lastRaise,
      toCall: Math.min(toCall, state.stacks[player] ?? 0),
      minRaiseTo: state.seated.includes(player) ? minRaiseTo(state, player) : 0,
      maxRaiseTo: (state.bets[player] ?? 0) + (state.stacks[player] ?? 0),
      turn: state.turn,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      handNumber: state.handNumber,
      phase: state.phase,
      bustedIn: state.bustedIn,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    // More chips first; eliminated players by how long they lasted.
    const ranking = [...state.order].sort(
      (a, b) =>
        state.stacks[b]! - state.stacks[a]! ||
        (state.bustedIn[b] ?? Infinity) - (state.bustedIn[a] ?? Infinity),
    )
    const best = state.stacks[ranking[0]!]!
    return {
      scores: state.stacks,
      winners: state.order.filter((p) => state.stacks[p] === best),
      ranking,
      scoreLabel: 'Chips',
    }
  },

  describeAction: (action) => (action.type === 'raise' ? `raise ${action.to}` : action.type),
})
