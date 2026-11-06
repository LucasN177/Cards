/**
 * Meld analysis for Rommé: sets (3–4 cards of one rank in different suits) and runs (3+ cards
 * in a row of one suit). Jokers stand in for any card. Pure functions, shared by rules and AI.
 */
import { type Card, RANKS, type Rank, type Suit, SUITS } from '@/engine'

export interface Meld {
  readonly id: string
  readonly kind: 'set' | 'run'
  /** The cards in table order (a run from low to high). */
  readonly cards: readonly Card[]
  /** The rank each card stands for (jokers included); runs use 1 for a low ace. */
  readonly values: readonly number[]
  readonly suit: Suit | null
}

/** 2 … 13 (K), ace 14 – or 1 at the bottom of a run. */
export const rankNumber = (rank: Rank) => RANKS.indexOf(rank) + 2

const isJoker = (c: Card) => c.kind === 'joker'

/** Points of a card standing for rank number `n` in a meld (low ace 1, 10–K 10, ace 11). */
export const meldPoints = (n: number) => (n === 1 ? 1 : n === 14 ? 11 : n >= 10 ? 10 : n)

/** Penalty of a card left in hand: joker 20, ace 11, 10–K 10, others their number. */
export function handPenalty(c: Card) {
  if (c.kind === 'joker') return 20
  const n = rankNumber(c.rank)
  return n === 14 ? 11 : n >= 10 ? 10 : n
}

export const meldValue = (m: Pick<Meld, 'values'>) =>
  m.values.reduce((s, n) => s + meldPoints(n), 0)

function analyzeSet(cards: readonly Card[]): Omit<Meld, 'id'> | null {
  if (cards.length < 3 || cards.length > 4) return null
  const plain = cards.filter((c) => !isJoker(c))
  if (plain.length === 0) return null
  // At most as many jokers as real cards keeps sets meaningful.
  if (cards.length - plain.length > plain.length) return null
  const rank = plain[0]!.kind === 'suited' ? plain[0]!.rank : null
  const suits = new Set<Suit>()
  for (const c of plain) {
    if (c.kind !== 'suited' || c.rank !== rank) return null
    if (suits.has(c.suit)) return null
    suits.add(c.suit)
  }
  const n = rankNumber(rank!)
  return {
    kind: 'set',
    cards: [...plain, ...cards.filter(isJoker)],
    values: cards.map(() => n),
    suit: null,
  }
}

function analyzeRun(cards: readonly Card[]): Omit<Meld, 'id'> | null {
  if (cards.length < 3 || cards.length > 14) return null
  const plain = cards.filter((c) => !isJoker(c))
  const jokers = cards.filter(isJoker)
  if (plain.length === 0 || jokers.length > plain.length) return null
  const suit = plain[0]!.kind === 'suited' ? plain[0]!.suit : null
  if (plain.some((c) => c.kind !== 'suited' || c.suit !== suit)) return null
  for (const aceLow of [false, true]) {
    const nums = plain
      .map((c) => {
        const n = rankNumber((c as { rank: Rank }).rank)
        return n === 14 && aceLow ? 1 : n
      })
      .sort((a, b) => a - b)
    if (new Set(nums).size !== nums.length) continue
    const lo = nums[0]!
    const hi = nums.at(-1)!
    const gaps = hi - lo + 1 - nums.length
    if (gaps > jokers.length) continue
    // Spare jokers extend the run upwards, then downwards.
    let spare = jokers.length - gaps
    let top = hi
    let bottom = lo
    while (spare > 0 && top < 14) {
      top++
      spare--
    }
    while (spare > 0 && bottom > 1) {
      bottom--
      spare--
    }
    if (spare > 0) continue
    const ordered: Card[] = []
    const values: number[] = []
    const byNum = new Map(
      plain.map((c) => {
        const n = rankNumber((c as { rank: Rank }).rank)
        return [n === 14 && aceLow ? 1 : n, c] as const
      }),
    )
    let j = 0
    for (let v = bottom; v <= top; v++) {
      ordered.push(byNum.get(v) ?? jokers[j++]!)
      values.push(v)
    }
    return { kind: 'run', cards: ordered, values, suit }
  }
  return null
}

