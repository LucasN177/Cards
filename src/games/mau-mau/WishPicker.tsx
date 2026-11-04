import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { type Suit, SUITS } from '@/engine'
import { suitName } from '@/features/cards/cardFaces'
import { SuitSymbol } from '@/features/cards/SuitSymbol'
import { useSettings } from '@/stores/settingsStore'

interface WishPickerProps {
  readonly onWish: (suit: Suit) => void
  readonly onCancel: () => void
}

/** Bottom sheet (thumb reach on phones) to choose the suit wished with a jack. */
export function WishPicker({ onWish, onCancel }: WishPickerProps) {
  const style = useSettings((s) => s.deckStyle)
  const firstRef = useRef<HTMLButtonElement>(null)
  useEffect(() => firstRef.current?.focus(), [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wish-title"
        className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <h2 id="wish-title" className="text-center text-lg font-semibold">
          Welche Farbe wünschst du dir?
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {SUITS.map((suit, i) => (
            <button
              key={suit}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onWish(suit)}
              className="flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-base font-medium outline-none hover:bg-accent focus-visible:border-primary"
            >
              <svg viewBox="0 0 100 100" className="size-8" aria-hidden>
                <SuitSymbol suit={suit} style={style} x={0} y={0} size={100} />
              </svg>
              {suitName(suit, style)}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="h-11 w-full" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}
