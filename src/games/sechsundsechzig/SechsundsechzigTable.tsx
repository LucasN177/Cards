import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, PlayerId, Suit } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import type {
  HandResult,
  SechsundsechzigAction,
  SechsundsechzigOptions,
  SechsundsechzigState,
  SechsundsechzigView,
} from './sechsundsechzig'

type Session66 = GameSession<
  SechsundsechzigState,
  SechsundsechzigAction,
  SechsundsechzigOptions,
  SechsundsechzigView
>

const SUIT_NAME: Readonly<Record<Suit, string>> = {
  clubs: 'Kreuz',
  spades: 'Pik',
  hearts: 'Herz',
  diamonds: 'Karo',
}

const REASON: Readonly<Record<HandResult['reason'], string>> = {
  reached: '66 erreicht',
  lastTrick: 'letzter Stich',
  closeFailed: 'Zudrehen nicht geschafft',
}

function HandSummary({
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  view: SechsundsechzigView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const result = view.handResults.at(-1)!
  const won = result.winner === humanId
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="hand-summary-title" className="text-xl font-bold">
            {won ? 'Hand gewonnen' : 'Hand verloren'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {nameOf(result.winner)} · {REASON[result.reason]} · +{result.gamePoints}{' '}
            {result.gamePoints === 1 ? 'Gewinnpunkt' : 'Gewinnpunkte'}
          </p>
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-right font-normal">Augen</th>
              <th className="py-1.5 text-right font-normal">Gewinnpunkte</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {view.order.map((id) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                <td className="py-2 text-right">{result.points[id]}</td>
                <td className="py-2 text-right font-medium">{view.gamePoints[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-center text-xs text-muted-foreground">
          Gespielt wird bis {view.options.target} Gewinnpunkte.
        </p>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

export default function SechsundsechzigTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as Session66
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const opponent = view.order.find((p) => p !== humanId)!

  const [seenHands, setSeenHands] = useState(view.handResults.length)
  const summaryOpen = !session.isOver && view.handResults.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' && !a.meld ? [a.cardId] : [])))
  // One button per marriage: it announces the pair and plays its queen.
  const meldPlays = legal.flatMap((a) => {
    if (a.type !== 'play' || !a.meld) return []
    const card = view.hand.find((c) => c.id === a.cardId)!
    return card.rank === 'Q' ? [{ action: a, suit: card.suit }] : []
  })
  const canExchange = legal.some((a) => a.type === 'exchange')
  const canClose = legal.some((a) => a.type === 'close')

  const showingLast = view.trick.length === 0 && view.lastTrick !== null
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null
  const lastMeld = view.events.find((e) => e.type === 'melded')

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (myTurn) {
    prompt =
      view.trick.length === 0
        ? 'Du spielst aus'
        : view.strict
          ? 'Farbe bedienen und überstechen, sonst trumpfen'
          : 'Du bist dran – beliebige Karte'
  } else prompt = `${nameOf(view.turn)} ist am Zug …`

  return (
    <>
      <TableLayout
        opponents={
          <OpponentSeat
            name={nameOf(opponent)}
            cardCount={view.opponentCards}
            active={!session.isOver && view.turn === opponent}
            detail={
              <span className="tabular-nums">
                {view.tricksWon[opponent]} St. · {view.gamePoints[opponent]} GP
              </span>
            }
          />
        }
        center={
          <div className="flex w-full items-center justify-center gap-6">
            <div className="flex shrink-0 flex-col items-center gap-1 text-xs text-white/80">
              <div className="relative h-(--card-h) w-[calc(var(--card-w)*1.3)]">
                {view.trumpCard && (
                  <PlayingCard
                    card={view.trumpCard}
                    className="absolute top-[12%] left-[30%] rotate-90"
                    aria-label={`Trumpfkarte: ${cardName(view.trumpCard, style)}`}
                  />
                )}
                {view.stockCount > 1 && <PlayingCard faceDown className="absolute top-0 left-0" />}
              </div>
              <span>
                {view.closedBy
                  ? `zugedreht von ${nameOf(view.closedBy)}`
                  : `Stapel ${view.stockCount}`}{' '}
                · Trumpf {SUIT_NAME[view.trump]}
              </span>
            </div>
            <DropZone ref={centerRef} active={dragging} label="Stich">
              <div className="pointer-events-none flex h-[calc(var(--card-h)*1.15)] min-w-[calc(var(--card-w)*2.3)] items-center justify-center gap-2">
                <AnimatePresence>
                  {shownTrick.map(({ player, card }) => (
                    <motion.div
                      key={card.id}
                      initial={player === humanId ? false : { opacity: 0, y: -50 }}
                      animate={{ opacity: showingLast ? 0.7 : 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                    >
                      <PlayingCard
                        card={card}
                        layoutId={card.id}
                        aria-label={`${nameOf(player)}: ${cardName(card, style)}`}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </DropZone>
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {lastMeld?.type === 'melded' && (
                <span className="font-medium text-yellow-200">
                  {nameOf(lastMeld.meld.player)} meldet {lastMeld.meld.points} (
                  {SUIT_NAME[lastMeld.meld.suit]}) ·{' '}
                </span>
              )}
              {lastWinner && !lastMeld && (
                <span className="text-white/80">
                  {lastWinner === humanId ? 'Du nimmst' : `${nameOf(lastWinner)} nimmt`} den Stich
                  ·{' '}
                </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Deine Augen: {view.myPoints}
              {view.pendingPoints > 0 && ` (+${view.pendingPoints} nach dem ersten Stich)`} ·{' '}
              {view.tricksWon[humanId]} St. · Gewinnpunkte {view.gamePoints[humanId]}:
              {view.gamePoints[opponent]}
            </p>
            {(meldPlays.length > 0 || canExchange || canClose) && (
              <div className="flex flex-wrap justify-center gap-2">
                {meldPlays.map(({ action, suit }) => (
                  <Button
                    key={suit}
                    variant="secondary"
                    className="h-11"
                    onClick={() => session.dispatch(humanId, action)}
                  >
                    {suit === view.trump ? '40' : '20'} melden ({SUIT_NAME[suit]})
                  </Button>
                ))}
                {canExchange && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => session.dispatch(humanId, { type: 'exchange' })}
                  >
                    Trumpf tauschen
                  </Button>
                )}
                {canClose && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => session.dispatch(humanId, { type: 'close' })}
                  >
                    Zudrehen
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
            isPlayable={(card) => legalIds.has(card.id)}
            onPlay={(card) => session.dispatch(humanId, { type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
          />
        }
      />
      {summaryOpen && (
        <HandSummary
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenHands(view.handResults.length)}
        />
      )}
    </>
  )
}
