import type { AiAgent, Difficulty, SuitedCard } from '@/engine'
import { groupByRank, type PresidentAction, type PresidentView, strength } from './president'

const HIGH = strength({ rank: '2' } as SuitedCard)

export function createPresidentAgent(
  difficulty: Difficulty,
): AiAgent<PresidentView, PresidentAction> {
  return {
    name: `President (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const hand = view.hand
      if (view.phase === 'exchange') {
        // Give back the weakest cards.
        const count = view.gift?.count ?? 0
        return { type: 'give', cardIds: hand.slice(0, count).map((c) => c.id) }
      }
      const plays = legalActions.filter((a) => a.type === 'play')
      const canPass = legalActions.some((a) => a.type === 'pass')
      if (plays.length === 0) return { type: 'pass' }
      if (difficulty === 'beginner') {
        if (canPass && rng.next() < 0.2) return { type: 'pass' }
        return rng.pick(plays)
      }

      const groups = groupByRank(hand)
      const groupSize = (rank: string) => groups.find((g) => g[0]!.rank === rank)?.length ?? 0
      const cardsOf = (a: PresidentAction) =>
        a.type === 'pass' ? [] : a.cardIds.map((id) => hand.find((c) => c.id === id)!)
      const rated = plays.map((action) => {
        const cards = cardsOf(action)
        const s = strength(cards[0]!)
        const breaks = groupSize(cards[0]!.rank) > cards.length
        return { action, s, size: cards.length, breaks }
      })

      // Could finish (or nearly): play the play that empties the most cards first.
      const finishing = rated.find((r) => r.size === hand.length)
      if (finishing) return finishing.action

      if (!canPass) {
        // Leading: get rid of the weakest whole group; experts keep 2s back while they can.
        const leads = rated.filter((r) => !r.breaks && (difficulty !== 'expert' || r.s < HIGH))
        const pool = leads.length > 0 ? leads : rated.filter((r) => !r.breaks)
        const pick = (pool.length > 0 ? pool : rated).sort((a, b) => a.s - b.s || b.size - a.size)
        return pick[0]!.action
      }

      // Following: the weakest play that does not break a group.
      const whole = rated.filter((r) => !r.breaks).sort((a, b) => a.s - b.s)
      const candidate =
        whole[0] ?? (difficulty === 'intermediate' ? rated.sort((a, b) => a.s - b.s)[0] : undefined)
      if (!candidate) return { type: 'pass' }
      // Save the strongest cards for later while the hand is still big.
      const saveHigh = difficulty === 'expert' ? HIGH - 1 : HIGH
      if (candidate.s >= saveHigh && hand.length > 5 && rng.next() < 0.7) return { type: 'pass' }
      return candidate.action
    },
  }
}
