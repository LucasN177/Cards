import { type AiAgent, type Difficulty, type SuitedCard, SUITS } from '@/engine'
import { cardValue, handValue, type SchwimmenAction, type SchwimmenView } from './schwimmen'

/** Hand and middle after a move (pass/knock change nothing). */
export function afterAction(view: SchwimmenView, action: SchwimmenAction) {
  if (action.type === 'swapAll') return { hand: view.middle, middle: view.hand }
  if (action.type !== 'swap') return { hand: view.hand, middle: view.middle }
  const gave = view.hand.find((c) => c.id === action.handCardId)!
  const took = view.middle.find((c) => c.id === action.middleCardId)!
  return {
    hand: view.hand.map((c) => (c === gave ? took : c)),
    middle: view.middle.map((c) => (c === took ? gave : c)),
  }
}

/** How promising a hand is beyond its value: two strong cards of one suit can still grow. */
function potential(cards: readonly SuitedCard[]) {
  let best = 0
  for (const suit of SUITS) {
    const same = cards.filter((c) => c.suit === suit)
    if (same.length >= 2)
      best = Math.max(best, same.length * 2 + same.reduce((s, c) => s + cardValue(c.rank), 0) / 10)
  }
  return best
}

/** Knocking threshold: experts close earlier when few opponents are left. */
function knockAt(difficulty: Difficulty, players: number) {
  if (difficulty === 'beginner') return 28
  if (difficulty === 'intermediate') return 26
  return players <= 3 ? 25 : 27
}

export function createSchwimmenAgent(
  difficulty: Difficulty,
): AiAgent<SchwimmenView, SchwimmenAction> {
  return {
    name: `Schwimmen (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const current = view.handValue
      const swaps = legalActions.filter((a) => a.type === 'swap' || a.type === 'swapAll')
      const score = (action: SchwimmenAction) => {
        const { hand, middle } = afterAction(view, action)
        let value = handValue(hand) + potential(hand) * 0.3
        // Experts avoid handing the next player a strong middle.
        if (difficulty === 'expert') value -= handValue(middle) * 0.12
        return value
      }

      if (difficulty === 'beginner' && rng.next() < 0.25)
        return rng.pick(legalActions.filter((a) => a.type !== 'knock'))

      let best: SchwimmenAction | null = null
      let bestScore = score({ type: 'pass' }) + (difficulty === 'expert' ? 0.4 : 0.2)
      for (const action of swaps) {
        const s = score(action) + rng.next() * (difficulty === 'beginner' ? 2 : 0.2)
        if (s > bestScore) {
          best = action
          bestScore = s
        }
      }
      const canKnock = legalActions.some((a) => a.type === 'knock')
      const threshold = knockAt(difficulty, view.alive.length)
      if (best) {
        const improved = handValue(afterAction(view, best).hand)
        if (improved > current) return best
      }
      if (canKnock && current >= threshold) return { type: 'knock' }
      return best ?? { type: 'pass' }
    },
  }
}
