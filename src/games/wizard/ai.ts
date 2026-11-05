import {
  type AiAgent,
  type Card,
  type Difficulty,
  isJester,
  isWizard,
  SUITS,
  type Suit,
  type SuitedCard,
} from '@/engine'
import { allowedBids, highValue, trickWinner, type WizardAction, type WizardView } from './wizard'

/** Expected tricks: wizards, high trumps, long trump suits and side aces. */
export function estimateTricks(hand: readonly Card[], trump: Suit | null, players: number): number {
  let tricks = 0
  const plain = hand.filter((c): c is SuitedCard => c.kind === 'suited')
  const trumps = plain.filter((c) => c.suit === trump)
  for (const c of hand) if (isWizard(c)) tricks += 0.95
  for (const c of trumps) {
    const v = highValue(c)
    if (v >= 13) tricks += 0.85
    else if (v >= 11) tricks += 0.55
    else if (trumps.length >= 3) tricks += 0.35
  }
  const crowd = players >= 5 ? 0.75 : 1
  for (const c of plain) {
    if (c.suit === trump) continue
    const v = highValue(c)
    if (v === 14) tricks += 0.75 * crowd
    else if (v === 13) tricks += 0.35 * crowd
  }
  return tricks
}

/** The suit the dealer picks after a wizard is turned up: the strongest one in hand. */
export function bestSuit(hand: readonly Card[]): Suit {
  const plain = hand.filter((c): c is SuitedCard => c.kind === 'suited')
  return [...SUITS].sort(
    (a, b) =>
      plain.filter((c) => c.suit === b).reduce((s, c) => s + highValue(c), 0) -
      plain.filter((c) => c.suit === a).reduce((s, c) => s + highValue(c), 0),
  )[0]!
}

export function createWizardAgent(difficulty: Difficulty): AiAgent<WizardView, WizardAction> {
  return {
    name: `Wizard (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const me = view.turn
      const hand = view.hand

      if (view.phase === 'chooseTrump') return { type: 'chooseTrump', suit: bestSuit(hand) }

      if (view.phase === 'bidding') {
        let estimate = estimateTricks(hand, view.trump, view.order.length)
        if (difficulty === 'beginner') estimate += rng.next() * 1.6 - 0.8
        const allowed = allowedBids(view, me)
        const target = Math.round(estimate)
        const bid = [...allowed].sort(
          (a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b,
        )[0]!
        return { type: 'bid', tricks: bid }
      }

      const plays = legalActions.flatMap((a) => (a.type === 'play' ? [a] : []))
      if (difficulty === 'beginner' && rng.next() < 0.35) return rng.pick(plays)
      const cards = plays.map((p) => hand.find((c) => c.id === p.cardId)!)
      const asPlay = (c: Card) => plays[cards.indexOf(c)]!
      const value = (c: Card) =>
        isWizard(c)
          ? 1000
          : isJester(c)
            ? -1
            : (c as SuitedCard).suit === view.trump
              ? 100 + highValue(c as SuitedCard)
              : highValue(c as SuitedCard)
      const lowest = (list: Card[]) => [...list].sort((a, b) => value(a) - value(b))[0]!
      const highest = (list: Card[]) => [...list].sort((a, b) => value(b) - value(a))[0]!

      const need = view.bids[me]! - view.tricks[me]!
      const wins = (c: Card) =>
        trickWinner([...view.trick, { player: me, card: c }], view.trump) === me
      const lastToPlay = view.trick.length === view.order.length - 1

      if (view.trick.length === 0) {
        // Leading: with tricks to make, cash a strong card; otherwise lead low to stay out.
        if (need > 0) {
          const strong = cards.filter((c) => value(c) >= 113 || isWizard(c))
          if (strong.length > 0)
            return asPlay(difficulty === 'expert' ? lowest(strong) : highest(strong))
          const plainCards = cards.filter((c) => !isWizard(c))
          return asPlay(highest(plainCards.length > 0 ? plainCards : cards))
        }
        const jesters = cards.filter(isJester)
        if (jesters.length > 0) return asPlay(jesters[0]!)
        return asPlay(lowest(cards))
      }

      const winners = cards.filter(wins)
      const losers = cards.filter((c) => !wins(c))
      if (need > 0 && winners.length > 0) {
        // The cheapest card that wins – a wizard only when nothing else does or it is safe.
        const plain = winners.filter((c) => !isWizard(c))
        if (
          plain.length > 0 &&
          (lastToPlay || difficulty !== 'expert' || value(lowest(plain)) >= 112)
        )
          return asPlay(lowest(plain))
        return asPlay(lowest(winners))
      }
      // Avoid the trick: throw the highest card that still loses (keeps low cards for later).
      if (losers.length > 0) return asPlay(need > 0 ? lowest(losers) : highest(losers))
      return asPlay(lowest(cards))
    },
  }
}
