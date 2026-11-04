import type { AiAgent, Difficulty, SuitedCard } from '@/engine'
import {
  highValue,
  partnerOf,
  type SpadesAction,
  type SpadesView,
  teamMembers,
  teamOf,
  trickWinner,
} from './spades'

type Play = Extract<SpadesAction, { type: 'play' }>

/** Expected tricks of a hand: high cards in side suits, plus spades by strength and length. */
export function estimateTricks(hand: readonly SuitedCard[]): number {
  let tricks = 0
  const spades = hand.filter((c) => c.suit === 'spades')
  for (const suit of ['clubs', 'diamonds', 'hearts'] as const) {
    const cards = hand.filter((c) => c.suit === suit)
    if (cards.some((c) => c.rank === 'A')) tricks += cards.length <= 5 ? 1 : 0.7
    if (cards.some((c) => c.rank === 'K') && cards.length >= 2 && cards.length <= 4) tricks += 0.7
    if (cards.some((c) => c.rank === 'Q') && cards.length >= 3 && cards.length <= 4) tricks += 0.3
    // Short side suits let spades ruff.
    if (spades.length >= 3) tricks += cards.length === 0 ? 0.8 : cards.length === 1 ? 0.4 : 0
  }
  for (const card of spades) {
    const v = highValue(card)
    if (v === 14) tricks += 1
    else if (v === 13) tricks += spades.length >= 2 ? 0.9 : 0.4
    else if (v === 12) tricks += spades.length >= 3 ? 0.7 : 0.2
  }
  tricks += Math.max(0, spades.length - 3) * 0.8
  return tricks
}

function chooseBid(view: SpadesView, difficulty: Difficulty, noise: number): number {
  const estimate = estimateTricks(view.hand)
  const spades = view.hand.filter((c) => c.suit === 'spades')
  const high = view.hand.filter((c) => highValue(c) >= 13).length
  if (
    view.options.nil &&
    difficulty !== 'beginner' &&
    estimate < 1.2 &&
    high === 0 &&
    spades.length <= 3 &&
    // Never both partners on nil.
    view.bids[partnerOf(view.order, view.turn)] !== 0
  ) {
    return 0
  }
  const bid = Math.round(estimate + (difficulty === 'beginner' ? noise * 2 - 1 : 0))
  return Math.min(13, Math.max(1, bid))
}

/** Tricks the team still wants: below its bid it tries to win, above it ducks to avoid bags. */
function teamNeedsTricks(view: SpadesView, player: string) {
  const team = teamOf(view.order, player)
  const members = teamMembers(view.order, team).filter((p) => view.bids[p] !== 0)
  const bid = members.reduce((s, p) => s + (view.bids[p] ?? 0), 0)
  const got = members.reduce((s, p) => s + view.tricks[p]!, 0)
  return got < bid
}

function choosePlay(view: SpadesView, plays: readonly Play[], difficulty: Difficulty): Play {
  const me = view.turn
  const partner = partnerOf(view.order, me)
  const cards = plays.map((p) => view.hand.find((c) => c.id === p.cardId)!)
  const asPlay = (card: SuitedCard) => plays[cards.indexOf(card)]!
  const lowest = (list: SuitedCard[]) =>
    [...list].sort(
      (a, b) =>
        Number(a.suit === 'spades') - Number(b.suit === 'spades') || highValue(a) - highValue(b),
    )[0]!
  const highest = (list: SuitedCard[]) =>
    [...list].sort(
      (a, b) =>
        Number(b.suit === 'spades') - Number(a.suit === 'spades') || highValue(b) - highValue(a),
    )[0]!
  const wins = (card: SuitedCard) => trickWinner([...view.trick, { player: me, card }]) === me
  const winners = cards.filter(wins)
  const losers = cards.filter((c) => !wins(c))

  const myNil = view.bids[me] === 0 && view.tricks[me] === 0
  const partnerNil = view.bids[partner] === 0 && view.tricks[partner] === 0
  const wantTricks = difficulty === 'expert' ? teamNeedsTricks(view, me) : true

  // Protecting my own nil: play the highest card that still loses.
  if (myNil) return asPlay(losers.length > 0 ? highest(losers) : lowest(cards))

  if (view.trick.length === 0) {
    // Lead: an ace of a side suit, otherwise something low (a spade only when needed).
    const aces = cards.filter((c) => c.suit !== 'spades' && c.rank === 'A')
    if (wantTricks && aces.length > 0 && !partnerNil) return asPlay(aces[0]!)
    if (partnerNil) return asPlay(highest(cards))
    return asPlay(lowest(cards))
  }

  const currentWinner = trickWinner(view.trick)
  const partnerWinning = currentWinner === partner
  // Cover a partner on nil whenever possible.
  if (partnerNil && partnerWinning && winners.length > 0) return asPlay(lowest(winners))
  if (partnerWinning && !partnerNil) return asPlay(lowest(losers.length > 0 ? losers : cards))
  if (wantTricks && winners.length > 0) {
    // The cheapest card that wins.
    return asPlay(lowest(winners))
  }
  return asPlay(losers.length > 0 ? (wantTricks ? lowest(losers) : highest(losers)) : lowest(cards))
}

export function createSpadesAgent(difficulty: Difficulty): AiAgent<SpadesView, SpadesAction> {
  return {
    name: `Spades (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      if (view.phase === 'bidding') {
        const bid = chooseBid(view, difficulty, rng.next())
        return (
          legalActions.find((a) => a.type === 'bid' && a.tricks === bid) ??
          legalActions.find((a) => a.type === 'bid' && a.tricks === 1)!
        )
      }
      const plays = legalActions.filter((a): a is Play => a.type === 'play')
      if (difficulty === 'beginner' && rng.next() < 0.4) return rng.pick(plays)
      return choosePlay(view, plays, difficulty)
    },
  }
}
