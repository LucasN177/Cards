import type { Suit } from '@/engine'
import type { DeckStyle } from '@/stores/settingsStore'
import { SUIT_FILL } from './cardFaces'

interface SuitSymbolProps {
  readonly suit: Suit
  readonly style: DeckStyle
  /** Position and size inside the parent SVG (the symbol is drawn in a 100×100 box). */
  readonly x: number
  readonly y: number
  readonly size: number
  readonly rotate?: boolean
}

const HEART =
  'M50 90C20 68 4 50 4 31 4 15 16 5 29 5c10 0 17 6 21 14 4-8 11-14 21-14 13 0 25 10 25 26 0 19-16 37-46 59z'

function FrenchSuit({ suit, fill }: { suit: Suit; fill: string }) {
  switch (suit) {
    case 'hearts':
      return <path d={HEART} fill={fill} />
    case 'diamonds':
      return <path d="M50 3 88 50 50 97 12 50z" fill={fill} />
    case 'spades':
      return (
        <path
          fill={fill}
          d="M50 4C40 24 6 40 6 62c0 14 11 24 24 24 8 0 13-4 17-9-1 9-5 15-13 19h32c-8-4-12-10-13-19 4 5 9 9 17 9 13 0 24-10 24-24C94 40 60 24 50 4z"
        />
      )
    case 'clubs':
      return (
        <g fill={fill}>
          <circle cx="50" cy="27" r="21" />
          <circle cx="27" cy="58" r="21" />
          <circle cx="73" cy="58" r="21" />
          <path d="M42 40h16v18H42z" />
          <path d="M46 56c0 18-5 30-13 40h34c-8-10-13-22-13-40z" />
        </g>
      )
  }
}

function GermanSuit({ suit, fill }: { suit: Suit; fill: string }) {
  switch (suit) {
    case 'hearts':
      return <path d={HEART} fill={fill} />
    case 'diamonds': // Schellen: a bell
      return (
        <g>
          <circle cx="50" cy="12" r="8" fill={fill} />
          <circle cx="50" cy="56" r="38" fill={fill} />
          <path d="M14 50h72" stroke="#7a5200" strokeWidth="5" />
          <circle cx="50" cy="72" r="7" fill="#5c3d00" />
          <path d="M50 79v14" stroke="#5c3d00" strokeWidth="5" strokeLinecap="round" />
        </g>
      )
    case 'spades': // Grün / Laub: a leaf
      return (
        <g>
          <path d="M50 4C84 24 94 58 50 88 6 58 16 24 50 4z" fill={fill} />
          <path
            d="M50 14v84M50 40l-16-10m16 26-20-12m20 26 16-12M50 42l16-10"
            stroke="#1b4d1e"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )
    case 'clubs': // Eichel: an acorn
      return (
        <g>
          <path d="M50 2v14" stroke="#4e2f12" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="50" cy="64" rx="27" ry="32" fill={fill} />
          <path d="M16 46c0-20 15-32 34-32s34 12 34 32z" fill="#4e2f12" />
          <path
            d="M24 40l10-14m6 20 8-24m8 24 6-22m4 18 8-12"
            stroke="#8d6238"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )
  }
}

/** Suit symbol for French or German decks, drawn inside an SVG. */
export function SuitSymbol({ suit, style, x, y, size, rotate }: SuitSymbolProps) {
  const fill = SUIT_FILL[style][suit]
  const scale = size / 100
  const transform = rotate
    ? `translate(${x + size} ${y + size}) rotate(180) scale(${scale})`
    : `translate(${x} ${y}) scale(${scale})`
  return (
    <g transform={transform}>
      {style === 'german' ? (
        <GermanSuit suit={suit} fill={fill} />
      ) : (
        <FrenchSuit suit={suit} fill={fill} />
      )}
    </g>
  )
}
