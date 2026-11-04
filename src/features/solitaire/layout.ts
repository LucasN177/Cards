/** Layout helpers shared by the solitaire games. */

/** Vertical offsets in a pile so even long piles fit the available height. */
export function pileOffsets(hidden: number, open: number, cardHeight: number, areaHeight: number) {
  const down = Math.round(cardHeight * 0.12)
  const max = cardHeight * 0.3
  const min = cardHeight * 0.2
  const totalHidden = hidden * down
  if (open <= 1) {
    // Many hidden cards (Spider) may also need squeezing.
    const fitDown = hidden > 0 ? (areaHeight - cardHeight) / hidden : down
    return { down: Math.max(3, Math.min(down, fitDown)), up: max }
  }
  const fit = (areaHeight - cardHeight - totalHidden) / (open - 1)
  if (fit >= min) return { down, up: Math.min(max, fit) }
  // Still too long: squeeze the face-down part as well, but keep open cards readable.
  const squeezedDown = Math.max(
    3,
    (areaHeight - cardHeight - (open - 1) * min) / Math.max(1, hidden),
  )
  return { down: Math.min(down, squeezedDown), up: Math.max(cardHeight * 0.14, Math.min(min, fit)) }
}

/**
 * Card width for a board of `columns` piles plus one row of slots above them (portrait), or with
 * the slots moved to the sides (landscape phones), so the piles get the height.
 */
export function boardLayout(
  width: number,
  height: number,
  {
    columns,
    gap,
    sideColumns = 0,
    sideRows = 4,
    tallness = 5.1,
  }: {
    columns: number
    gap: number
    /** Extra card columns at the sides in landscape (e.g. stock + foundations). */
    sideColumns?: number
    /** Cards stacked in a side column in landscape (limits the card height). */
    sideRows?: number
    /** Portrait height budget in card heights (top row + piles). */
    tallness?: number
  },
) {
  const landscape = sideColumns > 0 && width > height * 1.2
  const status = 44
  const byHeight = landscape
    ? (height - status - (sideRows - 1) * gap) / sideRows / 1.4
    : (height - status - 2 * gap) / tallness / 1.4
  const totalColumns = landscape ? columns + sideColumns + 0.5 : columns
  const byWidth = (width - (totalColumns - 1) * gap) / totalColumns
  const cardWidth = Math.max(26, Math.floor(Math.min(byHeight, byWidth, 104)))
  return { landscape, cardWidth, cardHeight: Math.round(cardWidth * 1.4) }
}
