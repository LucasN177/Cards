import type { AiAgent, CardId, Difficulty, SuitedCard } from '@/engine'
import { createDeck } from '@/engine'
import {
  cardValue,
  type CribbageAction,
  type CribbageView,
  peggingItems,
  scoreHand,
  sideOf,
  totalOf,
} from './cribbage'

type Crib = Extract<CribbageAction, { type: 'crib' }>
type Play = Extract<CribbageAction, { type: 'play' }>

const DECK = createDeck('standard52') as SuitedCard[]

/** Cards I have not seen: not in my hand, the crib I gave, the starter or on the table. */
function unseen(view: CribbageView, extraSeen: readonly SuitedCard[] = []) {
  const seen = new Set(
    [
      ...view.hand,
      ...view.kept,
      ...extraSeen,
      ...(view.starter ? [view.starter] : []),
      ...view.played.map((p) => p.card),
    ].map((c) => c.id),
  )
  return DECK.filter((c) => !seen.has(c.id))
}

/** Average show of `keep` over every possible starter. */
function expectedHand(keep: readonly SuitedCard[], starters: readonly SuitedCard[]) {
  let sum = 0
  for (const s of starters) sum += totalOf(scoreHand(keep, s))
  return sum / starters.length
}

/** Rough value the given cards bring into a crib: their own fifteens and pairs, fives and near runs. */
function cribValue(cards: readonly SuitedCard[]) {
  let v = totalOf(scoreHand(cards, null, true))
  for (const c of cards) if (c.rank === '5') v += 1.5
  if (cards.length === 2) {
    const [a, b] = cards as [SuitedCard, SuitedCard]
    const gap = Math.abs(cardValue(a) - cardValue(b))
    if (a.rank !== b.rank && gap <= 2 && cardValue(a) < 10) v += 0.6
    if (cardValue(a) + cardValue(b) === 15) v += 0.5
  }
  return v
}

/** Expected points the next player scores with a reply to `series` (over unseen cards). */
function replyRisk(series: readonly SuitedCard[], pool: readonly SuitedCard[]) {
  const count = series.reduce((s, c) => s + cardValue(c), 0)
  let sum = 0
  let n = 0
  for (const c of pool) {
    if (count + cardValue(c) > 31) continue
    sum += totalOf(peggingItems([...series, c]))
    n++
  }
  return pool.length > 0 ? (sum / pool.length) * Math.min(1, n / 4 + 0.5) : 0
}

function chooseCrib(
  view: CribbageView,
  actions: readonly Crib[],
  difficulty: Difficulty,
  rng: () => number,
) {
  const myCrib = sideOf(view.order, view.dealer) === view.mySide
  const byId = (id: CardId) => view.hand.find((c) => c.id === id)!
  const starters = unseen(view)
  const score = (a: Crib) => {
    const given = a.cardIds.map(byId)
    const keep = view.hand.filter((c) => !a.cardIds.includes(c.id))
    if (difficulty === 'beginner') return totalOf(scoreHand(keep, null)) + rng() * 4
    let s = expectedHand(keep, starters)
    const crib = cribValue(given)
    s += myCrib ? crib : -crib
    if (difficulty === 'expert') {
      // Low cards help in the play, and a lone five is a gift to the other crib.
      s += keep.filter((c) => cardValue(c) <= 4).length * 0.25
      if (!myCrib && given.some((c) => c.rank === '5')) s -= 1
    }
    return s
  }
  return [...actions].sort((a, b) => score(b) - score(a))[0]!
}

function choosePlay(
  view: CribbageView,
  actions: readonly Play[],
  difficulty: Difficulty,
  rng: () => number,
) {
  const byId = (id: CardId) => view.hand.find((c) => c.id === id)!
  const series = view.series.map((p) => p.card)
  if (difficulty === 'beginner') {
    const scoring = actions.filter((a) => totalOf(peggingItems([...series, byId(a.cardId)])) > 0)
    const pool = scoring.length > 0 && rng() < 0.7 ? scoring : actions
    return pool[Math.floor(rng() * pool.length)]!
  }
  const pool = unseen(view)
  const score = (a: Play) => {
    const card = byId(a.cardId)
    const next = [...series, card]
    const count = view.count + cardValue(card)
    let s = totalOf(peggingItems(next))
    if (difficulty === 'expert') s -= replyRisk(next, pool)
    else {
      // Avoid the classic traps: 5 and 21 invite a fifteen or 31.
      if (count === 5 || count === 21) s -= 1
      if (series.length === 0 && cardValue(card) === 5) s -= 1
    }
    // Keep low cards for later "go" points; lead from pairs.
    s -= cardValue(card) < 5 && count < 22 ? 0.2 : 0
    if (series.length === 0 && view.hand.some((c) => c !== card && c.rank === card.rank)) s += 0.3
    return s
  }
  return [...actions].sort((a, b) => score(b) - score(a))[0]!
}

/**
 * Beginners keep the cards that score best on their own and play almost at random; intermediate
 * players weigh every starter and the crib and avoid 5 and 21; the expert also counts the reply
 * the next player could score from the unseen cards.
 */
export function createCribbageAgent(difficulty: Difficulty): AiAgent<CribbageView, CribbageAction> {
  return {
    name: `Cribbage (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const random = () => rng.next()
      if (view.phase === 'crib') return chooseCrib(view, legalActions as Crib[], difficulty, random)
      return choosePlay(view, legalActions as Play[], difficulty, random)
    },
  }
}
