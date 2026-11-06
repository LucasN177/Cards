import type { Card } from '@/engine'
import { BlackPig } from './BlackPig'
import { isQueenOfSpades } from './hearts'

/** Hearts: the queen of spades carries a black pig. */
export const pigDecoration = (card: Card) =>
  card.kind === 'suited' && isQueenOfSpades(card) ? (
    <span
      role="img"
      aria-label="Schwarzes Schwein"
      className="pointer-events-none absolute top-[34%] left-[3%] flex w-[46%] items-center justify-center rounded-full bg-white/90 p-[3%] shadow-sm ring-1 ring-black/10"
    >
      <BlackPig className="w-full" />
    </span>
  ) : null
