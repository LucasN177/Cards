export interface Deal<T> {
  readonly hands: T[][]
  /** Cards left over after dealing (stock, talon, Skat …). */
  readonly rest: T[]
}

/**
 * Deals `cardsPerHand` cards to each of `handCount` hands, one at a time in rotation, from the top
 * (start) of `cards`. Deal order only matters for a stacked deck; games with special patterns
 * (e.g. Skat's 3-skat-4-3) can deal themselves.
 */
export function deal<T>(cards: readonly T[], handCount: number, cardsPerHand: number): Deal<T> {
  const needed = handCount * cardsPerHand
  if (needed > cards.length) {
    throw new RangeError(`Cannot deal ${needed} cards from a deck of ${cards.length}`)
  }
  const hands: T[][] = Array.from({ length: handCount }, () => [])
  for (let i = 0; i < needed; i++) hands[i % handCount]!.push(cards[i]!)
  return { hands, rest: cards.slice(needed) }
}
