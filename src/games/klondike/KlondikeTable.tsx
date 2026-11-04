import { RotateCcw } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { deepEqual, type GameSession, SUITS, type Suit } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { SuitSymbol } from '@/features/cards/SuitSymbol'
import {
  type CardHandlers,
  type DragZone,
  EmptySlot,
  LooseCard,
  SolitaireStatus,
  TableauPile,
} from '@/features/solitaire/board'
import { useDropZones, useFlash, useHintTimer, useSize } from '@/features/solitaire/hooks'
import { playSound } from '@/features/sound/sound'
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
import { klondikeLayout } from './layout'

type KlondikeSession = GameSession<KlondikeState, KlondikeAction, KlondikeOptions, KlondikeView>

const parseDrop = (key: string): Target => {
  const [zone, value] = key.split(':')
  return zone === 'foundation'
    ? { zone: 'foundation', suit: value as Suit }
    : { zone: 'tableau', pile: Number(value) }
}

export default function KlondikeTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as KlondikeSession
  const version = useSessionVersion(session)
  const deckStyle = useSettings((s) => s.deckStyle)
  const rootRef = useRef<HTMLDivElement>(null)
  const tableauRef = useRef<HTMLDivElement>(null)
  const root = useSize(rootRef)
  const tableau = useSize(tableauRef)
  const drops = useDropZones()
  const { flash, trigger: flashCard } = useFlash(() => playSound('invalid'))
  const hintTimer = useHintTimer(version)
  const [dragZone, setDragZone] = useState<DragZone>(null)
  const [autoFinishing, setAutoFinishing] = useState(false)

  const view = session.view(humanId)
  const legal = session.legalActions(humanId)
  const over = session.isOver
  // Until the first measurement (and in tests without layout) assume a phone-sized table.
  const { landscape, cardWidth, cardHeight } = klondikeLayout(root.width || 360, root.height || 640)
  const dispatch = (action: KlondikeAction) => session.dispatch(humanId, action)

  const activeHint = hintTimer.active && !over ? view.hint : null
  let hintCard: string | null = null
  let hintTarget: string | null = null
  if (activeHint?.type === 'draw') hintTarget = 'stock'
  else if (activeHint?.type === 'move') {
    const { from, to } = activeHint
    if (from.zone === 'waste') hintCard = view.waste.at(-1)?.id ?? null
    else if (from.zone === 'foundation') hintCard = view.foundations[from.suit].at(-1)?.id ?? null
    else {
      const pile = view.tableau[from.pile]!
      hintCard = pile.cards[from.index - pile.hidden]?.id ?? null
    }
    hintTarget = to.zone === 'foundation' ? `foundation:${to.suit}` : `tableau:${to.pile}`
  }

  const handlers: CardHandlers<Source> = {
    interactive: !over && !autoFinishing,
    hintCard,
    hintTarget,
    flash,
    onTap(from, cardId) {
      const move = bestMove(view, legal, from)
      if (move) dispatch(move)
      else flashCard(cardId)
    },
    onDrop(from, x, y) {
      const key = drops.find(x, y)
      if (!key) return
      const action: KlondikeAction = { type: 'move', from, to: parseDrop(key) }
      if (legal.some((a) => deepEqual(a, action))) dispatch(action)
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

  const vars = { '--card-w': `${cardWidth}px`, '--card-h': `${cardHeight}px` } as CSSProperties

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
      className={cn(
        'relative rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300',
        hintTarget === 'stock' && 'animate-pulse ring-4 ring-yellow-300',
      )}
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
      {wasteShown.map((card, i) => (
        <div
          key={card.id}
          className="absolute top-0"
          style={{ left: `calc(var(--card-w) * ${i * 0.3})` }}
        >
          {i === wasteShown.length - 1 ? (
            <LooseCard card={card} from={{ zone: 'waste' }} zone="top" handlers={handlers} />
          ) : (
            <PlayingCard card={card} topIndex layoutId={card.id} />
          )}
        </div>
      ))}
    </div>
  )

  const foundations = SUITS.map((suit) => {
    const top = view.foundations[suit].at(-1)
    return (
      <div
        key={suit}
        ref={drops.register(`foundation:${suit}`)}
        role="group"
        aria-label={`Ablage ${suit}: ${view.foundations[suit].length} Karten`}
        className={cn(
          'relative h-(--card-h) w-(--card-w) rounded-[7%]',
          hintTarget === `foundation:${suit}` && 'ring-4 ring-yellow-300/80',
        )}
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
        <TableauPile<Source>
          key={index}
          label={`Reihe ${index + 1}`}
          dropKey={`tableau:${index}`}
          hidden={pile.hidden}
          cards={pile.cards}
          sourceAt={(k) => ({ zone: 'tableau', pile: index, index: pile.hidden + k })}
          emptyLabel="K"
          cardHeight={cardHeight}
          areaHeight={tableau.height}
          handlers={handlers}
          registerDrop={drops.register}
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
      <SolitaireStatus
        info={
          <>
            Züge: {view.moves}
            {view.recycles > 0 && ` · Durchgänge: ${view.recycles}`}
          </>
        }
        over={over}
        stuck={view.stuck}
        canHint={view.hint !== null && !autoFinishing}
        onHint={hintTimer.show}
        onResign={() => dispatch({ type: 'resign' })}
      >
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
      </SolitaireStatus>
    </div>
  )
}
