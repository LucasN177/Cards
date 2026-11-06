import { type HTMLMotionProps, motion } from 'framer-motion'
import type { Card } from '@/engine'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { useCardDecoration } from './cardDecoration'
import { cardName } from './cardFaces'
import { CardBack, CardFace } from './CardFace'

export type CardSize = 'md' | 'sm' | 'xs'

/** Relative to `--card-w`, which the table sets responsively. */
const SIZE_SCALE: Readonly<Record<CardSize, number>> = { md: 1, sm: 0.62, xs: 0.42 }

export interface PlayingCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Omit (or set `faceDown`) to show the back. */
  readonly card?: Card
  readonly faceDown?: boolean
  readonly size?: CardSize
  /** Suit also in the top-right corner, for cards fanned downwards. */
  readonly topIndex?: boolean
}

/** A single card, sized from the table's `--card-w`. Pass `layoutId` to animate between places. */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  topIndex = false,
  className,
  style,
  ...props
}: PlayingCardProps) {
  const deckStyle = useSettings((s) => s.deckStyle)
  const decorate = useCardDecoration()
  const showFace = card !== undefined && !faceDown
  const scale = SIZE_SCALE[size]
  const decoration = showFace && decorate ? decorate(card) : null

  return (
    <motion.div
      role="img"
      aria-label={showFace ? cardName(card, deckStyle) : 'Verdeckte Karte'}
      className={cn('shrink-0 rounded-[7%] shadow-md', decoration && 'relative', className)}
      style={{
        width: `calc(var(--card-w, 5rem) * ${scale})`,
        height: `calc(var(--card-h, 7rem) * ${scale})`,
        ...style,
      }}
      {...props}
    >
      {showFace ? <CardFace card={card} style={deckStyle} topIndex={topIndex} /> : <CardBack />}
      {decoration}
    </motion.div>
  )
}
