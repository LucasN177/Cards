import { type AiAgent, type Card, type Difficulty, nextPlayer, type PlayerId } from '@/engine'
import {
  analyzeMeld,
  bestMelds,
  handPenalty,
  layOff,
  type Meld,
  meldValue,
  rankNumber,
} from './melds'
import type { RommeAction, RommeView } from './romme'

type Suited = Extract<Card, { kind: 'suited' }>

const coveredBy = (melds: readonly (readonly Card[])[]) => new Set(melds.flat().map((c) => c.id))

/** The ace also sits below the two (A-2-3). */
const distance = (a: Suited, b: Suited) => {
  const x = rankNumber(a.rank)
  const y = rankNumber(b.rank)
  const low = (n: number) => (n === 14 ? 1 : n)
  return Math.min(Math.abs(x - y), Math.abs(low(x) - low(y)))
}

/** Whether two plain cards could end up in one meld: same rank, or same suit and close. */
function related(a: Card, b: Card) {
  if (a.kind !== 'suited' || b.kind !== 'suited') return false
  if (a.rank === b.rank) return a.suit !== b.suit
  return a.suit === b.suit && distance(a, b) <= 2
}

/** How useful a card is for future melds: jokers most, then pairs and neighbours. */
function usefulness(card: Card, hand: readonly Card[]) {
  if (card.kind === 'joker') return 100
  let u = 0
  for (const other of hand) {
    if (other === card || other.kind !== 'suited') continue
    if (other.rank === card.rank && other.suit !== card.suit) u += 3
    if (other.suit === card.suit) {
      const d = Math.abs(rankNumber(other.rank) - rankNumber(card.rank))
      if (d === 1) u += 3
      else if (d === 2) u += 1.5
    }
  }
  return u
}

/** Card counting: how many copies of each card (two decks) nobody has seen yet. */
function liveCounter(view: RommeView) {
  const seen = new Map<string, number>()
  for (const c of [...view.hand, ...view.discardPile, ...view.melds.flatMap((m) => m.cards)]) {
    if (c.kind === 'suited') seen.set(c.rank + c.suit, (seen.get(c.rank + c.suit) ?? 0) + 1)
  }
  return (rank: number, suit: Suited['suit']) => {
    const n = rank === 1 ? 14 : rank
    if (n < 2 || n > 14) return 0
    const r = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][n - 2]!
    return Math.max(0, 2 - (seen.get(r + suit) ?? 0))
  }
}

const SUITS = ['clubs', 'spades', 'hearts', 'diamonds'] as const

/**
 * Expert: like `usefulness`, but a pair or a pair of neighbours is only worth as much as the
 * cards that would complete it are still out there.
 */
function liveUsefulness(card: Card, hand: readonly Card[], live: ReturnType<typeof liveCounter>) {
  if (card.kind === 'joker') return 100
  let u = 0
  const n = rankNumber(card.rank)
  for (const other of hand) {
    if (other === card || other.kind !== 'suited') continue
    if (other.rank === card.rank && other.suit !== card.suit) {
      // A set needs one of the two other suits.
      const outs = SUITS.filter((s) => s !== card.suit && s !== other.suit).reduce(
        (sum, s) => sum + live(n, s),
        0,
      )
      u += 0.9 * outs
    } else if (other.suit === card.suit) {
      const d = distance(card, other)
      const lo = Math.min(n, rankNumber(other.rank))
      const hi = Math.max(n, rankNumber(other.rank))
      if (d === 1) u += 0.8 * (live(lo - 1, card.suit) + live(hi + 1, card.suit))
      else if (d === 2) u += 0.8 * live(lo + 1, card.suit)
    }
  }
  return u
}

const fitsTable = (card: Card, melds: readonly Meld[]) => melds.some((m) => layOff(m, [card]))

/**
 * Expert: how much a discard would help the next player. Cards that fit a meld on the table are
 * a gift once they have laid out; cards close to what they took from the discard pile probably
 * complete their melds.
 */
function danger(card: Card, view: RommeView, me: PlayerId) {
  if (card.kind === 'joker') return 0
  const next = nextPlayer(view.order, me)
  let d = 0
  if (view.hasMelded[next] && fitsTable(card, view.melds)) d += 6
  for (const picked of view.pickups[next] ?? []) if (related(card, picked)) d += 4
  return d
}

/** Fewest cards any opponent holds – close to going out means dumping high cards matters. */
const closestOpponent = (view: RommeView, me: PlayerId) =>
  Math.min(...view.order.filter((p) => p !== me).map((p) => view.handSizes[p] ?? 13))

/**
 * Beginners forget to lay out and keep poor cards; intermediate players take the discard only
 * for a meld and keep what forms melds; the expert also counts cards (a partial meld whose
 * completing cards are gone is worth nothing), takes jokers and lay-off cards from the pile,
 * avoids feeding the next player and dumps high cards when somebody is about to go out.
 */
export function createRommeAgent(difficulty: Difficulty): AiAgent<RommeView, RommeAction> {
  const expert = difficulty === 'expert'
  return {
    name: `Rommé (${difficulty})`,
    chooseAction({ view, rng }) {
      const hand = view.hand
      const me = view.turn
      if (view.phase === 'draw') {
        const top = view.discardTop
        if (top && difficulty !== 'beginner') {
          // Take the discard only if it ends up in a meld …
          if (coveredBy(bestMelds([...hand, top])).has(top.id)) return { type: 'drawDiscard' }
          // … or (expert) it is a joker or can be laid off right away.
          if (expert && top.kind === 'joker') return { type: 'drawDiscard' }
          if (expert && view.hasMelded[me] && fitsTable(top, view.melds))
            return { type: 'drawDiscard' }
        }
        return { type: 'drawStock' }
      }

      // Lay out as soon as it is allowed (beginners sometimes forget).
      const melds = bestMelds(hand)
      const value = melds.reduce((s, m) => s + meldValue(analyzeMeld(m)!), 0)
      const canMeld = view.hasMelded[me] || value >= view.options.firstMeld
      if (melds.length > 0 && canMeld && !(difficulty === 'beginner' && rng.next() < 0.3)) {
        // Melding everything ends the round at once; otherwise a card stays to discard.
        return { type: 'meld', melds: melds.map((m) => m.map((c) => c.id)) }
      }

      // Lay off single cards on the table (also the very last card: that ends the round).
      if (view.hasMelded[me]) {
        for (const card of hand) {
          for (const meld of view.melds) {
            if (layOff(meld, [card])) return { type: 'layOff', meldId: meld.id, cardIds: [card.id] }
          }
        }
      }

      // Discard the least useful card (high penalty first among equally useless ones).
      const options = hand.filter((c) => c.id !== view.takenDiscard || hand.length === 1)
      const keep = coveredBy(bestMelds(hand))
      const live = expert ? liveCounter(view) : null
      const penaltyWeight = expert ? (closestOpponent(view, me) <= 4 ? 0.6 : 0.25) : 0.15
      const score = (c: Card) =>
        (keep.has(c.id) ? 50 : 0) +
        (live
          ? liveUsefulness(c, hand, live) + danger(c, view, me)
          : usefulness(c, hand) * (difficulty === 'beginner' ? 0.3 : 1)) -
        handPenalty(c) * penaltyWeight
      const card = [...options].sort((a, b) => score(a) - score(b))[0]!
      return { type: 'discard', cardId: card.id }
    },
  }
}
