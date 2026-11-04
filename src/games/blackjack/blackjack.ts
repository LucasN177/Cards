/**
 * Blackjack against the dealer, played with chips over a number of rounds. Pure and
 * deterministic; see `BlackjackRules.tsx` for the rule text.
 */
import {
  createDeck,
  defineGame,
  type GameResult,
  type PlayerId,
  type Rank,
  RANKS,
  Rng,
  type RngState,
  type SuitedCard,
} from '@/engine'

// --- Types -------------------------------------------------------------------------------------

export interface BlackjackOptions {
  readonly decks: 1 | 6
  /** The dealer also draws on a soft 17 (ace counted as 11). */
  readonly dealerHitsSoft17: boolean
  /** Rounds to play; the game also ends early when you stop or run out of chips. */
  readonly rounds: 5 | 10 | 20
}

export const DEFAULT_BLACKJACK_OPTIONS: BlackjackOptions = {
  decks: 6,
  dealerHitsSoft17: false,
  rounds: 10,
}

export const STARTING_CHIPS = 100
export const BETS = [5, 10, 25] as const

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose'

export interface PlayerHand {
  readonly cards: readonly SuitedCard[]
  readonly bet: number
  readonly doubled: boolean
  /** No more cards for this hand (stood, busted, doubled or split aces). */
  readonly done: boolean
  readonly fromSplit: boolean
  readonly outcome: Outcome | null
  /** Chips won or lost on this hand once settled. */
  readonly payout: number
}

export type BlackjackAction =
  | { readonly type: 'bet'; readonly amount: number }
  | { readonly type: 'hit' }
  | { readonly type: 'stand' }
  | { readonly type: 'double' }
  | { readonly type: 'split' }
  | { readonly type: 'next' }
  | { readonly type: 'leave' }

export interface BlackjackState {
  readonly player: PlayerId
  readonly phase: 'betting' | 'playing' | 'settled' | 'over'
  /** Remaining cards; dealt from the end. */
  readonly shoe: readonly SuitedCard[]
  readonly shoeSize: number
  readonly reshuffled: boolean
  readonly chips: number
  readonly round: number
  readonly hands: readonly PlayerHand[]
  readonly active: number
  readonly dealer: readonly SuitedCard[]
  readonly options: BlackjackOptions
  readonly rng: RngState
  /** Statistics. */
  readonly stats: {
    readonly handsWon: number
    readonly handsLost: number
    readonly pushes: number
    readonly blackjacks: number
    readonly busts: number
  }
}

export interface BlackjackView {
  readonly phase: BlackjackState['phase']
  readonly chips: number
  readonly round: number
  readonly rounds: number
  readonly hands: readonly PlayerHand[]
  readonly active: number
  /** While you play, the dealer's second card stays face down. */
  readonly dealer: readonly (SuitedCard | null)[]
  readonly dealerValue: number | null
  readonly shoeCount: number
  readonly reshuffled: boolean
  readonly options: BlackjackOptions
  readonly hint: Move | null
}

export type Move = 'hit' | 'stand' | 'double' | 'split'

// --- Card values -------------------------------------------------------------------------------

export const cardValue = (rank: Rank) =>
  rank === 'A' ? 11 : rank === 'K' || rank === 'Q' || rank === 'J' ? 10 : Number(rank)

