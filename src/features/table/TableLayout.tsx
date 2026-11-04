import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TableLayoutProps {
  readonly opponents: ReactNode
  readonly center: ReactNode
  readonly status: ReactNode
  readonly hand: ReactNode
}

/**
 * Mobile-first table layout: opponents on top, play area in the middle (grows), status line and
 * the player's hand at the bottom within thumb reach and above the home indicator.
 */
export function TableLayout({ opponents, center, status, hand }: TableLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-safe pb-safe">
      <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-1 pt-2 sm:gap-x-8">
        {opponents}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-2">{center}</div>
      <div className="min-h-6 px-2 pb-1 text-center text-sm text-white" aria-live="polite">
        {status}
      </div>
      <div className="pb-3">{hand}</div>
    </div>
  )
}

interface DropZoneProps {
  readonly active: boolean
  readonly label: string
  readonly children: ReactNode
}

/** Central play area; highlighted while a card is being dragged. */
export const DropZone = forwardRef<HTMLDivElement, DropZoneProps>(function DropZone(
  { active, label, children },
  ref,
) {
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className={cn(
        'flex min-h-[calc(var(--card-h)*1.25)] w-full max-w-xl items-center justify-center gap-2 rounded-3xl border-2 border-transparent p-3 transition-colors sm:gap-4',
        active && 'border-dashed border-yellow-300/80 bg-white/10',
      )}
    >
      {children}
    </div>
  )
})
