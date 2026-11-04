import { motion, useMotionValue } from 'framer-motion'
import { Lightbulb } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Card } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { pileOffsets } from './layout'

/** Building blocks shared by the solitaire tables (Klondike, FreeCell, Spider). */

export type DragZone = 'top' | 'tableau' | null

export function EmptySlot({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-(--card-h) w-(--card-w) items-center justify-center rounded-[7%] border-2 border-dashed border-white/30 text-white/50',
        className,
      )}
    >
      {children}
    </div>
  )
}

export interface CardHandlers<S> {
  readonly interactive: boolean
  /** Card that briefly flashes red because it has nowhere to go. */
  readonly flash: string | null
  /** Hint: card to move and the key of its target. */
  readonly hintCard: string | null
  readonly hintTarget: string | null
  readonly onTap: (from: S, cardId: string) => void
  readonly onDrop: (from: S, x: number, y: number) => void
  readonly onDragZone: (zone: DragZone) => void
}

const cardClasses = (handlers: CardHandlers<unknown>, card: Card, extra?: string | false) =>
  cn(
    handlers.flash === card.id && 'ring-4 ring-red-400',
    handlers.hintCard === card.id && 'animate-pulse ring-4 ring-yellow-300',
    extra,
  )

/** A single draggable / tappable card (waste top, cell, foundation top). */
export function LooseCard<S>({
  card,
  from,
  zone,
  handlers,
  tapToMove = true,
  targeted = false,
}: {
  card: Card
  from: S
  zone: DragZone
  handlers: CardHandlers<S>
  tapToMove?: boolean
  targeted?: boolean
}) {
  const style = useSettings((s) => s.deckStyle)
  const dragged = useRef(false)
  return (
    <motion.button
      type="button"
      layoutId={card.id}
      aria-label={cardName(card, style)}
      disabled={!handlers.interactive}
      className="relative rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
      drag={handlers.interactive}
      dragSnapToOrigin
      dragMomentum={false}
      whileDrag={{ scale: 1.06, zIndex: 100 }}
      onDragStart={() => {
        dragged.current = true
        handlers.onDragZone(zone)
      }}
      onDragEnd={(_, info) =>
        handlers.onDrop(from, info.point.x - window.scrollX, info.point.y - window.scrollY)
      }
      onDragTransitionEnd={() => handlers.onDragZone(null)}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        if (tapToMove) handlers.onTap(from, card.id)
      }}
    >
      <PlayingCard
        card={card}
        topIndex
        className={cardClasses(
          handlers as CardHandlers<unknown>,
          card,
          targeted && 'ring-4 ring-yellow-300/80',
        )}
      />
    </motion.button>
  )
}

/**
 * A tableau pile: face-down cards, then face-up cards fanned downwards. Dragging a face-up card
 * moves every card on top of it as well (they share the drag offset).
 */
export function TableauPile<S>({
  label,
  dropKey,
  hidden,
  cards,
  sourceAt,
  emptyLabel,
  cardHeight,
  areaHeight,
  handlers,
  registerDrop,
}: {
  label: string
  dropKey: string
  hidden: number
  cards: readonly Card[]
  /** Move source for the face-up card at position `k` (0 = lowest face-up card). */
  sourceAt: (k: number) => S
  emptyLabel?: string
  cardHeight: number
  areaHeight: number
  handlers: CardHandlers<S>
  registerDrop: (key: string) => (element: HTMLElement | null) => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [runStart, setRunStart] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragged = useRef(false)
  const { down, up } = pileOffsets(hidden, cards.length, cardHeight, areaHeight)
  // Hint target: mark where the card would land (top card or the empty pile).
  const targeted = handlers.hintTarget === dropKey

  return (
    <div
      ref={registerDrop(dropKey)}
      role="group"
      aria-label={label}
      className="relative h-full"
      style={{ zIndex: dragging ? 20 : undefined }}
    >
      {hidden === 0 && cards.length === 0 && (
        <EmptySlot className={cn('text-xs', targeted && 'ring-4 ring-yellow-300/80')}>
          {emptyLabel}
        </EmptySlot>
      )}
      {Array.from({ length: hidden }, (_, i) => (
        <PlayingCard
          key={`hidden-${i}`}
          faceDown
          className="absolute left-0"
          style={{ top: i * down }}
        />
      ))}
      {cards.map((card, k) => {
        const from = sourceAt(k)
        const moving = runStart !== null && k >= runStart
        return (
          <motion.button
            key={card.id}
            type="button"
            layoutId={card.id}
            aria-label={cardName(card, style)}
            disabled={!handlers.interactive}
            className="absolute left-0 rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
            style={{
              top: hidden * down + k * up,
              zIndex: moving && dragging ? 100 + k : k,
              ...(moving ? { x, y } : {}),
            }}
            drag={handlers.interactive}
            dragSnapToOrigin
            dragMomentum={false}
            onPointerDown={() => setRunStart(k)}
            onDragStart={() => {
              dragged.current = true
              setDragging(true)
              handlers.onDragZone('tableau')
            }}
            onDragEnd={(_, info) =>
              handlers.onDrop(from, info.point.x - window.scrollX, info.point.y - window.scrollY)
            }
            onDragTransitionEnd={() => {
              setDragging(false)
              handlers.onDragZone(null)
            }}
            onClick={() => {
              if (dragged.current) {
                dragged.current = false
                return
              }
              handlers.onTap(from, card.id)
            }}
          >
            <PlayingCard
              card={card}
              topIndex
              className={cardClasses(
                handlers as CardHandlers<unknown>,
                card,
                targeted && k === cards.length - 1 && 'ring-4 ring-yellow-300/80',
              )}
            />
          </motion.button>
        )
      })}
    </div>
  )
}

const ghost = 'h-9 text-white hover:bg-white/15 hover:text-white'

/** Status line: move counter, game-specific buttons, hint, give up (with confirmation). */
export function SolitaireStatus({
  info,
  over,
  stuck,
  canHint,
  onHint,
  onResign,
  children,
}: {
  info: ReactNode
  over: boolean
  stuck: boolean
  canHint: boolean
  onHint: () => void
  onResign: () => void
  children?: ReactNode
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      {stuck && !over && (
        <div
          role="status"
          className="mx-auto mt-2 flex w-full max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-black/40 px-4 py-2.5 text-center text-sm text-white"
        >
          <p>
            <strong>Keine sinnvollen Züge mehr.</strong> Nimm Züge zurück oder gib auf.
          </p>
          <Button size="sm" variant="secondary" className="h-9" onClick={onResign}>
            Aufgeben
          </Button>
        </div>
      )}
      <div
        className="flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1 text-sm text-white"
        aria-live="polite"
      >
        <span className="text-white/80 tabular-nums">{info}</span>
        {children}
        {!over && !stuck && (
          <Button size="sm" variant="ghost" className={ghost} onClick={onHint} disabled={!canHint}>
            <Lightbulb /> Tipp
          </Button>
        )}
        {!over &&
          !stuck &&
          (confirm ? (
            <span className="flex items-center gap-2">
              Wirklich aufgeben?
              <Button size="sm" variant="destructive" className="h-9" onClick={onResign}>
                Ja
              </Button>
              <Button size="sm" variant="ghost" className={ghost} onClick={() => setConfirm(false)}>
                Nein
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className={ghost} onClick={() => setConfirm(true)}>
              Aufgeben
            </Button>
          ))}
      </div>
    </>
  )
}
