/** Minimum visible part of an overlapped card, relative to its width. */
const MIN_VISIBLE = 0.28
export const CARD_GAP = 6

/** Horizontal distance between card origins so the hand always fits the available width. */
export function cardSpacing(count: number, containerWidth: number, cardWidth: number): number {
  if (count <= 1 || cardWidth === 0) return cardWidth + CARD_GAP
  const fit = (containerWidth - cardWidth) / (count - 1)
  return Math.max(cardWidth * MIN_VISIBLE, Math.min(cardWidth + CARD_GAP, fit))
}
