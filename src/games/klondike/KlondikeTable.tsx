import { motion, useMotionValue } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { deepEqual, type GameSession, SUITS, type Suit, type SuitedCard } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { SuitSymbol } from '@/features/cards/SuitSymbol'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  bestMove,
  canAutoFinish,
  type KlondikeAction,
  type KlondikeOptions,
  type KlondikeState,
  type KlondikeView,
  nextFoundationMove,
  type Source,
  type Target,
} from './klondike'
import { klondikeLayout, pileOffsets } from './layout'

type KlondikeSession = GameSession<KlondikeState, KlondikeAction, KlondikeOptions, KlondikeView>
type DragZone = 'top' | 'tableau' | null

// --- Layout ------------------------------------------------------------------------------------

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

const parseDrop = (key: string): Target => {
  const [zone, value] = key.split(':')
  return zone === 'foundation'
    ? { zone: 'foundation', suit: value as Suit }
    : { zone: 'tableau', pile: Number(value) }
}

// --- Pieces ------------------------------------------------------------------------------------

function EmptySlot({ children, className }: { children?: React.ReactNode; className?: string }) {
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

interface CardHandlers {
  readonly interactive: boolean
  readonly flash: string | null
  readonly onTap: (from: Source, cardId: string) => void
  readonly onDrop: (from: Source, x: number, y: number) => void
  readonly onDragZone: (zone: DragZone) => void
}

/** A single draggable / tappable card (waste top, foundation top). */
function LooseCard({
  card,
  from,
  zone,
  handlers,
  tapToMove = true,
}: {
  card: SuitedCard
  from: Source
  zone: DragZone
  handlers: CardHandlers
  tapToMove?: boolean
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
        className={cn(handlers.flash === card.id && 'ring-4 ring-red-400')}
      />
    </motion.button>
  )
}

function TableauPile({
  index,
  pile,
  cardHeight,
  areaHeight,
  handlers,
  registerDrop,
}: {
  index: number
  pile: KlondikeView['tableau'][number]
  cardHeight: number
  areaHeight: number
  handlers: CardHandlers
  registerDrop: (key: string) => (element: HTMLElement | null) => void
}) {
  const style = useSettings((s) => s.deckStyle)
  // Shared offsets: dragging a card moves every card lying on top of it.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [runStart, setRunStart] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragged = useRef(false)
  const { down, up } = pileOffsets(pile.hidden, pile.cards.length, cardHeight, areaHeight)

  return (
    <div
      ref={registerDrop(`tableau:${index}`)}
      role="group"
      aria-label={`Reihe ${index + 1}`}
      className="relative h-full"
      style={{ zIndex: dragging ? 20 : undefined }}
    >
      {pile.hidden === 0 && pile.cards.length === 0 && <EmptySlot className="text-xs">K</EmptySlot>}
      {Array.from({ length: pile.hidden }, (_, i) => (
        <PlayingCard
          key={`hidden-${i}`}
          faceDown
          className="absolute left-0"
          style={{ top: i * down }}
        />
      ))}
      {pile.cards.map((card, k) => {
        const from: Source = { zone: 'tableau', pile: index, index: pile.hidden + k }
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
              top: pile.hidden * down + k * up,
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
              className={cn(handlers.flash === card.id && 'ring-4 ring-red-400')}
            />
          </motion.button>
        )
      })}
    </div>
  )
}

// --- Table -------------------------------------------------------------------------------------

