import {
  type AiAgent,
  type Card,
  createDeck,
  type Difficulty,
  nextPlayer,
  type PlayerId,
  type Rng,
  seedToState,
  type Suit,
} from '@/engine'
import {
  cardPoints,
  type MauMauAction,
  type MauMauEvent,
  mauMauRules,
  type MauMauState,
  type MauMauView,
} from './mauMau'

type Play = Extract<MauMauAction, { type: 'play' }>

const suitCounts = (cards: readonly Card[]) => {
  const counts: Record<Suit, number> = { clubs: 0, spades: 0, hearts: 0, diamonds: 0 }
  for (const card of cards) if (card.kind === 'suited' && card.rank !== 'J') counts[card.suit]++
  return counts
}

/**
 * Suits each player has shown they cannot serve: they drew instead of playing that suit and have
 * not played it since. Based only on public events, so the AI does not cheat.
 */
export function inferMissingSuits(log: readonly MauMauEvent[]): Map<PlayerId, Set<Suit>> {
  const missing = new Map<PlayerId, Set<Suit>>()
  const of = (player: PlayerId) =>
    missing.get(player) ?? missing.set(player, new Set()).get(player)!
  for (const event of log) {
    if (event.type === 'drew') {
      // A penalty brings unknown cards, so earlier conclusions are no longer safe.
      if (event.penalty) of(event.player).clear()
      else if (event.refused) of(event.player).add(event.refused)
    } else if (event.type === 'played' && event.card.kind === 'suited') {
      of(event.player).delete(event.card.suit)
    }
  }
  return missing
}

/**
 * Scores a play from the agent's point of view. Higher is better.
 * Intermediate: keep jacks, keep control of long suits, use 7/8 against short hands.
 * Expert additionally reads opponents' missing suits from the public log, uses an 8 for an extra
 * turn in two-player games, dumps expensive cards and changes suit against a player about to win.
 */
export function scorePlay(view: MauMauView, play: Play, expert: boolean, self: PlayerId): number {
  const card = view.hand.find((c) => c.id === play.cardId)
  if (!card || card.kind !== 'suited') return -Infinity
  const rest = view.hand.filter((c) => c.id !== card.id)
  const counts = suitCounts(rest)
  const next = nextPlayer(view.order, self, view.direction)
  const nextSize = view.handSizes[next] ?? 5
  const top = view.topCard
  let score = 0

  if (rest.length === 0) return 1000 // winning move
  if (view.pendingDraw > 0) score += 50 // answering a seven avoids drawing

  const isJack = card.rank === 'J'
  const resultingSuit = isJack ? play.wish! : card.suit
  if (isJack) {
    // Jacks are jokers: keep them unless they are the only way to get rid of cards.
    score -= rest.length > 2 ? 25 : 5
    score += counts[resultingSuit] * 4
    if (counts[resultingSuit] === 0) score -= 15
  } else {
    score += counts[card.suit] * 3
    if (card.rank === '7') score += nextSize <= 2 ? 15 : 4
    if (card.rank === '8') score += nextSize <= 2 ? 12 : 3
  }

  if (expert) {
    const missing = inferMissingSuits(view.log).get(next)
    if (missing?.has(resultingSuit)) score += isJack ? 18 : 12

    const skipsBackToMe = card.rank === '8' && view.options.eightSkips && view.order.length === 2
    if (skipsBackToMe) {
      const followUp = rest.some(
        (c) => c.kind === 'suited' && (c.suit === card.suit || c.rank === '8' || c.rank === 'J'),
      )
      score += followUp ? 10 : 2
    }

    score += cardPoints(card) * 0.4
    const changesSuit = top.kind === 'suited' && resultingSuit !== (view.wish ?? top.suit)
    if (nextSize === 1 && (changesSuit || card.rank === '7' || card.rank === '8')) score += 20
    // Keep one card of every suit we hold when the hand is small, so we can follow later.
    if (rest.length <= 3 && counts[card.suit] === 0 && !isJack) score -= 4
  }
  return score
}

/** Plays a random fitting card (or draws). Never draws on purpose, so it is beatable but fair. */
function createBeginnerAgent(): AiAgent<MauMauView, MauMauAction> {
  return {
    name: 'Mau-Mau Anfänger',
    chooseAction({ legalActions, rng }) {
      const plays = legalActions.filter((a) => a.type === 'play')
      return plays.length > 0 ? rng.pick(plays) : legalActions[0]!
    },
  }
}

/** Picks the best play by heuristic score (with some randomness), otherwise draws/passes. */
function heuristicChoice(
  view: MauMauView,
  legalActions: readonly MauMauAction[],
  rng: Rng,
  self: PlayerId,
  expertScoring: boolean,
  noise: number,
): MauMauAction {
  const plays = legalActions.filter((a): a is Play => a.type === 'play')
  if (plays.length === 0) return legalActions[0]!
  let best = plays[0]!
  let bestScore = -Infinity
  for (const play of plays) {
    const score = scorePlay(view, play, expertScoring, self) + rng.next() * noise
    if (score > bestScore) {
      best = play
      bestScore = score
    }
  }
  return best
}

