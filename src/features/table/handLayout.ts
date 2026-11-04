/** Minimum visible part of an overlapped card, relative to its width. */
const MIN_VISIBLE = 0.28
export const CARD_GAP = 6

/** Horizontal distance between card origins so the hand always fits the available width. */
export function cardSpacing(count: number, containerWidth: number, cardWidth: number): number {
  if (count <= 1 || cardWidth === 0) return cardWidth + CARD_GAP
  const fit = (containerWidth - cardWidth) / (count - 1)
  return Math.max(cardWidth * MIN_VISIBLE, Math.min(cardWidth + CARD_GAP, fit))
}

/** Below this visible strip (px) a card is hard to hit with a finger. */
export const MIN_TAP_WIDTH = 32

/**
 * Number of rows for the hand: big hands on narrow (portrait phone) screens split into two
 * staggered rows instead of overlapping into slivers that cannot be tapped.
 */
export function handRows(count: number, containerWidth: number, cardWidth: number): 1 | 2 {
  if (count < 2 || cardWidth === 0) return 1
  const fit = (containerWidth - cardWidth) / (count - 1)
  return fit < MIN_TAP_WIDTH ? 2 : 1
}
