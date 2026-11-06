/**
 * Poker hand evaluation for Texas Hold'em: the best five of up to seven cards, as one comparable
 * number (higher is better). Direct evaluation without trying all 21 combinations, because the
 * AI's Monte-Carlo simulation calls it very often.
 */
import { RANKS, type Suit, type SuitedCard } from '@/engine'

export const CATEGORIES = [
  'Höchste Karte',
  'Ein Paar',
  'Zwei Paare',
  'Drilling',
  'Straße',
  'Flush',
  'Full House',
  'Vierling',
  'Straight Flush',
] as const
export type Category = (typeof CATEGORIES)[number]

/** 2 … 14 (ace). */
export const rankValue = (c: SuitedCard) => RANKS.indexOf(c.rank) + 2

/** Category in the high bits, then up to five ranks of 4 bits each. */
const encode = (category: number, ranks: readonly number[]) => {
  let score = category
  for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] ?? 0)
  return score
}

export const categoryOf = (score: number) => Math.floor(score / 16 ** 5)

/** Highest straight in a rank bit mask (bit n = rank n, ace also as bit 1), or 0. */
function straightHigh(mask: number) {
  const m = mask & (1 << 14) ? mask | 2 : mask
  for (let high = 14; high >= 5; high--) {
    const run = 0b11111 << (high - 4)
    if ((m & run) === run) return high
  }
  return 0
}

const SUIT_INDEX: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }

/** Score of the best five-card hand in `cards` (5–7 cards). */
export function evaluate(cards: readonly SuitedCard[]): number {
  const counts = new Array<number>(15).fill(0)
  const suitMasks = [0, 0, 0, 0]
  const suitCounts = [0, 0, 0, 0]
  let mask = 0
  for (const c of cards) {
    const v = rankValue(c)
    const s = SUIT_INDEX[c.suit]
    counts[v]!++
    suitMasks[s]! |= 1 << v
    suitCounts[s]!++
    mask |= 1 << v
  }
  const flushSuit = suitCounts.findIndex((n) => n >= 5)
  if (flushSuit >= 0) {
    const high = straightHigh(suitMasks[flushSuit]!)
    if (high) return encode(8, [high])
  }
  const quads: number[] = []
  const trips: number[] = []
  const pairs: number[] = []
  const singles: number[] = []
  for (let v = 14; v >= 2; v--) {
    const n = counts[v]!
    if (n === 4) quads.push(v)
    else if (n === 3) trips.push(v)
    else if (n === 2) pairs.push(v)
    else if (n === 1) singles.push(v)
  }
  const kickers = (exclude: readonly number[], count: number) => {
    const out: number[] = []
    for (let v = 14; v >= 2 && out.length < count; v--)
      if (counts[v]! > 0 && !exclude.includes(v)) out.push(v)
    return out
  }
  if (quads.length > 0) return encode(7, [quads[0]!, ...kickers([quads[0]!], 1)])
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0)
    return encode(6, [trips[0]!, pair])
  }
  if (flushSuit >= 0) {
    const ranks: number[] = []
    for (let v = 14; v >= 2 && ranks.length < 5; v--)
      if (suitMasks[flushSuit]! & (1 << v)) ranks.push(v)
    return encode(5, ranks)
  }
  const straight = straightHigh(mask)
  if (straight) return encode(4, [straight])
  if (trips.length > 0) return encode(3, [trips[0]!, ...kickers([trips[0]!], 2)])
  if (pairs.length >= 2)
    return encode(2, [pairs[0]!, pairs[1]!, ...kickers([pairs[0]!, pairs[1]!], 1)])
  if (pairs.length === 1) return encode(1, [pairs[0]!, ...kickers([pairs[0]!], 3)])
  return encode(0, singles.slice(0, 5))
}

/** German name of a hand, e.g. "Zwei Paare". A straight flush to the ace is a royal flush. */
export function handName(score: number): string {
  const category = categoryOf(score)
  if (category === 8 && Math.floor(score / 16 ** 4) % 16 === 14) return 'Royal Flush'
  return CATEGORIES[category]!
}
