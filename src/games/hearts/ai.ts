import {
  type AiAgent,
  type CardId,
  createDeck,
  type Difficulty,
  type PlayerId,
  type Rng,
  seedToState,
  type Suit,
  type SuitedCard,
} from '@/engine'
import {
  cardPenalty,
  type HeartsAction,
  heartsRules,
  type HeartsState,
  type HeartsView,
  highValue,
  isQueenOfSpades,
  trickPoints,
  trickWinner,
} from './hearts'

type Play = Extract<HeartsAction, { type: 'play' }>

const bySuit = (cards: readonly SuitedCard[], suit: Suit) => cards.filter((c) => c.suit === suit)

// --- Passing -----------------------------------------------------------------------------------

/** Three cards to pass: the queen and high spades, high hearts, and high cards of short suits. */
export function choosePass(hand: readonly SuitedCard[]): CardId[] {
  const lowSpades = hand.filter((c) => c.suit === 'spades' && highValue(c) < 12).length
  const score = (card: SuitedCard) => {
    const value = highValue(card)
    if (isQueenOfSpades(card)) return lowSpades >= 4 ? 10 : 100
    if (card.suit === 'spades' && value > 12) return lowSpades >= 4 ? 5 : 80
    if (card.suit === 'hearts') return 20 + value * 2
    // Getting rid of a short suit creates a void, so later hearts can be dumped.
    const short = bySuit(hand, card.suit).length <= 3 ? 15 : 0
    return value + short
  }
  return [...hand]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((c) => c.id)
}

// --- Playing -----------------------------------------------------------------------------------

/**
 * Heuristic card choice: lead low and safe, stay below the current winner, take a pointless trick
 * with a high card when last, and dump the queen of spades and high hearts when void.
 */
export function heuristicPlay(view: HeartsView, plays: readonly Play[]): Play {
  const cards = plays.map((p) => view.hand.find((c) => c.id === p.cardId)!)
  const queenOut = view.played.some(isQueenOfSpades)
  const holdQueen = view.hand.some(isQueenOfSpades)

  const pick = (score: (card: SuitedCard) => number) => {
    let best = 0
    for (let i = 1; i < cards.length; i++) if (score(cards[i]!) > score(cards[best]!)) best = i
    return plays[best]!
  }

  if (view.trick.length === 0) {
    return pick((card) => {
      let score = -highValue(card)
      if (isQueenOfSpades(card)) score -= 60
      if (card.suit === 'hearts') score -= 8
      // Lead low spades to flush out the queen if somebody else holds it.
      if (card.suit === 'spades' && !queenOut && !holdQueen && highValue(card) < 12) score += 6
      if (card.suit === 'spades' && !queenOut && highValue(card) > 12) score -= 30
      return score
    })
  }

  const led = view.trick[0]!.card.suit
  const following = cards[0]!.suit === led
  const winning = view.trick
    .filter((t) => t.card.suit === led)
    .reduce((best, t) => (highValue(t.card) > highValue(best.card) ? t : best))
  const pointsOnTable = trickPoints(
    view.trick.map((t) => t.card),
    view.options.deck,
  )
  const last = view.trick.length === view.order.length - 1

  if (!following) {
    // Void: dump the worst cards.
    return pick((card) => {
      if (isQueenOfSpades(card)) return 200
      if (card.suit === 'hearts') return 50 + highValue(card)
      if (card.suit === 'spades' && highValue(card) > 12 && !queenOut) return 45
      return highValue(card)
    })
  }

  const below = cards.filter((c) => highValue(c) < highValue(winning.card))
  if (below.length > 0) {
    // Stay below the winner, as high as possible (keeps low cards for later).
    // Exception: the queen goes on a trick already won by the king or ace of spades.
    return pick((card) => {
      if (isQueenOfSpades(card)) return highValue(winning.card) > 12 ? 300 : -100
      return highValue(card) < highValue(winning.card) ? 100 + highValue(card) : -highValue(card)
    })
  }
  // Every card wins: take a clean trick with the highest card when last, otherwise the lowest.
  return pick((card) => {
    if (isQueenOfSpades(card)) return -200
    const value = highValue(card)
    return last && pointsOnTable === 0 ? value : -value
  })
}

function createBeginnerAgent(): AiAgent<HeartsView, HeartsAction> {
  return {
    name: 'Hearts Anfänger',
    chooseAction({ view, legalActions, rng }) {
      if (view.phase === 'passing') {
        return {
          type: 'pass',
          cardIds: rng
            .shuffle(view.hand)
            .slice(0, 3)
            .map((c) => c.id),
        }
      }
      return rng.pick(legalActions)
    },
  }
}