function createIntermediateAgent(): AiAgent<MauMauView, MauMauAction> {
  return {
    name: 'Mau-Mau Fortgeschritten',
    chooseAction: ({ view, legalActions, rng, playerId }) =>
      heuristicChoice(view, legalActions, rng, playerId, false, 3),
  }
}

// --- Expert: determinized Monte-Carlo rollouts -------------------------------------------------

function playedSinceReshuffle(log: readonly MauMauEvent[]): Card[] {
  const cards: Card[] = []
  for (const event of log) {
    if (event.type === 'reshuffled') cards.length = 0
    else if (event.type === 'played') cards.push(event.card)
  }
  return cards
}

/**
 * One plausible full state consistent with what `self` knows: unknown cards are dealt randomly to
 * opponents (avoiding suits they have shown to be missing), the stock and the discard pile.
 */
export function determinize(view: MauMauView, self: PlayerId, rng: Rng): MauMauState {
  // Cards played since the last reshuffle are public: they lie in the discard pile.
  const discarded = playedSinceReshuffle(view.log).filter((c) => c.id !== view.topCard.id)
  const known = new Set([...view.hand, view.topCard, ...discarded].map((c) => c.id))
  const pool = rng.shuffle(createDeck('piquet32').filter((c) => !known.has(c.id)))
  const missing = inferMissingSuits(view.log)
  const hands: Record<PlayerId, Card[]> = { [self]: [...view.hand] }

  for (const player of view.order) {
    if (player === self) continue
    const size = view.handSizes[player] ?? 0
    const avoid = missing.get(player)
    const fits = (c: Card) => !(avoid && c.kind === 'suited' && c.rank !== 'J' && avoid.has(c.suit))
    const hand: Card[] = []
    for (let i = 0; i < pool.length && hand.length < size;) {
      if (fits(pool[i]!)) hand.push(...pool.splice(i, 1))
      else i++
    }
    while (hand.length < size && pool.length > 0) hand.push(pool.shift()!)
    hands[player] = hand
  }

  const stock = pool.slice(0, view.stockCount)
  const below = [...discarded, ...pool.slice(view.stockCount)]
  return {
    order: view.order,
    hands,
    stock,
    discard: [...below, view.topCard],
    turn: self,
    direction: view.direction,
    wish: view.wish,
    pendingDraw: view.pendingDraw,
    drawnCardId: view.drawnCardId,
    idleTurns: 0,
    winner: null,
    events: [],
    log: view.log,
    options: view.options,
    rng: seedToState(rng.nextUint32()),
  }
}

const MAX_ROLLOUT_MOVES = 400

/** Plays the game to the end with the heuristic policy. 1 = `self` wins, otherwise 0 … 0.5. */
function rollout(state: MauMauState, self: PlayerId, rng: Rng): number {
  let current = state
  for (let i = 0; i < MAX_ROLLOUT_MOVES && !mauMauRules.isTerminal(current); i++) {
    const player = current.turn
    const legal = mauMauRules.legalActions(current, player)
    const view = mauMauRules.playerView(current, player)
    const action = heuristicChoice(view, legal, rng, player, false, 3)
    current = mauMauRules.applyAction(current, player, action)
  }
  if (!mauMauRules.isTerminal(current)) return 0.25
  const result = mauMauRules.result(current)
  if (result.winners.includes(self)) return 1 / result.winners.length
  // Winning is what counts; few penalty points only break ties between losing moves.
  return 0.1 * (1 - Math.min(1, (result.scores[self] ?? 0) / 100))
}

export interface ExpertOptions {
  /** Total number of simulated games per decision, spread over the candidate moves. */
  readonly budget?: number
}

function createExpertAgent({ budget = 1200 }: ExpertOptions = {}): AiAgent<
  MauMauView,
  MauMauAction
> {
  return {
    name: 'Mau-Mau Experte',
    chooseAction({ view, legalActions, rng, playerId }) {
      if (legalActions.length === 1) return legalActions[0]!
      const perMove = Math.max(8, Math.floor(budget / legalActions.length))
      let best = legalActions[0]!
      let bestValue = -Infinity
      for (const action of legalActions) {
        let total = 0
        for (let i = 0; i < perMove; i++) {
          const world = determinize(view, playerId, rng)
          total += rollout(mauMauRules.applyAction(world, playerId, action), playerId, rng)
        }
        // Tiny heuristic tie-breaker so equal rollouts still prefer sensible moves.
        const tieBreak =
          action.type === 'play' ? scorePlay(view, action, true, playerId) / 10_000 : 0
        const value = total / perMove + tieBreak
        if (value > bestValue) {
          best = action
          bestValue = value
        }
      }
      return best
    },
  }
}

export function createMauMauAgent(
  difficulty: Difficulty,
  expertOptions?: ExpertOptions,
): AiAgent<MauMauView, MauMauAction> {
  if (difficulty === 'beginner') return createBeginnerAgent()
  if (difficulty === 'intermediate') return createIntermediateAgent()
  return createExpertAgent(expertOptions)
}
