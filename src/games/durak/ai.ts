import type { AiAgent, Difficulty, SuitedCard } from '@/engine'
import { type DurakAction, type DurakView, strength } from './durak'

/** How much a card is worth keeping: trumps count a lot more than the rest. */
function value(card: SuitedCard, view: DurakView) {
  return strength(card) + (card.suit === view.trumpCard.suit ? 10 : 0)
}

export function createDurakAgent(difficulty: Difficulty): AiAgent<DurakView, DurakAction> {
  return {
    name: `Durak (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const hand = view.hand
      const cardOf = (a: DurakAction) =>
        a.type === 'attack' || a.type === 'defend' ? hand.find((c) => c.id === a.cardId)! : null
      const cheapest = (actions: DurakAction[]) =>
        [...actions].sort((a, b) => value(cardOf(a)!, view) - value(cardOf(b)!, view))[0]
      const endgame = view.stockCount === 0

      if (difficulty === 'beginner') {
        const plays = legalActions.filter((a) => a.type === 'attack' || a.type === 'defend')
        if (plays.length > 0 && rng.next() < 0.8) return rng.pick(plays)
        return (
          legalActions.find((a) => a.type === 'take' || a.type === 'done') ?? rng.pick(legalActions)
        )
      }

      if (view.phase === 'defend') {
        const defenses = legalActions.filter((a) => a.type === 'defend')
        const best = cheapest(defenses)
        if (!best) return { type: 'take' }
        const card = cardOf(best)!
        // Taking a few low cards early can be better than spending a high trump.
        if (
          difficulty === 'expert' &&
          !endgame &&
          card.suit === view.trumpCard.suit &&
          strength(card) >= 5 &&
          view.table.length === 1 &&
          view.stockCount > 6
        ) {
          return { type: 'take' }
        }
        return best
      }

      const attacks = legalActions.filter((a) => a.type === 'attack')
      if (attacks.length === 0) return { type: 'done' }
      const leading = view.table.length === 0
      if (leading) {
        // Lead the weakest card; experts prefer ranks they hold twice.
        if (difficulty === 'expert') {
          const counts = new Map<string, number>()
          for (const c of hand)
            if (c.suit !== view.trumpCard.suit) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1)
          const pair = attacks
            .filter((a) => (counts.get(cardOf(a)!.rank) ?? 0) >= 2)
            .sort((a, b) => value(cardOf(a)!, view) - value(cardOf(b)!, view))[0]
          if (pair && strength(cardOf(pair)!) <= 4) return pair
        }
        return cheapest(attacks)!
      }
      // Adding cards: only cheap ones unless the deck is gone.
      const add = cheapest(attacks)!
      const card = cardOf(add)!
      const limit = difficulty === 'expert' ? 6 : 8
      if (!endgame && (card.suit === view.trumpCard.suit || strength(card) > limit - 2))
        return { type: 'done' }
      if (!endgame && value(card, view) > limit) return { type: 'done' }
      return add
    },
  }
}
