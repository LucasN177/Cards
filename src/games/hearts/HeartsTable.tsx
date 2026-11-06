import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CardId, GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { type DeckStyle, useSettings } from '@/stores/settingsStore'
import {
  type HeartsAction,
  type HeartsOptions,
  type HeartsState,
  type HeartsView,
  type PassDirection,
  trickPoints,
} from './hearts'

type HeartsSession = GameSession<HeartsState, HeartsAction, HeartsOptions, HeartsView>

const DIRECTION_LABEL: Readonly<Record<PassDirection, string>> = {
  left: 'nach links',
  right: 'nach rechts',
  across: 'nach gegenüber',
  none: '',
}

/**
 * Where a seat's card lies in the trick, seen from the human player (seat 0, bottom): the seats
 * sit clockwise on an ellipse, so four players give bottom, left, top, right.
 */
function trickSlot(seat: number, players: number) {
  const angle = Math.PI / 2 + (seat * 2 * Math.PI) / players
  const x = Math.cos(angle)
  const y = Math.sin(angle)
  return {
    style: { left: `${50 + 34 * x}%`, top: `${50 + 28 * y}%` },
    enter: { x: Math.round(60 * x), y: Math.round(60 * y) },
  }
}

function HandSummary({
  view,
  nameOf,
  humanId,
  style,
  onContinue,
}: {
  view: HeartsView
  style: DeckStyle
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const points = view.handResults.at(-1)!
  const lastEvent = [...view.events].reverse().find((e) => e.type === 'hand')
  const moon = lastEvent?.type === 'hand' ? lastEvent.moon : null
  const pot = lastEvent?.type === 'hand' ? lastEvent.pot : null
  const rows = [...view.order].sort((a, b) => view.scores[a]! - view.scores[b]!)
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
            Hand {view.handResults.length} beendet
          </h2>
          {moon && (
            <p className="mt-1 font-medium text-yellow-600 dark:text-yellow-400">
              {moon === humanId ? 'Du hast' : `${nameOf(moon)} hat`} alle Strafkarten bekommen –
              Durchmarsch!
            </p>
          )}
          {pot && (
            <p className="mt-1 text-sm text-muted-foreground">
              Topf ({pot.cards.map((c) => cardName(c, style)).join(', ')}):{' '}
              {pot.winner === humanId ? 'an dich' : `an ${nameOf(pot.winner)}`}
            </p>
          )}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-right font-normal">Diese Hand</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((id) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                <td className="py-2 text-right">{points[id]}</td>
                <td className="py-2 text-right font-medium">{view.scores[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-center text-xs text-muted-foreground">
          Gespielt wird bis {view.options.targetScore} Punkte – wenig Punkte sind gut.
        </p>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

export default function HeartsTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as HeartsSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<CardId>>(new Set())

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const seatOf = (id: PlayerId) =>
    (view.order.indexOf(id) - myIndex + view.order.length) % view.order.length

  // Show a summary after every hand (not the last one – the result dialog covers that).
  const [seenHands, setSeenHands] = useState(view.handResults.length)
  const summaryOpen = !session.isOver && view.handResults.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId
  const passing = view.phase === 'passing' && !view.hasPassed[humanId]
  const legalIds = new Set(
    session.legalActions(humanId).flatMap((a) => (a.type === 'play' ? [a.cardId] : [])),
  )

  const toggle = (card: { id: CardId }) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(card.id)) next.delete(card.id)
      else if (next.size < 3) next.add(card.id)
      return next
    })
  const pass = () => {
    session.dispatch(humanId, { type: 'pass', cardIds: [...chosen] })
    setChosen(new Set())
  }

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.tricksPlayed > 0
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick

  let prompt: string
  if (view.phase === 'passing') {
    prompt = passing
      ? `Wähle 3 Karten, die du ${DIRECTION_LABEL[view.passDirection]} an ${nameOf(view.passTarget!)} weitergibst`
      : 'Warte auf die anderen …'
  } else if (session.isOver) prompt = 'Spiel beendet'
  else if (myTurn) {
    prompt =
      view.tricksPlayed === 0 && view.trick.length === 0 && view.options.firstLead !== 'rotate'
        ? `Du beginnst mit ${cardName(view.hand.find((c) => legalIds.has(c.id)) ?? view.hand[0]!, style)}`
        : 'Du bist dran'
  } else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastWinner = showingLast ? view.lastTrick!.winner : null
  const lastPoints = showingLast
    ? trickPoints(
        view.lastTrick!.cards.map((t) => t.card),
        view.options.deck,
      )
    : 0

  return (
    <>
      <TableLayout
        opponents={view.order
          .filter((p) => p !== humanId)
          .map((player) => (
            <OpponentSeat
              key={player}
              name={nameOf(player)}
              cardCount={view.handSizes[player] ?? 0}
              active={!session.isOver && view.turn === player}
              detail={
                <span className="tabular-nums">
                  {view.handPoints[player]} · Σ {view.scores[player]}
                </span>
              }
            />
          ))}
        center={
          <DropZone ref={centerRef} active={dragging} label="Stich">
            <div className="pointer-events-none relative h-[calc(var(--card-h)*2.25)] w-[calc(var(--card-w)*3.2)]">
              <AnimatePresence>
                {shownTrick.map(({ player, card }) => {
                  const slot = trickSlot(seatOf(player), view.order.length)
                  return (
                    <motion.div
                      key={card.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={slot.style}
                      initial={player === humanId ? false : { opacity: 0, ...slot.enter }}
                      animate={{ opacity: showingLast ? 0.7 : 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                    >
                      <PlayingCard
                        card={card}
                        layoutId={card.id}
                        aria-label={`${nameOf(player)}: ${cardName(card, style)}`}
                      />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {view.potSize > 0 && (
                // Bottom left is free with three and five players (the only ones with a pot).
                <div
                  role="img"
                  className="absolute bottom-0 left-0 flex flex-col items-start gap-0.5 text-[10px] text-white/80"
                  aria-label={`Topf: ${view.potSize} verdeckte Karten`}
                >
                  Topf
                  <div className="relative">
                    {Array.from({ length: view.potSize }, (_, i) => (
                      <PlayingCard
                        key={i}
                        size="xs"
                        className={i > 0 ? 'absolute' : undefined}
                        style={i > 0 ? { left: i * 4, top: i * -2 } : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DropZone>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {lastWinner && (
                <span className="font-medium text-yellow-200">
                  {lastWinner === humanId ? 'Du nimmst' : `${nameOf(lastWinner)} nimmt`} den Stich
                  {lastPoints > 0 ? ` (+${lastPoints})` : ''} ·{' '}
                </span>
              )}
              <span className={myTurn || passing ? 'font-semibold text-yellow-200' : undefined}>
                {prompt}
              </span>
              <span className="text-white/80">
                {' '}
                · Du: {view.handPoints[humanId]} · Σ {view.scores[humanId]}
              </span>
            </p>
            {view.received.length > 0 && (
              <p className="text-xs text-sky-200">
                Erhalten: {view.received.map((c) => cardName(c, style)).join(', ')}
              </p>
            )}
            {passing && (
              <Button
                size="lg"
                variant="secondary"
                className={cn('h-11 min-w-40', LIFT_CLEARANCE)}
                disabled={chosen.size !== 3}
                onClick={pass}
              >
                Weitergeben ({chosen.size}/3)
              </Button>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={passing || myTurn}
            isPlayable={(card) => passing || legalIds.has(card.id)}
            onPlay={(card) => session.dispatch(humanId, { type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
            selection={passing ? { selectedIds: chosen, onToggle: toggle } : undefined}
            highlightIds={new Set(view.received.map((c) => c.id))}
          />
        }
      />
      {summaryOpen && (
        <HandSummary
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          style={style}
          onContinue={() => setSeenHands(view.handResults.length)}
        />
      )}
    </>
  )
}
