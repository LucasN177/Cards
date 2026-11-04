import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Card, GameSession, Suit } from '@/engine'
import { suitName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { SuitSymbol } from '@/features/cards/SuitSymbol'
import { CardPile } from '@/features/table/CardPile'
import { Hand } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { describeEvents, describeTurn } from './describe'
import type { MauMauAction, MauMauOptions, MauMauState, MauMauView } from './mauMau'
import { WishPicker } from './WishPicker'

type MauMauSession = GameSession<MauMauState, MauMauAction, MauMauOptions, MauMauView>

export default function MauMauTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as MauMauSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const discardRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pendingJack, setPendingJack] = useState<Card | null>(null)

  const view = session.view(humanId)
  const myTurn = !session.isOver && session.currentPlayer === humanId
  const legal = session.legalActions(humanId)
  const playableIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const canDraw = legal.some((a) => a.type === 'draw')
  const canPass = legal.some((a) => a.type === 'pass')
  const nameOf = (id: string) => session.player(id)?.name ?? id

  const lastPlay = view.events.find((e) => e.type === 'played')
  const playedByOpponent = lastPlay?.type === 'played' && lastPlay.player !== humanId

  const playCard = (card: Card) => {
    if (card.kind === 'suited' && card.rank === view.options.wildRank) setPendingJack(card)
    else session.dispatch(humanId, { type: 'play', cardId: card.id })
  }
  const wish = (suit: Suit) => {
    if (pendingJack) session.dispatch(humanId, { type: 'play', cardId: pendingJack.id, wish: suit })
    setPendingJack(null)
  }
  const draw = () => session.dispatch(humanId, { type: 'draw' })
  const pass = () => session.dispatch(humanId, { type: 'pass' })

  const happened = describeEvents(view.events, { humanId, nameOf, style })
  const prompt = describeTurn(view, myTurn, nameOf)

  return (
    <>
      <TableLayout
        opponents={session.players
          .filter((p) => p.id !== humanId)
          .map((player) => {
            const count = view.handSizes[player.id] ?? 0
            return (
              <OpponentSeat
                key={player.id}
                name={player.name}
                cardCount={count}
                active={!session.isOver && view.turn === player.id}
                detail={count === 1 ? <strong className="text-yellow-200">Mau!</strong> : undefined}
              />
            )
          })}
        center={
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <CardPile
              label="Stapel"
              count={view.stockCount}
              onClick={draw}
              disabled={!myTurn || !canDraw}
              highlight={myTurn && canDraw && playableIds.size === 0}
            />
            <div className="flex flex-col items-center gap-1">
              <div
                ref={discardRef}
                role="region"
                aria-label="Ablagestapel"
                className={cn(
                  'relative h-(--card-h) w-(--card-w) rounded-[7%] transition-shadow',
                  dragging && 'ring-4 ring-yellow-300 ring-offset-4 ring-offset-transparent',
                )}
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    key={view.topCard.id}
                    className="absolute inset-0"
                    initial={playedByOpponent ? { opacity: 0, y: -80, scale: 0.7 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: { delay: 0.3 } }}
                  >
                    <PlayingCard card={view.topCard} layoutId={view.topCard.id} />
                  </motion.div>
                </AnimatePresence>
                {view.pendingDraw > 0 && (
                  <span className="absolute -top-2 -right-3 rounded-full bg-red-600 px-2 py-0.5 text-sm font-bold text-white shadow">
                    +{view.pendingDraw}
                  </span>
                )}
              </div>
              <span className="text-xs text-white/80">Ablage · {view.discardCount}</span>
            </div>
            <div className="flex w-14 flex-col items-center gap-2 text-xs text-white">
              {view.wish && (
                <div
                  className="flex flex-col items-center rounded-lg bg-white/90 p-1.5 text-zinc-900 shadow"
                  aria-label={`Gewünscht: ${suitName(view.wish, style)}`}
                  role="status"
                >
                  <svg viewBox="0 0 100 100" className="size-7" aria-hidden>
                    <SuitSymbol suit={view.wish} style={style} x={0} y={0} size={100} />
                  </svg>
                  <span className="text-[10px] font-medium">Wunsch</span>
                </div>
              )}
              {view.options.nineReverses && (
                <span
                  className="flex items-center gap-1"
                  aria-label={view.direction === 1 ? 'Im Uhrzeigersinn' : 'Gegen den Uhrzeigersinn'}
                >
                  <ArrowLeftRight
                    className={cn('size-4', view.direction === -1 && '-scale-x-100')}
                  />
                </span>
              )}
            </div>
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {happened && <span className="text-white/80">{happened}. </span>}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            {myTurn && (canDraw || canPass) && (
              <div className="flex gap-2">
                {canDraw && (
                  <Button size="lg" variant="secondary" className="h-11 min-w-32" onClick={draw}>
                    {view.pendingDraw > 0 ? `${view.pendingDraw} Karten ziehen` : 'Ziehen'}
                  </Button>
                )}
                {canPass && (
                  <Button size="lg" variant="secondary" className="h-11 min-w-32" onClick={pass}>
                    Weiter
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn}
            isPlayable={(card) => playableIds.has(card.id)}
            onPlay={playCard}
            dropTarget={discardRef}
            onDragActiveChange={setDragging}
          />
        }
      />
      {pendingJack && <WishPicker onWish={wish} onCancel={() => setPendingJack(null)} />}
    </>
  )
}
