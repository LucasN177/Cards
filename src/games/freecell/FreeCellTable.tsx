import { type CSSProperties, useRef, useState } from 'react'
import { deepEqual, type GameSession, SUITS, type Suit } from '@/engine'
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
import { boardLayout } from '@/features/solitaire/layout'
import { playSound } from '@/features/sound/sound'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  bestFreeCellMove,
  CELL_COUNT,
  type FreeCellAction,
  type FreeCellOptions,
  type FreeCellSource,
  type FreeCellState,
  type FreeCellTarget,
  type FreeCellView,
  PILE_COUNT,
} from './freecell'

type FreeCellSession = GameSession<FreeCellState, FreeCellAction, FreeCellOptions, FreeCellView>
const GAP = 5

const parseDrop = (key: string): FreeCellTarget => {
  const [zone, value] = key.split(':')
  if (zone === 'foundation') return { zone: 'foundation', suit: value as Suit }
  if (zone === 'cell') return { zone: 'cell', index: Number(value) }
  return { zone: 'tableau', pile: Number(value) }
}

const targetKey = (to: FreeCellTarget) =>
  to.zone === 'foundation'
    ? `foundation:${to.suit}`
    : to.zone === 'cell'
      ? `cell:${to.index}`
      : `tableau:${to.pile}`

export default function FreeCellTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as FreeCellSession
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

  const view = session.view(humanId)
  const legal = session.legalActions(humanId)
  const over = session.isOver
  const { landscape, cardWidth, cardHeight } = boardLayout(root.width || 360, root.height || 640, {
    columns: PILE_COUNT,
    gap: GAP,
    sideColumns: 2,
    sideRows: 4,
    tallness: 5.6,
  })
  const dispatch = (action: FreeCellAction) => session.dispatch(humanId, action)

  const hint = hintTimer.active && !over ? view.hint : null
  let hintCard: string | null = null
  if (hint) {
    const { from } = hint
    if (from.zone === 'cell') hintCard = view.cells[from.index]?.id ?? null
    else if (from.zone === 'foundation') hintCard = view.foundations[from.suit].at(-1)?.id ?? null
    else hintCard = view.tableau[from.pile]![from.index]?.id ?? null
  }
  const hintTarget = hint ? targetKey(hint.to) : null

  const handlers: CardHandlers<FreeCellSource> = {
    interactive: !over,
    flash,
    hintCard,
    hintTarget,
    onTap(from, cardId) {
      const move = bestFreeCellMove(legal, from, view)
      if (move) dispatch(move)
      else flashCard(cardId)
    },
    onDrop(from, x, y) {
      const key = drops.find(x, y)
      if (!key) return
      const action: FreeCellAction = { type: 'move', from, to: parseDrop(key) }
      if (legal.some((a) => deepEqual(a, action))) dispatch(action)
      // Any empty cell is as good as the first one the rules offer.
      else if (action.to.zone === 'cell' && view.cells[action.to.index] === null) {
        const anyCell = legal.find(
          (a) => a.type === 'move' && a.to.zone === 'cell' && deepEqual(a.from, from),
        )
        if (anyCell) dispatch({ type: 'move', from, to: action.to })
      }
    },
    onDragZone: setDragZone,
  }

  const vars = { '--card-w': `${cardWidth}px`, '--card-h': `${cardHeight}px` } as CSSProperties

  const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
    const card = view.cells[index]
    const key = `cell:${index}`
    return (
      <div
        key={key}
        ref={drops.register(key)}
        role="group"
        aria-label={`Freie Zelle ${index + 1}${card ? '' : ' (leer)'}`}
        className={cn(
          'relative h-(--card-h) w-(--card-w) rounded-[7%]',
          hintTarget === key && 'ring-4 ring-yellow-300/80',
        )}
      >
        <EmptySlot className="absolute inset-0 border-solid border-white/20 bg-black/10" />
        {card && (
          <div className="absolute inset-0">
            <LooseCard card={card} from={{ zone: 'cell', index }} zone="top" handlers={handlers} />
          </div>
        )}
      </div>
    )
  })

  const foundations = SUITS.map((suit) => {
    const top = view.foundations[suit].at(-1)
    const key = `foundation:${suit}`
    return (
      <div
        key={suit}
        ref={drops.register(key)}
        role="group"
        aria-label={`Ablage ${suit}: ${view.foundations[suit].length} Karten`}
        className={cn(
          'relative h-(--card-h) w-(--card-w) rounded-[7%]',
          hintTarget === key && 'ring-4 ring-yellow-300/80',
        )}
      >
        <EmptySlot className="absolute inset-0">
          <svg viewBox="0 0 100 100" className="size-1/2 opacity-40" aria-hidden>
            <SuitSymbol suit={suit} style={deckStyle} x={0} y={0} size={100} />
          </svg>
        </EmptySlot>
        {top && (
          <div className="absolute inset-0">
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
      className="grid min-h-0 flex-1"
      style={{
        gap: GAP,
        gridTemplateColumns: `repeat(${PILE_COUNT}, ${cardWidth}px)`,
        zIndex: dragZone === 'tableau' ? 20 : undefined,
      }}
    >
      {view.tableau.map((pile, index) => (
        <TableauPile<FreeCellSource>
          key={index}
          label={`Reihe ${index + 1}`}
          dropKey={`tableau:${index}`}
          hidden={0}
          cards={pile}
          sourceAt={(k) => ({ zone: 'tableau', pile: index, index: k })}
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
          <div className="relative flex flex-col" style={{ gap: GAP, ...topZone }}>
            {cells}
          </div>
          <div className="flex min-h-0 flex-col">{piles}</div>
          <div className="relative flex flex-col" style={{ gap: GAP, ...topZone }}>
            {foundations}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center" style={{ gap: GAP }}>
          <div
            className="relative grid"
            style={{ gap: GAP, gridTemplateColumns: `repeat(8, ${cardWidth}px)`, ...topZone }}
          >
            {cells}
            {foundations}
          </div>
          {piles}
        </div>
      )}
      <SolitaireStatus
        info={
          <>
            Züge: {view.moves} · Bis zu {view.maxRun} Karten am Stück
          </>
        }
        over={over}
        stuck={view.stuck}
        canHint={view.hint !== null}
        onHint={hintTimer.show}
        onResign={() => dispatch({ type: 'resign' })}
      />
    </div>
  )
}
