import type { Card } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { cn } from '@/lib/utils'

interface CardPileProps {
  readonly label: string
  readonly count: number
  /** Shown face up on top (discard pile). Omit for a face-down stock. */
  readonly topCard?: Card
  /** Makes the pile a button (e.g. tap the stock to draw). */
  readonly onClick?: () => void
  readonly disabled?: boolean
  /** Draws attention to the pile, e.g. when drawing is the only possible move. */
  readonly highlight?: boolean
}

/** A stack of cards, e.g. the stock or a discard pile. */
export function CardPile({ label, count, topCard, onClick, disabled, highlight }: CardPileProps) {
  const layers = Math.min(3, Math.max(0, count - 1))
  const content = (
    <div className="relative">
      {Array.from({ length: layers }, (_, i) => (
        <PlayingCard
          key={i}
          faceDown
          aria-hidden
          className="absolute"
          style={{ top: -(layers - i) * 2, left: -(layers - i) * 2 }}
        />
      ))}
      {count === 0 ? (
        <div className="h-(--card-h) w-(--card-w) rounded-[7%] border-2 border-dashed border-white/40" />
      ) : (
        <PlayingCard card={topCard} layoutId={topCard?.id} className="relative" />
      )}
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-1 text-xs text-white/80">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={`${label} (${count})`}
          className={cn(
            'rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:cursor-default',
            highlight && !disabled && 'animate-pulse ring-4 ring-yellow-300',
          )}
        >
          {content}
        </button>
      ) : (
        content
      )}
      <span>
        {label} · {count}
      </span>
    </div>
  )
}
