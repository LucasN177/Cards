import type { AiAgent, Difficulty, PlayerId, Rng, SuitedCard } from '@/engine'
import { canBigGin, deadwoodAfter, type GinAction, type GinView } from './gin'
import { bestArrangement, cardValue, rankNumber } from './melds'

type Discard = Extract<GinAction, { type: 'discard' }>

const SUITS = ['clubs', 'diamonds', 'spades', 'hearts'] as const
const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** Whether two cards could end up in one meld: same rank, or same suit and at most two apart. */
const related = (a: SuitedCard, b: SuitedCard) =>
  a !== b &&
  (a.rank === b.rank || (a.suit === b.suit && Math.abs(rankNumber(a) - rankNumber(b)) <= 2))

/** Card counting: whether a card (rank 1–13) is still unseen – in the stock or the other hand. */
function liveCounter(view: GinView) {
  const seen = new Set([...view.hand, ...view.discardPile].map((c) => c.rank + c.suit))
  return (rank: number, suit: SuitedCard['suit']) =>
    rank >= 1 && rank <= 13 && !seen.has(RANK_NAMES[rank - 1]! + suit) ? 1 : 0
}

/**
 * How promising a deadwood card is: pairs and near-runs. With card counting (expert) only the
 * cards that would complete them and are still unseen count.
 */
function potential(
  card: SuitedCard,
  deadwood: readonly SuitedCard[],
  live: ReturnType<typeof liveCounter> | null,
) {
  let p = 0
  const n = rankNumber(card)
  for (const other of deadwood) {
    if (other === card) continue
    if (other.rank === card.rank) {
      const outs = SUITS.filter((s) => s !== card.suit && s !== other.suit)
      p += live ? 1.5 * outs.reduce((sum, s) => sum + live(n, s), 0) : 3
    } else if (other.suit === card.suit) {
      const lo = Math.min(n, rankNumber(other))
      const hi = Math.max(n, rankNumber(other))
      if (hi - lo === 1) p += live ? 1.5 * (live(lo - 1, card.suit) + live(hi + 1, card.suit)) : 3
      else if (hi - lo === 2) p += live ? 1.5 * live(lo + 1, card.suit) : 1.5
    }
  }
  return p
}

/**
 * Expert: how much a discard would help the opponent. Cards next to what they took from the
 * pile are risky; ranks and neighbours they threw away themselves are safer.
 */
function danger(card: SuitedCard, view: GinView, opponent: PlayerId) {
  let d = 0
  for (const picked of view.pickups[opponent] ?? []) if (related(card, picked)) d += 4
  for (const thrown of view.thrown[opponent] ?? []) {
    if (thrown.rank === card.rank) d -= 1
    else if (thrown.suit === card.suit && Math.abs(rankNumber(thrown) - rankNumber(card)) === 1)
      d -= 0.5
  }
  return d
}

/** Discards, best first: least deadwood left, minus what promising deadwood is worth. */
function rankDiscards(view: GinView, difficulty: Difficulty, self: PlayerId): Discard[] {
  const hand = view.hand
  const opponent = view.order.find((p) => p !== self)!
  const live = difficulty === 'expert' ? liveCounter(view) : null
  return hand
    .filter((c) => c.id !== view.takenDiscard)
    .map((card) => {
      const { value, deadwood } = bestArrangement(hand.filter((c) => c !== card))
      const promise = deadwood.reduce((s, c) => s + potential(c, deadwood, live), 0)
      return { card, score: value - 0.6 * promise + (live ? danger(card, view, opponent) : 0) }
    })
    .sort((a, b) => a.score - b.score)
    .map(({ card }) => ({ type: 'discard', cardId: card.id }))
}

/** Taking `card` from the pile is worth it when it ends up in a meld and lowers the deadwood. */
function wantsDiscard(view: GinView, card: SuitedCard, difficulty: Difficulty, rng: Rng) {
  // Beginners overlook half of the good pick-ups.
  if (difficulty === 'beginner' && rng.next() < 0.5) return false
  const withCard = [...view.hand, card]
  if (!bestArrangement(withCard).melds.some((m) => m.cards.includes(card))) return false
  const after = Math.min(...view.hand.map((c) => deadwoodAfter(withCard, c.id)))
  return after < bestArrangement(view.hand).value
}

/**
 * Beginners overlook pick-ups and simply throw their highest deadwood card; intermediate players
 * keep pairs and near-runs; the expert also counts cards (a pair whose completing cards are gone
 * is worth nothing) and discards defensively. Everybody knocks as soon as allowed – waiting for
 * gin or a lower knock did not pay off in simulations.
 */
export function createGinAgent(difficulty: Difficulty): AiAgent<GinView, GinAction> {
  return {
    name: `Gin Rummy (${difficulty})`,
    chooseAction({ view, rng, playerId }) {
      const top = view.discardTop
      if (view.phase === 'upcard')
        return top && wantsDiscard(view, top, difficulty, rng)
          ? { type: 'takeUpcard' }
          : { type: 'pass' }
      if (view.phase === 'draw') {
        return !view.stockOnly && top && wantsDiscard(view, top, difficulty, rng)
          ? { type: 'drawDiscard' }
          : { type: 'drawStock' }
      }

      if (canBigGin(view.hand, view.options)) return { type: 'knock' }
      // Knock with the discard that leaves the least deadwood.
      const knock = view.hand
        .filter((c) => c.id !== view.takenDiscard)
        .map((c) => ({ cardId: c.id, deadwood: deadwoodAfter(view.hand, c.id) }))
        .filter((k) => k.deadwood <= view.knockLimit)
        .sort((a, b) => a.deadwood - b.deadwood)[0]
      if (knock) return { type: 'knock', cardId: knock.cardId }

      if (difficulty === 'beginner') {
        const pool = bestArrangement(view.hand).deadwood.filter((c) => c.id !== view.takenDiscard)
        if (pool.length > 0) {
          const card = [...pool].sort((a, b) => cardValue(b) - cardValue(a))[0]!
          return { type: 'discard', cardId: card.id }
        }
      }
      return rankDiscards(view, difficulty, playerId)[0]!
    },
  }
}