/** Best total and whether an ace still counts as 11 ("soft"). */
export function handValue(cards: readonly SuitedCard[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += cardValue(card.rank)
    if (card.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

export const isBlackjack = (cards: readonly SuitedCard[]) =>
  cards.length === 2 && handValue(cards).total === 21

const isBust = (cards: readonly SuitedCard[]) => handValue(cards).total > 21

// --- Shoe --------------------------------------------------------------------------------------

function freshShoe(decks: number, rng: Rng): SuitedCard[] {
  return rng.shuffle(createDeck({ ranks: RANKS, copies: decks }) as SuitedCard[])
}

/** Takes `count` cards from the shoe. */
function drawFrom(shoe: readonly SuitedCard[], count: number) {
  return { cards: shoe.slice(-count).reverse(), shoe: shoe.slice(0, -count) }
}

// --- Rules -------------------------------------------------------------------------------------

const activeHand = (state: BlackjackState) => state.hands[state.active]

export function canDouble(state: BlackjackState): boolean {
  const hand = activeHand(state)
  return (
    state.phase === 'playing' &&
    !!hand &&
    hand.cards.length === 2 &&
    !hand.done &&
    state.chips >= hand.bet
  )
}

export function canSplit(state: BlackjackState): boolean {
  const hand = activeHand(state)
  return (
    state.phase === 'playing' &&
    state.hands.length === 1 &&
    !!hand &&
    hand.cards.length === 2 &&
    cardValue(hand.cards[0]!.rank) === cardValue(hand.cards[1]!.rank) &&
    state.chips >= hand.bet
  )
}

/** Moves to the next unfinished hand, or lets the dealer play and settles the round. */
function advance(state: BlackjackState): BlackjackState {
  const next = state.hands.findIndex((h) => !h.done)
  if (next >= 0) return { ...state, active: next }
  return settle(dealerPlays(state))
}

function dealerPlays(state: BlackjackState): BlackjackState {
  // The dealer only draws if a player hand is still alive.
  if (state.hands.every((h) => isBust(h.cards))) return state
  let { dealer, shoe } = state
  for (;;) {
    const { total, soft } = handValue(dealer)
    const draws = total < 17 || (total === 17 && soft && state.options.dealerHitsSoft17)
    if (!draws) break
    const drawn = drawFrom(shoe, 1)
    dealer = [...dealer, ...drawn.cards]
    shoe = drawn.shoe
  }
  return { ...state, dealer, shoe }
}

function settle(state: BlackjackState): BlackjackState {
  const dealerTotal = handValue(state.dealer).total
  const dealerBlackjack = isBlackjack(state.dealer)
  let chips = state.chips
  let { handsWon, handsLost, pushes, blackjacks, busts } = state.stats
  const hands = state.hands.map((hand) => {
    const { total } = handValue(hand.cards)
    const natural = isBlackjack(hand.cards) && !hand.fromSplit
    let outcome: Outcome
    if (total > 21) outcome = 'lose'
    else if (natural && !dealerBlackjack) outcome = 'blackjack'
    else if (dealerBlackjack && !natural) outcome = 'lose'
    else if (natural && dealerBlackjack) outcome = 'push'
    else if (dealerTotal > 21 || total > dealerTotal) outcome = 'win'
    else if (total === dealerTotal) outcome = 'push'
    else outcome = 'lose'

    // The bet was already taken off the chips; give back stake plus winnings.
    const returned =
      outcome === 'blackjack'
        ? hand.bet * 2.5
        : outcome === 'win'
          ? hand.bet * 2
          : outcome === 'push'
            ? hand.bet
            : 0
    chips += returned
    if (total > 21) busts++
    if (outcome === 'blackjack') blackjacks++
    if (outcome === 'win' || outcome === 'blackjack') handsWon++
    else if (outcome === 'push') pushes++
    else handsLost++
    return { ...hand, done: true, outcome, payout: returned - hand.bet }
  })
  return {
    ...state,
    hands,
    chips,
    phase: 'settled',
    stats: { handsWon, handsLost, pushes, blackjacks, busts },
  }
}

function deal(state: BlackjackState, amount: number): BlackjackState {
  let { shoe, rng } = state
  let reshuffled = false
  // Reshuffle when less than a quarter of the shoe is left.
  if (shoe.length < state.shoeSize / 4) {
    const generator = new Rng(rng)
    shoe = freshShoe(state.options.decks, generator)
    rng = generator.state
    reshuffled = true
  }
  const first = drawFrom(shoe, 4)
  const [p1, d1, p2, d2] = first.cards as [SuitedCard, SuitedCard, SuitedCard, SuitedCard]
  const hand: PlayerHand = {
    cards: [p1, p2],
    bet: amount,
    doubled: false,
    done: false,
    fromSplit: false,
    outcome: null,
    payout: 0,
  }
  const dealt: BlackjackState = {
    ...state,
    phase: 'playing',
    shoe: first.shoe,
    rng,
    reshuffled,
    chips: state.chips - amount,
    round: state.round + 1,
    hands: [hand],
    active: 0,
    dealer: [d1, d2],
  }
  // Blackjack on either side ends the round immediately (the dealer checks the hole card).
  if (isBlackjack(hand.cards) || isBlackjack(dealt.dealer)) {
    return settle({ ...dealt, hands: [{ ...hand, done: true }] })
  }
  return dealt
}

// --- Basic strategy (for the hint) -------------------------------------------------------------

/**
 * Textbook basic strategy for several decks, dealer standing on soft 17. Close enough to be a
 * good teacher; it never suggests surrender or insurance (not offered here).
 */
export function basicStrategy(
  cards: readonly SuitedCard[],
  dealerUp: SuitedCard,
  options: { canDouble: boolean; canSplit: boolean },
): Move {
  const up = cardValue(dealerUp.rank)
  const { total, soft } = handValue(cards)
  const between = (a: number, b: number) => up >= a && up <= b

  const isPair = cards.length === 2 && cardValue(cards[0]!.rank) === cardValue(cards[1]!.rank)
  if (options.canSplit && isPair) {
    const pair = cardValue(cards[0]!.rank)
    if (pair === 11 || pair === 8) return 'split'
    if (pair === 9 && (between(2, 6) || up === 8 || up === 9)) return 'split'
    if (pair === 7 && between(2, 7)) return 'split'
    if (pair === 6 && between(2, 6)) return 'split'
    if (pair === 4 && between(5, 6)) return 'split'
    if ((pair === 2 || pair === 3) && between(2, 7)) return 'split'
  }
  const double = (fallback: Move): Move => (options.canDouble ? 'double' : fallback)
  if (soft && cards.length >= 2) {
    if (total >= 20) return 'stand'
    if (total === 19) return up === 6 ? double('stand') : 'stand'
    if (total === 18) return between(2, 6) ? double('stand') : up <= 8 ? 'stand' : 'hit'
    if (total === 17) return between(3, 6) ? double('hit') : 'hit'
    if (total >= 15) return between(4, 6) ? double('hit') : 'hit'
    return between(5, 6) ? double('hit') : 'hit'
  }
  if (total >= 17) return 'stand'
  if (total >= 13) return between(2, 6) ? 'stand' : 'hit'
  if (total === 12) return between(4, 6) ? 'stand' : 'hit'
  if (total === 11) return up === 11 ? 'hit' : double('hit')
  if (total === 10) return between(2, 9) ? double('hit') : 'hit'
  if (total === 9) return between(3, 6) ? double('hit') : 'hit'
  return 'hit'
}

// --- Game definition ---------------------------------------------------------------------------

export const blackjackGame = defineGame<
  BlackjackState,
  BlackjackAction,
  BlackjackOptions,
  BlackjackView
>({
  id: 'blackjack',
  name: 'Blackjack',
  players: { min: 1, max: 1 },
  defaultOptions: DEFAULT_BLACKJACK_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'rounds',
      label: 'Runden',
      description: `Du startest mit ${STARTING_CHIPS} Chips.`,
      choices: [
        { value: 5, label: '5' },
        { value: 10, label: '10' },
        { value: 20, label: '20' },
      ],
    },
    {
      type: 'choice',
      key: 'decks',
      label: 'Kartenspiele im Schlitten',
      choices: [
        { value: 6, label: 'Sechs' },
        { value: 1, label: 'Eins' },
      ],
    },
    {
      type: 'boolean',
      key: 'dealerHitsSoft17',
      label: 'Bank zieht auf weiche 17',
      description: 'Die Bank zieht auch bei 17 mit einem als 11 gezählten Ass (etwas schwerer).',
    },
  ],

  setup({ players, options, seed }) {
    const rng = Rng.fromSeed(seed)
    const shoe = freshShoe(options.decks, rng)
    return {
      player: players[0]!.id,
      phase: 'betting',
      shoe,
      shoeSize: shoe.length,
      reshuffled: false,
      chips: STARTING_CHIPS,
      round: 0,
      hands: [],
      active: 0,
      dealer: [],
      options,
      rng: rng.state,
      stats: { handsWon: 0, handsLost: 0, pushes: 0, blackjacks: 0, busts: 0 },
    }
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.player),

  legalActions(state) {
    switch (state.phase) {
      case 'betting':
        return [
          ...BETS.filter((b) => b <= state.chips).map((amount) => ({
            type: 'bet' as const,
            amount,
          })),
          { type: 'leave' as const },
        ]
      case 'playing': {
        const actions: BlackjackAction[] = [{ type: 'hit' }, { type: 'stand' }]
        if (canDouble(state)) actions.push({ type: 'double' })
        if (canSplit(state)) actions.push({ type: 'split' })
        return actions
      }
      case 'settled':
        return [{ type: 'next' }, { type: 'leave' }]
      default:
        return []
    }
  },

  applyAction(state, _player, action) {
    switch (action.type) {
      case 'leave':
        return { ...state, phase: 'over' }
      case 'bet':
        return deal(state, action.amount)
      case 'next': {
        const done = state.round >= state.options.rounds || state.chips < BETS[0]
        return done
          ? { ...state, phase: 'over' }
          : { ...state, phase: 'betting', hands: [], dealer: [] }
      }
      case 'stand':
        return advance({
          ...state,
          hands: state.hands.map((h, i) => (i === state.active ? { ...h, done: true } : h)),
        })
      case 'hit':
      case 'double': {
        const hand = activeHand(state)!
        const drawn = drawFrom(state.shoe, 1)
        const cards = [...hand.cards, ...drawn.cards]
        const doubling = action.type === 'double'
        const done = doubling || handValue(cards).total >= 21
        return advance({
          ...state,
          shoe: drawn.shoe,
          chips: doubling ? state.chips - hand.bet : state.chips,
          hands: state.hands.map((h, i) =>
            i === state.active
              ? { ...h, cards, done, doubled: doubling, bet: doubling ? h.bet * 2 : h.bet }
              : h,
          ),
        })
      }
      case 'split': {
        const hand = activeHand(state)!
        const drawn = drawFrom(state.shoe, 2)
        const aces = hand.cards[0]!.rank === 'A'
        const make = (first: SuitedCard, second: SuitedCard): PlayerHand => ({
          ...hand,
          cards: [first, second],
          fromSplit: true,
          // Split aces get one card each and no more.
          done: aces || handValue([first, second]).total === 21,
        })
        return advance({
          ...state,
          shoe: drawn.shoe,
          chips: state.chips - hand.bet,
          hands: [make(hand.cards[0]!, drawn.cards[0]!), make(hand.cards[1]!, drawn.cards[1]!)],
          active: 0,
        })
      }
    }
  },

  playerView(state) {
    const hiding = state.phase === 'playing'
    const hand = activeHand(state)
    return {
      phase: state.phase,
      chips: state.chips,
      round: state.round,
      rounds: state.options.rounds,
      hands: state.hands,
      active: state.active,
      dealer: state.dealer.map((card, i) => (hiding && i === 1 ? null : card)),
      dealerValue:
        state.dealer.length === 0
          ? null
          : handValue(hiding ? state.dealer.slice(0, 1) : state.dealer).total,
      shoeCount: state.shoe.length,
      reshuffled: state.reshuffled,
      options: state.options,
      hint:
        state.phase === 'playing' && hand && state.dealer[0]
          ? basicStrategy(hand.cards, state.dealer[0], {
              canDouble: canDouble(state),
              canSplit: canSplit(state),
            })
          : null,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    return {
      scores: { [state.player]: state.chips },
      winners: state.chips > STARTING_CHIPS ? [state.player] : [],
      scoreLabel: 'Chips',
    }
  },

  statFields: [
    { key: 'rounds', label: 'Runden' },
    { key: 'handsWon', label: 'Gewonnene Hände' },
    { key: 'blackjacks', label: 'Blackjacks' },
    { key: 'busts', label: 'Überkauft' },
    { key: 'net', label: 'Gewinn / Verlust' },
  ],

  summarize: ({ finalState }) => ({
    rounds: finalState.round,
    handsWon: finalState.stats.handsWon,
    blackjacks: finalState.stats.blackjacks,
    busts: finalState.stats.busts,
    net: finalState.chips - STARTING_CHIPS,
  }),
})
