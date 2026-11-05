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
import { estimateTricks } from './ai'
import type { WizardAction, WizardOptions, WizardState, WizardView } from './wizard'

type WizardSession = GameSession<WizardState, WizardAction, WizardOptions, WizardView>

const SUIT_NAME: Readonly<Record<Suit, string>> = {
  clubs: 'Kreuz',
  spades: 'Pik',
  hearts: 'Herz',
  diamonds: 'Karo',
}

function RoundSummary({
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  view: WizardView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const r = view.roundResults.at(-1)!
  const rows = [...view.order].sort((a, b) => view.scores[b]! - view.scores[a]!)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="round-summary-title" className="text-center text-xl font-bold">
          Runde {r.round} von {view.totalRounds} beendet
        </h2>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-right font-normal">Ansage</th>
              <th className="py-1.5 text-right font-normal">Stiche</th>
              <th className="py-1.5 text-right font-normal">+/−</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((id) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                <td className="py-2 text-right">{r.bids[id]}</td>
                <td className="py-2 text-right">{r.tricks[id]}</td>
                <td className={cn('py-2 text-right', r.points[id]! < 0 && 'text-destructive')}>
                  {r.points[id]! > 0 ? `+${r.points[id]}` : r.points[id]}
                </td>
                <td className="py-2 text-right font-medium">{view.scores[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Runde
        </Button>
      </div>
    </div>
  )
}

export default function WizardTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as WizardSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const others = [...view.order.slice(myIndex + 1), ...view.order.slice(0, myIndex)]

  const [seenRounds, setSeenRounds] = useState(view.roundResults.length)
  const summaryOpen = !session.isOver && view.roundResults.length > seenRounds
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const bids = legal.flatMap((a) => (a.type === 'bid' ? [a.tricks] : []))
  const suggestion = Math.round(estimateTricks(view.hand, view.trump, view.order.length))

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const bidLabel = (p: PlayerId) => {
    const bid = view.bids[p]
    return bid === null || bid === undefined ? '–' : String(bid)
  }
  const bidSum = view.order.reduce((s, p) => s + (view.bids[p] ?? 0), 0)

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'chooseTrump')
    prompt = myTurn
      ? 'Ein Zauberer wurde aufgedeckt – wähle die Trumpffarbe'
      : `${nameOf(view.dealer)} wählt Trumpf …`
  else if (view.phase === 'bidding')
    prompt = myTurn ? 'Wie viele Stiche machst du?' : `${nameOf(view.turn)} sagt an …`
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const trumpLabel = view.trump
    ? SUIT_NAME[view.trump]
    : view.phase === 'chooseTrump'
      ? '?'
      : 'kein Trumpf'

  return (
    <>
      <TableLayout
        opponents={others.map((player) => (
          <OpponentSeat
            key={player}
            name={nameOf(player)}
            cardCount={view.handSizes[player] ?? 0}
            active={!session.isOver && view.turn === player}
            detail={
              <span className="tabular-nums">
                {bidLabel(player)}/{view.tricks[player]} · {view.scores[player]} P.
                {player === view.dealer && ' · Geber'}
              </span>
            }
          />
        ))}
        center={
          <div className="flex w-full items-center justify-center gap-4">
            <div className="flex shrink-0 flex-col items-center gap-1 text-xs text-white/80">
              {view.trumpCard ? (
                <PlayingCard
                  card={view.trumpCard}
                  size="sm"
                  aria-label={`Trumpfkarte: ${cardName(view.trumpCard, style)}`}
                />
              ) : (
                <div className="h-[calc(var(--card-h)*0.7)] w-[calc(var(--card-w)*0.7)] rounded-[7%] border-2 border-dashed border-white/40" />
              )}
              <span>Trumpf: {trumpLabel}</span>
            </div>
            <DropZone ref={centerRef} active={dragging} label="Stich">
              <div className="pointer-events-none flex min-h-[calc(var(--card-h)*1.3)] min-w-[calc(var(--card-w)*2)] flex-wrap items-center justify-center gap-x-1 gap-y-2 p-1">
                <AnimatePresence>
                  {shownTrick.map(({ player, card }) => (
                    <motion.div
                      key={card.id}
                      className="flex flex-col items-center gap-0.5"
                      initial={player === humanId ? false : { opacity: 0, y: -40 }}
                      animate={{ opacity: showingLast ? 0.7 : 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                    >
                      <PlayingCard
                        card={card}
                        layoutId={card.id}
                        aria-label={`${nameOf(player)}: ${cardName(card, style)}`}
                      />
                      <span className="max-w-[var(--card-w)] truncate text-[0.65rem] text-white/80">
                        {nameOf(player)}
                      </span>
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
              {lastWinner && (
                <span className="font-medium text-yellow-200">
                  {lastWinner === humanId ? 'Du nimmst' : `${nameOf(lastWinner)} nimmt`} den Stich
                  ·{' '}
                </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Runde {view.round}/{view.totalRounds} · Du: {bidLabel(humanId)}/{view.tricks[humanId]}{' '}
              · {view.scores[humanId]} P. · Ansagen gesamt {bidSum} von {view.round}
            </p>
            {myTurn && view.phase === 'chooseTrump' && (
              <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Trumpf">
                {legal.flatMap((a) =>
                  a.type === 'chooseTrump'
                    ? [
                        <Button
                          key={a.suit}
                          variant="secondary"
                          className="h-11"
                          onClick={() => session.dispatch(humanId, a)}
                        >
                          {SUIT_NAME[a.suit]}
                        </Button>,
                      ]
                    : [],
                )}
              </div>
            )}
            {myTurn && view.phase === 'bidding' && (
              <div className="flex max-w-sm flex-col items-center gap-1">
                <div
                  className="flex flex-wrap justify-center gap-1"
                  role="group"
                  aria-label="Ansage"
                >
                  {Array.from({ length: view.round + 1 }, (_, n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant="secondary"
                      disabled={!bids.includes(n)}
                      className={cn('h-10 min-w-10', n === suggestion && 'ring-2 ring-yellow-300')}
                      aria-label={`${n} ansagen`}
                      onClick={() => session.dispatch(humanId, { type: 'bid', tricks: n })}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-white/70">Markiert: Schätzung für dein Blatt</p>
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn && view.phase === 'playing'}
            isPlayable={(card) => legalIds.has(card.id)}
            onPlay={(card) => session.dispatch(humanId, { type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
          />
        }
      />
      {summaryOpen && (
        <RoundSummary
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenRounds(view.roundResults.length)}
        />
      )}
    </>
  )
}
