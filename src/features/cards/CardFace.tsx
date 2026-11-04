import type { Card } from '@/engine'
import type { DeckStyle } from '@/stores/settingsStore'
import { rankIndex, SUIT_FILL } from './cardFaces'
import { SuitSymbol } from './SuitSymbol'

/** Card faces use a 250×350 viewBox (5:7). Large corner indices keep overlapped hands readable. */
const W = 250
const H = 350

function Corner({ label, color, rotate }: { label: string; color: string; rotate?: boolean }) {
  return (
    <text
      x={rotate ? W - 24 : 24}
      y={rotate ? H - 30 : 30}
      transform={rotate ? `rotate(180 ${W - 24} ${H - 30})` : undefined}
      fill={color}
      fontSize={label.length > 1 ? 54 : 62}
      fontWeight={700}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      dominantBaseline="hanging"
      letterSpacing={label.length > 1 ? -4 : 0}
    >
      {label}
    </text>
  )
}

export function CardFace({ card, style }: { card: Card; style: DeckStyle }) {
  if (card.kind === 'joker') {
    const color = card.color === 'red' ? '#d32f2f' : '#1f2937'
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="size-full" aria-hidden>
        <rect
          x="2"
          y="2"
          width={W - 4}
          height={H - 4}
          rx="18"
          fill="#fff"
          stroke="#d4d4d8"
          strokeWidth="3"
        />
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="150"
          fill={color}
        >
          ★
        </text>
        <text x="24" y="30" fill={color} fontSize="40" fontWeight={700} dominantBaseline="hanging">
          JOKER
        </text>
      </svg>
    )
  }

  const color = SUIT_FILL[style][card.suit]
  const label = rankIndex(card.rank, style)
  const isFace = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="size-full" aria-hidden>
      <rect
        x="2"
        y="2"
        width={W - 4}
        height={H - 4}
        rx="18"
        fill="#fff"
        stroke="#d4d4d8"
        strokeWidth="3"
      />
      <Corner label={label} color={color} />
      <SuitSymbol suit={card.suit} style={style} x={26} y={98} size={46} />
      <Corner label={label} color={color} rotate />
      <SuitSymbol suit={card.suit} style={style} x={W - 72} y={H - 144} size={46} rotate />
      {isFace ? (
        <g>
          <rect
            x="70"
            y="92"
            width="110"
            height="166"
            rx="10"
            fill="none"
            stroke={color}
            strokeWidth="4"
            opacity="0.5"
          />
          <text
            x={W / 2}
            y={152}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="88"
            fontWeight={700}
            fontFamily="ui-serif, Georgia, serif"
          >
            {label}
          </text>
          <SuitSymbol suit={card.suit} style={style} x={W / 2 - 28} y={196} size={56} />
        </g>
      ) : (
        <SuitSymbol
          suit={card.suit}
          style={style}
          x={W / 2 - (card.rank === 'A' ? 60 : 48)}
          y={H / 2 - (card.rank === 'A' ? 60 : 48)}
          size={card.rank === 'A' ? 120 : 96}
        />
      )}
    </svg>
  )
}

export function CardBack() {
  return (
    <div
      aria-hidden
      className="size-full rounded-[7%] border-2 border-white bg-[#1d4ed8] p-[6%] shadow-inner dark:border-zinc-300"
    >
      <div className="size-full rounded-[5%] border border-white/60 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.18)_0_2px,transparent_2px_9px),repeating-linear-gradient(-45deg,rgb(255_255_255/0.18)_0_2px,transparent_2px_9px)]" />
    </div>
  )
}
