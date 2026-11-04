export const GAP = 6

/**
 * Card width for the available space. Portrait: stock, waste and foundations above the seven
 * piles. Landscape (phones held sideways): they move to the sides, so the piles get the height.
 */
export function klondikeLayout(width: number, height: number) {
  const landscape = width > height * 1.2
  const status = 44
  const byHeight = landscape
    ? (height - status - 3 * GAP) / 4 / 1.4
    : (height - status - 2 * GAP) / 5.1 / 1.4
  const byWidth = landscape ? (width - 8 * GAP) / 9.5 : (width - 6 * GAP) / 7
  const cardWidth = Math.max(28, Math.floor(Math.min(byHeight, byWidth, 104)))
  return { landscape, cardWidth, cardHeight: Math.round(cardWidth * 1.4) }
}
