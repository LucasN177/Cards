import type { ReactNode } from 'react'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { cn } from '@/lib/utils'

interface OpponentSeatProps {
  readonly name: string
  readonly cardCount: number
  readonly active: boolean
  readonly detail?: ReactNode
}

const MAX_SHOWN = 7

export function OpponentSeat({ name, cardCount, active, detail }: OpponentSeatProps) {
  const shown = Math.min(cardCount, MAX_SHOWN)
  return (
    <section
      aria-label={name}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-white transition-colors',
        active && 'bg-white/15 ring-2 ring-yellow-300',
      )}
    >
      <div className="flex h-[calc(var(--card-h)*0.42)] items-center" aria-hidden>
        {Array.from({ length: shown }, (_, i) => (
          <PlayingCard
            key={i}
            size="xs"
            style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.3)' }}
          />
        ))}
      </div>
      <p className="max-w-28 truncate text-sm font-semibold">{name}</p>
      <p className="text-xs text-white/80">
        {cardCount} {cardCount === 1 ? 'Karte' : 'Karten'}
        {detail && <> · {detail}</>}
      </p>
    </section>
  )
}