function createIntermediateAgent(): AiAgent<HeartsView, HeartsAction> {
  return {
    name: 'Hearts Fortgeschritten',
    chooseAction({ view, legalActions }) {
      if (view.phase === 'passing') return { type: 'pass', cardIds: choosePass(view.hand) }
      return heuristicPlay(view, legalActions as Play[])
    },
  }
}

// --- Expert: determinized rollouts -------------------------------------------------------------

/**
 * One plausible full state consistent with what `self` knows: unseen cards are dealt to the
 * opponents respecting hand sizes, shown voids and the cards `self` passed to somebody.
 */
export function determinize(view: HeartsView, self: PlayerId, rng: Rng): HeartsState {
  const known = new Set([...view.hand, ...view.played].map((c) => c.id))
  const hands: Record<PlayerId, SuitedCard[]> = { [self]: [...view.hand] }
  for (const p of view.order) if (p !== self) hands[p] = []

  // Cards we passed are with their receiver unless already played.
  if (view.passedTo) {
    for (const card of view.passedTo.cards) {
      if (!known.has(card.id)) {
        hands[view.passedTo.player]!.push(card)
        known.add(card.id)
      }
    }
  }
  const unseen = rng.shuffle(
    (createDeck(view.options.deck) as SuitedCard[]).filter((c) => !known.has(c.id)),
  )
  const opponents = view.order.filter((p) => p !== self)
  // With three or five players some unseen cards lie face down in the pot.
  const pot: SuitedCard[] = []
  for (const card of unseen) {
    const candidates = opponents.filter(
      (p) => hands[p]!.length < view.handSizes[p]! && !view.voids[p]!.includes(card.suit),
    )
    if (candidates.length === 0 && pot.length < view.potSize) {
      pot.push(card)
      continue
    }
    const fallback = opponents.filter((p) => hands[p]!.length < view.handSizes[p]!)
    const target = (candidates.length ? candidates : fallback)[0]
    if (target) hands[target]!.push(card)
    else pot.push(card)
  }

  const taken: Record<PlayerId, SuitedCard[]> = Object.fromEntries(view.order.map((p) => [p, []]))
  for (const trick of view.handTricks) taken[trickWinner(trick)]!.push(...trick.map((t) => t.card))

  return {
    order: view.order,
    hands,
    pot,
    phase: 'playing',
    handNumber: view.handNumber,
    passes: Object.fromEntries(view.order.map((p) => [p, null])),
    received: Object.fromEntries(view.order.map((p) => [p, []])),
    trick: view.trick,
    lastTrick: view.lastTrick,
    turn: self,
    tricksPlayed: view.tricksPlayed,
    handTricks: view.handTricks,
    taken,
    scores: view.scores,
    handResults: view.handResults,
    moons: Object.fromEntries(view.order.map((p) => [p, 0])),
    events: [],
    // A single hand is enough to judge a card; no new hand is dealt in the rollout.
    options: { ...view.options, targetScore: 0 },
    rng: seedToState(rng.nextUint32()),
  }
}

/** Plays the rest of the hand with the heuristic; returns the points `self` gets for it. */
function rollout(state: HeartsState, self: PlayerId): number {
  let current = state
  const hands = current.handResults.length
  for (let i = 0; i < 60 && current.handResults.length === hands; i++) {
    const player = current.turn
    const view = heartsRules.playerView(current, player)
    const plays = heartsRules.legalActions(current, player) as Play[]
    current = heartsRules.applyAction(current, player, heuristicPlay(view, plays))
  }
  return (
    current.handResults.at(-1)?.[self] ??
    trickPoints(current.taken[self] ?? [], current.options.deck)
  )
}

function createExpertAgent(budget = 480): AiAgent<HeartsView, HeartsAction> {
  return {
    name: 'Hearts Experte',
    chooseAction({ view, legalActions, rng, playerId }) {
      if (view.phase === 'passing') return { type: 'pass', cardIds: choosePass(view.hand) }
      const plays = legalActions as Play[]
      if (plays.length === 1) return plays[0]!
      const perMove = Math.max(12, Math.floor(budget / plays.length))
      let best = plays[0]!
      let bestPoints = Infinity
      for (const play of plays) {
        let total = 0
        for (let i = 0; i < perMove; i++) {
          const world = determinize(view, playerId, rng)
          total += rollout(heartsRules.applyAction(world, playerId, play), playerId)
        }
        // Tie-break towards the cheaper card in penalty terms.
        const card = view.hand.find((c) => c.id === play.cardId)!
        const average = total / perMove + cardPenalty(card, view.options.deck) / 1000
        if (average < bestPoints) {
          best = play
          bestPoints = average
        }
      }
      return best
    },
  }
}

export function createHeartsAgent(difficulty: Difficulty): AiAgent<HeartsView, HeartsAction> {
  if (difficulty === 'beginner') return createBeginnerAgent()
  if (difficulty === 'intermediate') return createIntermediateAgent()
  return createExpertAgent()
}