export default function KlondikeTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as KlondikeSession
  const version = useSessionVersion(session)
  const deckStyle = useSettings((s) => s.deckStyle)
  const rootRef = useRef<HTMLDivElement>(null)
  const tableauRef = useRef<HTMLDivElement>(null)
  const root = useSize(rootRef)
  const tableau = useSize(tableauRef)
  const drops = useRef(new Map<string, HTMLElement>())
  const [flash, setFlash] = useState<string | null>(null)
  const [dragZone, setDragZone] = useState<DragZone>(null)
  const [autoFinishing, setAutoFinishing] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)

  const view = session.view(humanId)
  const legal = session.legalActions(humanId)
  const over = session.isOver
  // Until the first measurement (and in tests without layout) assume a phone-sized table.
  const { landscape, cardWidth, cardHeight } = klondikeLayout(root.width || 360, root.height || 640)

  const registerDrop = (key: string) => (element: HTMLElement | null) => {
    if (element) drops.current.set(key, element)
    else drops.current.delete(key)
  }
  const dispatch = (action: KlondikeAction) => session.dispatch(humanId, action)

  const handlers: CardHandlers = {
    interactive: !over && !autoFinishing,
    flash,
    onTap(from, cardId) {
      const move = bestMove(view, legal, from)
      if (move) dispatch(move)
      else {
        setFlash(cardId)
        setTimeout(() => setFlash(null), 450)
      }
    },
    onDrop(from, x, y) {
      for (const [key, element] of drops.current) {
        const rect = element.getBoundingClientRect()
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
        const action: KlondikeAction = { type: 'move', from, to: parseDrop(key) }
        if (legal.some((a) => deepEqual(a, action))) dispatch(action)
        return
      }
    },
    onDragZone: setDragZone,
  }

  // Automatic finish: put the remaining cards on the foundations one by one.
  const finishMove = autoFinishing && !over ? nextFoundationMove(legal) : null
  useEffect(() => {
    if (!finishMove) return
    const timer = setTimeout(() => session.dispatch(humanId, finishMove), 110)
    return () => clearTimeout(timer)
  }, [finishMove, session, humanId, version])

  const vars = {
    '--card-w': `${cardWidth}px`,
    '--card-h': `${cardHeight}px`,
  } as CSSProperties

  const wasteShown = view.waste.slice(view.options.drawCount === 3 ? -3 : -1)
  const stock = (
    <button
      type="button"
      onClick={() => dispatch({ type: 'draw' })}
      disabled={over || autoFinishing || (view.stockCount === 0 && view.waste.length === 0)}
      aria-label={
        view.stockCount > 0
          ? `Stapel: ${view.stockCount} Karten, aufdecken`
          : 'Ablage zurück auf den Stapel legen'
      }
      className="relative rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
    >
      {view.stockCount > 0 ? (
        <>
          <PlayingCard faceDown aria-hidden />
          <span className="absolute -right-1 -bottom-1 rounded-full bg-black/70 px-1.5 text-[10px] font-semibold text-white tabular-nums">
            {view.stockCount}
          </span>
        </>
      ) : (
        <EmptySlot>{view.waste.length > 0 && <RotateCcw className="size-5" />}</EmptySlot>
      )}
    </button>
  )

  const waste = (
    <div
      className="relative h-(--card-h)"
      style={{ width: `calc(var(--card-w) * ${1 + (wasteShown.length - 1) * 0.3})` }}
      role="group"
      aria-label="Ablage"
    >
      {wasteShown.length === 0 && <EmptySlot />}
      {wasteShown.map((card, i) => {
        const isTop = i === wasteShown.length - 1
        return (
          <div
            key={card.id}
            className="absolute top-0"
            style={{ left: `calc(var(--card-w) * ${i * 0.3})` }}
          >
            {isTop ? (
              <LooseCard card={card} from={{ zone: 'waste' }} zone="top" handlers={handlers} />
            ) : (
              <PlayingCard card={card} topIndex layoutId={card.id} />
            )}
          </div>
        )
      })}
    </div>
  )

  const foundations = SUITS.map((suit) => {
    const top = view.foundations[suit].at(-1)
    return (
      <div
        key={suit}
        ref={registerDrop(`foundation:${suit}`)}
        role="group"
        aria-label={`Ablage ${suit}: ${view.foundations[suit].length} Karten`}
        className="relative h-(--card-h) w-(--card-w)"
      >
        <EmptySlot className="absolute inset-0">
          <svg viewBox="0 0 100 100" className="size-1/2 opacity-40" aria-hidden>
            <SuitSymbol suit={suit} style={deckStyle} x={0} y={0} size={100} />
          </svg>
        </EmptySlot>
        {top && (
          <div className="absolute inset-0">
            {/* Tapping a foundation card would move it back by accident; it can be dragged. */}
            <LooseCard
              key={top.id}
              card={top}
              from={{ zone: 'foundation', suit }}
              zone="top"
              handlers={handlers}
              tapToMove={false}
            />
          </div>
        )}
      </div>
    )
  })

  const piles = (
    <div
      ref={tableauRef}
      className="grid min-h-0 flex-1 gap-1.5"
      style={{
        gridTemplateColumns: `repeat(7, ${cardWidth}px)`,
        zIndex: dragZone === 'tableau' ? 20 : undefined,
      }}
    >
      {view.tableau.map((pile, index) => (
        <TableauPile
          key={index}
          index={index}
          pile={pile}
          cardHeight={cardHeight}
          areaHeight={tableau.height}
          handlers={handlers}
          registerDrop={registerDrop}
        />
      ))}
    </div>
  )

  const topZone = { zIndex: dragZone === 'top' ? 30 : 10 }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col pt-2 px-safe pb-safe" style={vars}>
      {landscape ? (
        <div className="flex min-h-0 flex-1 justify-center gap-3">
          <div className="relative flex flex-col gap-1.5" style={topZone}>
            {stock}
            {waste}
          </div>
          <div className="flex min-h-0 flex-col">{piles}</div>
          <div className="relative flex flex-col gap-1.5" style={topZone}>
            {foundations}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5">
          <div
            className="relative grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(7, ${cardWidth}px)`, ...topZone }}
          >
            <div>{stock}</div>
            <div className="col-span-2">{waste}</div>
            {foundations}
          </div>
          {piles}
        </div>
      )}
      {view.stuck && !over && (
        <div
          role="status"
          className="mx-auto mt-2 flex w-full max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-black/40 px-4 py-2.5 text-center text-sm text-white"
        >
          <p>
            <strong>Keine sinnvollen Züge mehr.</strong> Nimm Züge zurück oder gib auf.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => dispatch({ type: 'resign' })}
          >
            Aufgeben
          </Button>
        </div>
      )}
      <div
        className="flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1 text-sm text-white"
        aria-live="polite"
      >
        <span className="text-white/80 tabular-nums">
          Züge: {view.moves}
          {view.recycles > 0 && ` · Durchgänge: ${view.recycles}`}
        </span>
        {canAutoFinish(view) && !autoFinishing && (
          <Button
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => setAutoFinishing(true)}
          >
            Automatisch ablegen
          </Button>
        )}
        {!over &&
          !view.stuck &&
          (confirmResign ? (
            <span className="flex items-center gap-2">
              Wirklich aufgeben?
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={() => dispatch({ type: 'resign' })}
              >
                Ja
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setConfirmResign(false)}
              >
                Nein
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-white hover:bg-white/15 hover:text-white"
              onClick={() => setConfirmResign(true)}
            >
              Aufgeben
            </Button>
          ))}
      </div>
    </div>
  )
}
