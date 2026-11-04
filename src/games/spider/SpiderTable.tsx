import { type CSSProperties, useRef, useState } from 'react'
import { deepEqual, type GameSession, suitedCard } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import {
  type CardHandlers,
  type DragZone,
  EmptySlot,
  SolitaireStatus,
  TableauPile,
} from '@/features/solitaire/board'
import { useDropZones, useFlash, useHintTimer, useSize } from '@/features/solitaire/hooks'
import { boardLayout } from '@/features/solitaire/layout'
import { playSound } from '@/features/sound/sound'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { cn } from '@/lib/utils'
import {
  bestSpiderMove,
  PILE_COUNT,
  RUNS_TO_WIN,
  type SpiderAction,
  type SpiderOptions,
  type SpiderSource,
  type SpiderState,
  type SpiderView,
} from './spider'

type SpiderSession = GameSession<SpiderState, SpiderAction, SpiderOptions, SpiderView>
const GAP = 4

export default function SpiderTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as SpiderSession
  const version = useSessionVersion(session)
  const rootRef = useRef<HTMLDivElement>(null)
  const tableauRef = useRef<HTMLDivElement>(null)
  const root = useSize(rootRef)
  const tableau = useSize(tableauRef)
  const drops = useDropZones()
  const { flash, trigger: flashCard } = useFlash(() => playSound('invalid'))
  const hintTimer = useHintTimer(version)
  const [dragZone, setDragZone] = useState<DragZone>(null)
  const [dealBlocked, setDealBlocked] = useState(false)

  const view = session.view(humanId)
  const legal = session.legalActions(humanId)
  const over = session.isOver
  const { landscape, cardWidth, cardHeight } = boardLayout(root.width || 360, root.height || 640, {
    columns: PILE_COUNT,
    gap: GAP,
    sideColumns: 2,
    sideRows: 3,
    tallness: 6.2,
  })
  const dispatch = (action: SpiderAction) => session.dispatch(humanId, action)

  const hint = hintTimer.active && !over ? view.hint : null
  let hintCard: string | null = null
  let hintTarget: string | null = null
  if (hint?.type === 'deal') hintTarget = 'stock'
  else if (hint?.type === 'move') {
    const pile = view.tableau[hint.from.pile]!
    hintCard = pile.cards[hint.from.index - pile.hidden]?.id ?? null
    hintTarget = `tableau:${hint.to.pile}`
  }

  const handlers: CardHandlers<SpiderSource> = {
    interactive: !over,
    flash,
    hintCard,
    hintTarget,
    onTap(from, cardId) {
      const move = bestSpiderMove(legal, from, view)
      if (move) dispatch(move)
      else flashCard(cardId)
    },
    onDrop(from, x, y) {
      const key = drops.find(x, y)
      if (!key?.startsWith('tableau:')) return
      const action: SpiderAction = {
        type: 'move',
        from,
        to: { zone: 'tableau', pile: Number(key.split(':')[1]) },
      }
      if (legal.some((a) => deepEqual(a, action))) dispatch(action)
    },
    onDragZone: setDragZone,
  }

  const deal = () => {
    if (view.canDeal) {
      setDealBlocked(false)
      dispatch({ type: 'deal' })
    } else if (view.stockCount > 0) {
      playSound('invalid')
      setDealBlocked(true)
    }
  }

  const vars = { '--card-w': `${cardWidth}px`, '--card-h': `${cardHeight}px` } as CSSProperties
  const dealsLeft = view.stockCount / PILE_COUNT

  const stock = (
    <button
      type="button"
      onClick={deal}
      disabled={over || view.stockCount === 0}
      aria-label={view.stockCount > 0 ? `Stapel: noch ${dealsLeft}-mal austeilen` : 'Stapel leer'}
      className={cn(
        'relative rounded-[7%] outline-none focus-visible:ring-4 focus-visible:ring-yellow-300',
        hintTarget === 'stock' && 'animate-pulse ring-4 ring-yellow-300',
      )}
    >
      {view.stockCount > 0 ? (
        <>
          <PlayingCard faceDown aria-hidden />
          <span className="absolute -right-1 -bottom-1 rounded-full bg-black/70 px-1.5 text-[10px] font-semibold text-white tabular-nums">
            {dealsLeft}×
          </span>
        </>
      ) : (
        <EmptySlot />
      )}
    </button>
  )

  const completed = (vertical: boolean) => (
    <div
      role="group"
      aria-label={`Fertige Folgen: ${view.completed.length} von ${RUNS_TO_WIN}`}
      className={cn('flex', vertical ? 'flex-col' : 'flex-row')}
      style={{ gap: vertical ? 0 : GAP }}
    >
      {Array.from({ length: RUNS_TO_WIN }, (_, i) => {
        const suit = view.completed[i]
        const style = vertical && i > 0 ? { marginTop: `calc(var(--card-h) * -0.82)` } : undefined
        return suit ? (
          <PlayingCard key={i} card={suitedCard('K', suit, i)} topIndex style={style} />
        ) : vertical ? null : (
          <EmptySlot key={i} className="border-white/15" />
        )
      })}
      {vertical && view.completed.length === 0 && (
        <EmptySlot className="text-[10px]">0/8</EmptySlot>
      )}
    </div>
  )

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
        <TableauPile<SpiderSource>
          key={index}
          label={`Reihe ${index + 1}`}
          dropKey={`tableau:${index}`}
          hidden={pile.hidden}
          cards={pile.cards}
          sourceAt={(k) => ({ zone: 'tableau', pile: index, index: pile.hidden + k })}
          cardHeight={cardHeight}
          areaHeight={tableau.height}
          handlers={handlers}
          registerDrop={drops.register}
        />
      ))}
    </div>
  )

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col pt-2 px-safe pb-safe" style={vars}>
      {landscape ? (
        <div className="flex min-h-0 flex-1 justify-center gap-3">
          <div className="relative z-10 flex flex-col">{stock}</div>
          <div className="flex min-h-0 flex-col">{piles}</div>
          <div className="relative z-10 flex flex-col">{completed(true)}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center" style={{ gap: GAP }}>
          <div
            className="relative z-10 grid"
            style={{ gap: GAP, gridTemplateColumns: `repeat(${PILE_COUNT}, ${cardWidth}px)` }}
          >
            <div>{stock}</div>
            <div />
            <div className="col-span-8">{completed(false)}</div>
          </div>
          {piles}
        </div>
      )}
      {dealBlocked && !view.canDeal && view.stockCount > 0 && (
        <p role="status" className="pt-2 text-center text-sm text-yellow-200">
          Austeilen geht erst, wenn in jeder Reihe mindestens eine Karte liegt.
        </p>
      )}
      <SolitaireStatus
        info={
          <>
            Züge: {view.moves} · Folgen: {view.completed.length}/{RUNS_TO_WIN}
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
