import { motion } from 'framer-motion'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import type { Card, CardId } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { cn } from '@/lib/utils'
import { cardSpacing, handRows } from './handLayout'

/**
 * Space above the hand so a lifted (selected) card does not cover buttons right above it. Not on
 * short screens (phones in landscape) – they have no height to spare.
 */
export const LIFT_CLEARANCE = '[@media(min-height:600px)]:mb-[calc(var(--card-h)*0.22)]'

export interface HandProps {
  readonly cards: readonly Card[]
  /** Whether the player may act right now. */
  readonly enabled: boolean
  /** Restricts which cards can be played. Default: all. */
  readonly isPlayable?: (card: Card) => boolean
  readonly onPlay: (card: Card) => void
  /** Dropping a dragged card inside this element plays it. */
  readonly dropTarget?: RefObject<HTMLElement | null>
  readonly onDragActiveChange?: (active: boolean) => void
  /**
   * Choosing cards instead of playing them (e.g. passing three cards in Hearts): a tap toggles
   * the card, chosen cards are lifted. Dragging is off in this mode.
   */
  readonly selection?: {
    readonly selectedIds: ReadonlySet<CardId>
    readonly onToggle: (card: Card) => void
  }
  /** Cards to point out, e.g. the ones just received. */
  readonly highlightIds?: ReadonlySet<CardId>
}

function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

const inside = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

/**
 * The player's hand. Mouse/keyboard: click plays. Touch: first tap lifts the card, second tap
 * plays it (prevents accidental plays). Cards can also be dragged onto `dropTarget`.
 */
export function Hand({
  cards,
  enabled,
  isPlayable = () => true,
  onPlay,
  dropTarget,
  onDragActiveChange,
  selection,
  highlightIds,
}: HandProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const containerWidth = useElementWidth(containerRef)
  const cardWidth = useElementWidth(probeRef)
  const [selectedId, setSelectedId] = useState<CardId | null>(null)
  const pointerType = useRef<string>('mouse')
  const dragged = useRef(false)

  // Layout animations only once real sizes are known, so cards do not slide in from x = 0.
  const measured = cardWidth > 0
  const rows =
    handRows(cards.length, containerWidth, cardWidth) === 2
      ? [cards.slice(0, Math.ceil(cards.length / 2)), cards.slice(Math.ceil(cards.length / 2))]
      : [cards]
  const selected = enabled && cards.some((c) => c.id === selectedId) ? selectedId : null

  const play = (card: Card) => {
    setSelectedId(null)
    onPlay(card)
  }

  return (
    <div
      ref={containerRef}
      // isolate: the cards' z-indices stay inside the hand and never cover dialogs.
      className="relative isolate w-full"
      role="group"
      aria-label="Deine Karten"
    >
      {/* Invisible probe to measure the current card width (it depends on the viewport). */}
      <div
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute w-(--card-w)"
      />
      {rows.map((row, rowIndex) => {
        const spacing = cardSpacing(row.length, containerWidth, cardWidth)
        return (
          <div
            key={rowIndex}
            className="flex justify-center first:pt-[calc(var(--card-h)*0.22)]"
            // The front row covers the lower part of the back row; corner indices stay visible.
            style={rowIndex > 0 ? { marginTop: 'calc(var(--card-h) * -0.55)' } : undefined}
          >
            {row.map((card, index) => {
              const playable = enabled && isPlayable(card)
              const isSelected = selection
                ? selection.selectedIds.has(card.id)
                : card.id === selected
              return (
                <motion.button
                  key={card.id}
                  type="button"
                  layout={measured}
                  layoutId={measured ? card.id : undefined}
                  aria-pressed={isSelected}
                  aria-disabled={!playable}
                  className={cn(
                    'relative shrink-0 rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300',
                    playable ? 'cursor-pointer' : 'cursor-default',
                    enabled && !playable && 'brightness-75',
                  )}
                  style={{
                    marginLeft: index === 0 ? 0 : spacing - cardWidth,
                    // A lifted card comes to the front so the second tap always hits it. Not when choosing
                    // several cards: then the neighbours must stay tappable.
                    zIndex: isSelected && !selection ? 500 : rowIndex * 100 + index,
                  }}
                  animate={{ y: isSelected ? '-22%' : 0 }}
                  whileHover={playable ? { y: isSelected ? '-22%' : '-8%' } : undefined}
                  drag={playable && !selection}
                  dragSnapToOrigin
                  dragMomentum={false}
                  whileDrag={{ scale: 1.08, zIndex: 100 }}
                  onPointerDown={(event) => {
                    pointerType.current = event.pointerType
                  }}
                  onDragStart={() => {
                    dragged.current = true
                    onDragActiveChange?.(true)
                  }}
                  onDragEnd={(_, info) => {
                    onDragActiveChange?.(false)
                    const rect = dropTarget?.current?.getBoundingClientRect()
                    const x = info.point.x - window.scrollX
                    const y = info.point.y - window.scrollY
                    if (rect && inside(rect, x, y)) play(card)
                  }}
                  onClick={(event) => {
                    if (dragged.current) {
                      dragged.current = false
                      return
                    }
                    if (!playable) return
                    if (selection) {
                      selection.onToggle(card)
                      return
                    }
                    const direct = event.detail === 0 || pointerType.current === 'mouse'
                    if (direct || isSelected) play(card)
                    else setSelectedId(card.id)
                  }}
                >
                  <PlayingCard
                    card={card}
                    className={cn(
                      isSelected && 'ring-4 ring-yellow-300',
                      !isSelected && highlightIds?.has(card.id) && 'ring-4 ring-sky-300',
                    )}
                  />
                </motion.button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
