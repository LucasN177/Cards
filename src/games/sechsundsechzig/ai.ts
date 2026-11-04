import type { AiAgent, Difficulty, SuitedCard } from '@/engine'
import {
  beats,
  cardPoints,
  type SechsundsechzigAction,
  type SechsundsechzigView,
  strength,
} from './sechsundsechzig'

type Play = Extract<SechsundsechzigAction, { type: 'play' }>

/** Cost of giving a card away: points plus extra for trumps. */
const cost = (card: SuitedCard, view: SechsundsechzigView) =>
  cardPoints(card) + (card.suit === view.trump ? 8 + strength(card) : 0)

export function createSechsundsechzigAgent(
  difficulty: Difficulty,
): AiAgent<SechsundsechzigView, SechsundsechzigAction> {
  return {
    name: `66 (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const hand = view.hand
      const plays = legalActions.filter((a): a is Play => a.type === 'play' && !a.meld)
      const melds = legalActions.filter((a): a is Play => a.type === 'play' && a.meld === true)
      const cardOf = (a: Play) => hand.find((c) => c.id === a.cardId)!
      const cheapest = (list: Play[]) =>
        [...list].sort((a, b) => cost(cardOf(a), view) - cost(cardOf(b), view))[0]!

      if (difficulty === 'beginner' && rng.next() < 0.4) {
        if (melds.length > 0) return melds[0]!
        return rng.pick(plays)
      }

      // Leading.
      if (view.trick.length === 0) {
        if (legalActions.some((a) => a.type === 'exchange')) return { type: 'exchange' }
        if (melds.length > 0) {
          // Announce the best marriage, playing the queen (the king is worth more).
          const best = [...melds].sort(
            (a, b) =>
              Number(cardOf(b).suit === view.trump) - Number(cardOf(a).suit === view.trump) ||
              strength(cardOf(a)) - strength(cardOf(b)),
          )[0]!
          return best
        }
        const trumps = hand.filter((c) => c.suit === view.trump)
        if (
          difficulty === 'expert' &&
          legalActions.some((a) => a.type === 'close') &&
          view.myPoints >= 40 &&
          trumps.filter((c) => strength(c) >= 4).length >= 2
        ) {
          return { type: 'close' }
        }
        if (view.strict) {
          // Pull trumps with high ones, then cash aces.
          const sureWinners = plays.filter((p) => {
            const c = cardOf(p)
            const higher = view.played.filter((x) => x.suit === c.suit && strength(x) > strength(c))
            const missing = 5 - strength(c) - higher.length
            return missing === 0 && (c.suit === view.trump || strength(c) === 5)
          })
          if (sureWinners.length > 0) return sureWinners[0]!
        }
        // Lead something cheap that is not a trump and not part of a marriage.
        const keep = (c: SuitedCard) =>
          c.suit === view.trump ||
          ((c.rank === 'K' || c.rank === 'Q') &&
            hand.some((h) => h.suit === c.suit && h.rank === (c.rank === 'K' ? 'Q' : 'K')))
        const free = plays.filter((p) => !keep(cardOf(p)))
        return cheapest(free.length > 0 ? free : plays)
      }

      // Following.
      const led = view.trick[0]!.card
      const winners = plays.filter((p) => beats(cardOf(p), led, view.trump))
      const worth = cardPoints(led)
      const needed = 66 - view.myPoints
      if (winners.length > 0) {
        const cheapestWinner = cheapest(winners)
        const c = cardOf(cheapestWinner)
        const spendsTrump = c.suit === view.trump && led.suit !== view.trump
        // Take valuable tricks, or any trick that wins the hand; avoid wasting trumps on nothing.
        if (worth >= 10 || cardPoints(c) + worth >= needed || !spendsTrump || view.strict)
          return cheapestWinner
        if (difficulty === 'expert' && worth >= 4 && view.stockCount <= 4) return cheapestWinner
      }
      return cheapest(plays)
    },
  }
}
