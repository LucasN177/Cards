/**
 * Melds and deadwood for Gin Rummy: sets (3–4 cards of one rank) and runs (3+ cards in a row of
 * one suit, ace always low). Pure functions shared by rules, AI and table.
 */
import { RANKS, type Suit, type SuitedCard } from '@/engine'

/** Ace 1, 2 … 10, jack 11, queen 12, king 13 (runs: the ace is always low). */
export const rankNumber = (card: SuitedCard) => ((RANKS.indexOf(card.rank) + 1) % 13) + 1

/** Deadwood value: ace 1, number cards their number, pictures 10. */
export const cardValue = (card: SuitedCard) => Math.min(10, rankNumber(card))

export const deadwoodValue = (cards: readonly SuitedCard[]) =>
  cards.reduce((sum, c) => sum + cardValue(c), 0)

export type MeldKind = 'set' | 'run'

export interface Meld {
  readonly kind: MeldKind
  /** Runs from low to high. */
  readonly cards: readonly SuitedCard[]
}

export interface Arrangement {
  readonly melds: readonly Meld[]
  readonly deadwood: readonly SuitedCard[]
  readonly value: number
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }

/** By suit, then rank. */
export const sortCards = (cards: readonly SuitedCard[]) =>
  [...cards].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || rankNumber(a) - rankNumber(b),
  )

export function isSet(cards: readonly SuitedCard[]) {
  if (cards.length < 3 || cards.length > 4) return false
  return (
    cards.every((c) => c.rank === cards[0]!.rank) &&
    new Set(cards.map((c) => c.suit)).size === cards.length
  )
}

export function isRun(cards: readonly SuitedCard[]) {
  if (cards.length < 3) return false
  if (cards.some((c) => c.suit !== cards[0]!.suit)) return false
  const nums = cards.map(rankNumber).sort((a, b) => a - b)
  return nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1)
}

export function toMeld(cards: readonly SuitedCard[]): Meld | null {
  if (isSet(cards)) return { kind: 'set', cards: [...cards] }
  if (isRun(cards))
    return { kind: 'run', cards: [...cards].sort((a, b) => rankNumber(a) - rankNumber(b)) }
  return null
}

/** Every set and run that can be formed from `cards` (overlapping). */
export function candidateMelds(cards: readonly SuitedCard[]): Meld[] {
  const out: Meld[] = []
  const byRank = new Map<string, SuitedCard[]>()
  for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c])
  for (const group of byRank.values()) {
    if (group.length < 3) continue
    if (group.length === 4) {
      out.push({ kind: 'set', cards: group })
      for (let skip = 0; skip < 4; skip++)
        out.push({ kind: 'set', cards: group.filter((_, i) => i !== skip) })
    } else out.push({ kind: 'set', cards: group })
  }
  const bySuit = new Map<Suit, SuitedCard[]>()
  for (const c of cards) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c])
  for (const suited of bySuit.values()) {
    const sorted = [...suited].sort((a, b) => rankNumber(a) - rankNumber(b))
    for (let start = 0; start < sorted.length; start++) {
      for (let end = start + 1; end < sorted.length; end++) {
        if (rankNumber(sorted[end]!) !== rankNumber(sorted[end - 1]!) + 1) break
        if (end - start >= 2) out.push({ kind: 'run', cards: sorted.slice(start, end + 1) })
      }
    }
  }
  return out
}

/**
 * Calls `visit` for every way of splitting `cards` into disjoint melds and deadwood. Each card is
 * either deadwood or in one meld; the lowest unassigned card decides, so nothing is visited twice.
 */
function forEachArrangement(
  cards: readonly SuitedCard[],
  visit: (melds: readonly Meld[], deadwood: readonly SuitedCard[]) => void,
) {
  const candidates = candidateMelds(cards)
  const ids = cards.map((c) => c.id)
  const used = new Set<string>()
  const melds: Meld[] = []
  const deadwood: SuitedCard[] = []
  const step = (i: number) => {
    while (i < ids.length && used.has(ids[i]!)) i++
    if (i >= ids.length) {
      visit(melds, deadwood)
      return
    }
    const card = cards[i]!
    deadwood.push(card)
    step(i + 1)
    deadwood.pop()
    for (const meld of candidates) {
      if (!meld.cards.includes(card) || meld.cards.some((c) => used.has(c.id))) continue
      for (const c of meld.cards) used.add(c.id)
      melds.push(meld)
      step(i + 1)
      melds.pop()
      for (const c of meld.cards) used.delete(c.id)
    }
  }
  step(0)
}

/** The arrangement with the least deadwood (ties: fewer deadwood cards). */
export function bestArrangement(cards: readonly SuitedCard[]): Arrangement {
  let best: Arrangement = { melds: [], deadwood: [...cards], value: deadwoodValue(cards) }
  forEachArrangement(cards, (melds, deadwood) => {
    const value = deadwoodValue(deadwood)
    if (value < best.value || (value === best.value && deadwood.length < best.deadwood.length))
      best = { melds: [...melds], deadwood: [...deadwood], value }
  })
  return best
}

/** Whether `card` extends `meld` (a run at either end, a set of three to four). */
export function extendsMeld(meld: Meld, card: SuitedCard) {
  if (meld.kind === 'set') return meld.cards.length < 4 && isSet([...meld.cards, card])
  return isRun([...meld.cards, card])
}

/** Lays off as many of `cards` as possible on `melds`: runs first (they can grow in chains). */
function layOffAll(melds: readonly Meld[], cards: readonly SuitedCard[]) {
  const table = melds.map((m) => ({ ...m, cards: [...m.cards] }))
  let rest = [...cards]
  const laidOff: SuitedCard[] = []
  for (let changed = true; changed;) {
    changed = false
    for (const card of rest) {
      const target =
        table.find((m) => m.kind === 'run' && extendsMeld(m, card)) ??
        table.find((m) => m.kind === 'set' && extendsMeld(m, card))
      if (!target) continue
      target.cards = toMeld([...target.cards, card])!.cards as SuitedCard[]
      laidOff.push(card)
      rest = rest.filter((c) => c !== card)
      changed = true
      break
    }
  }
  return { laidOff, rest }
}

export interface DefenderResult extends Arrangement {
  /** Cards laid off on the knocker's melds. */
  readonly laidOff: readonly SuitedCard[]
}

/**
 * The defender's best answer to a knock: own melds plus laying off on the knocker's melds, for
 * the least deadwood. Every split into own melds is tried, then the rest is laid off.
 */
export function defend(
  cards: readonly SuitedCard[],
  knockerMelds: readonly Meld[],
): DefenderResult {
  let best: DefenderResult = {
    melds: [],
    deadwood: [...cards],
    value: deadwoodValue(cards),
    laidOff: [],
  }
  forEachArrangement(cards, (melds, deadwood) => {
    const { laidOff, rest } = layOffAll(knockerMelds, deadwood)
    const value = deadwoodValue(rest)
    if (value < best.value) best = { melds: [...melds], deadwood: rest, value, laidOff }
  })
  return best
}