/** The meld these cards make, or null. Sets win over runs when both are possible. */
export function analyzeMeld(cards: readonly Card[]): Omit<Meld, 'id'> | null {
  return analyzeSet(cards) ?? analyzeRun(cards)
}

/** Whether `cards` can be added to `meld` (the meld stays of the same kind). */
export function layOff(meld: Meld, cards: readonly Card[]): Omit<Meld, 'id'> | null {
  const result = analyzeMeld([...meld.cards, ...cards])
  return result && result.kind === meld.kind ? result : null
}

// --- Finding melds in a hand (AI and hints) ----------------------------------------------------

/** All candidate melds in a hand: sets, and runs of three or more, with at most one joker each. */
export function candidateMelds(hand: readonly Card[]): Card[][] {
  const plain = hand.filter((c): c is Extract<Card, { kind: 'suited' }> => c.kind === 'suited')
  const jokers = hand.filter(isJoker)
  const out: Card[][] = []
  // Sets.
  for (const rank of RANKS) {
    const bySuit = new Map<Suit, Card>()
    for (const c of plain) if (c.rank === rank && !bySuit.has(c.suit)) bySuit.set(c.suit, c)
    const group = [...bySuit.values()]
    if (group.length >= 3) {
      out.push(group.slice(0, 3))
      if (group.length === 4) out.push(group)
    }
    if (group.length === 2 && jokers.length > 0) out.push([...group, jokers[0]!])
  }
  // Runs (aces both low and high).
  for (const suit of SUITS) {
    const byNum = new Map<number, Card>()
    for (const c of plain.filter((x) => x.suit === suit)) {
      const n = rankNumber(c.rank)
      if (!byNum.has(n)) byNum.set(n, c)
      if (n === 14 && !byNum.has(1)) byNum.set(1, c)
    }
    for (let start = 1; start <= 12; start++) {
      for (let useJoker = 0; useJoker <= Math.min(1, jokers.length); useJoker++) {
        const run: Card[] = []
        let jokerUsed = false
        for (let v = start; v <= 14; v++) {
          const card = byNum.get(v)
          if (card && !run.includes(card)) run.push(card)
          else if (useJoker && !jokerUsed) {
            run.push(jokers[0]!)
            jokerUsed = true
          } else break
          if (run.length >= 3 && analyzeRun(run)) out.push([...run])
        }
      }
    }
  }
  return out
}

/**
 * The best set of disjoint melds that can be laid out from a hand: the most points (needed for
 * the first lay-out), or with  the most cards (points break ties).
 */
export function bestMelds(hand: readonly Card[], by: 'points' | 'cards' = 'points'): Card[][] {
  const candidates = candidateMelds(hand)
    .map((cards) => {
      const points = meldValue(analyzeMeld(cards)!)
      return { cards, value: by === 'cards' ? cards.length * 1000 + points : points }
    })
    .sort((a, b) => b.value - a.value)
  let best: { melds: Card[][]; value: number } = { melds: [], value: 0 }
  // Candidates are sorted by value, so a capped search still finds a good answer quickly.
  let steps = 0
  const search = (i: number, used: Set<string>, chosen: Card[][], value: number) => {
    if (value > best.value) best = { melds: [...chosen], value }
    if (i >= candidates.length || ++steps > 20_000) return
    for (let k = i; k < candidates.length; k++) {
      const c = candidates[k]!
      if (c.cards.some((x) => used.has(x.id))) continue
      for (const x of c.cards) used.add(x.id)
      chosen.push(c.cards)
      search(k + 1, used, chosen, value + c.value)
      chosen.pop()
      for (const x of c.cards) used.delete(x.id)
    }
  }
  search(0, new Set(), [], 0)
  return best.melds
}
