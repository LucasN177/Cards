import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CardId, GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  formatValue,
  type RoundResult,
  type SchwimmenAction,
  type SchwimmenOptions,
  type SchwimmenState,
  type SchwimmenView,
} from './schwimmen'

type SchwimmenSession = GameSession<
  SchwimmenState,
  SchwimmenAction,
  SchwimmenOptions,
  SchwimmenView
>

function livesLabel(view: SchwimmenView, id: PlayerId) {
  if (!view.alive.includes(id)) return 'ausgeschieden'
  if (view.swimming[id]) return 'schwimmt'
  const lives = view.lives[id]!
  return `${lives} Leben`
}

function RoundSummary({
  result,
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  result: RoundResult
  view: SchwimmenView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const rows = Object.keys(result.values).sort((a, b) => result.values[b]! - result.values[a]!)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="round-summary-title" className="text-xl font-bold">
            Runde {result.round} beendet
          </h2>
          {result.fireBy && (
            <p className="mt-1 font-medium text-yellow-600 dark:text-yellow-400">
              Feuer! {result.fireBy === humanId ? 'Du hast' : `${nameOf(result.fireBy)} hat`} 31.
            </p>
          )}
        </div>
        <ul className="space-y-2" aria-label="Karten der Runde">
          {rows.map((id) => {
            const lost = result.losers.includes(id)
            return (
              <li key={id} className="flex items-center gap-3">
                <div
                  className="flex shrink-0"
                  aria-label={result.hands[id]!.map((c) => cardName(c, style)).join(', ')}
                >
                  {result.hands[id]!.map((card, i) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      size="xs"
                      style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.15)' }}
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className={cn('truncate', id === humanId && 'font-semibold')}>{nameOf(id)}</p>
                  <p className={cn('text-xs', lost ? 'text-destructive' : 'text-muted-foreground')}>
                    {result.eliminated.includes(id)
                      ? 'ausgeschieden'
                      : lost
                        ? view.swimming[id]
                          ? 'verliert – schwimmt jetzt'
                          : 'verliert ein Leben'
                        : livesLabel(view, id)}
                  </p>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {formatValue(result.values[id]!)}
                </span>
              </li>
            )
          })}
        </ul>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Runde
        </Button>
      </div>
    </div>
  )
}

export default function SchwimmenTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as SchwimmenSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [chosen, setChosen] = useState<CardId | null>(null)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const meIn = view.alive.includes(humanId)

  // A summary after every round (the last one is covered by the result dialog).
  const [seenRound, setSeenRound] = useState(view.lastRound?.round ?? 0)
  const summaryOpen = !session.isOver && view.lastRound !== null && view.lastRound.round > seenRound
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && meIn && view.turn === humanId && !summaryOpen
  const canKnock = myTurn && session.legalActions(humanId).some((a) => a.type === 'knock')
  const act = (action: SchwimmenAction) => {
    setChosen(null)
    session.dispatch(humanId, action)
  }

  // Opponents start with the player after the human so the order follows the play direction.
  const myIndex = Math.max(0, view.seats.indexOf(humanId))
  const others = [...view.seats.slice(myIndex + 1), ...view.seats.slice(0, myIndex)]

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (!meIn) prompt = 'Du bist ausgeschieden'
  else if (myTurn) {
    prompt = chosen
      ? 'Tippe eine Karte in der Mitte zum Tauschen'
      : view.knockedBy
        ? 'Letzter Zug – es wurde geklopft'
        : 'Du bist dran: Karte wählen und tauschen, alle tauschen, schieben oder klopfen'
  } else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastEvent = view.events.at(-1)
  const verb = (id: PlayerId, you: string, other: string) => (id === humanId ? you : other)
  const eventText =
    lastEvent && lastEvent.type !== 'newMiddle' && lastEvent.type !== 'fire'
      ? `${nameOf(lastEvent.player)} ${
          lastEvent.type === 'swapped'
            ? `${verb(lastEvent.player, 'tauschst', 'tauscht')} ${cardName(lastEvent.gave, style)} gegen ${cardName(lastEvent.took, style)}`
            : lastEvent.type === 'swappedAll'
              ? `${verb(lastEvent.player, 'tauschst', 'tauscht')} alle drei Karten`
              : lastEvent.type === 'passed'
                ? verb(lastEvent.player, 'schiebst', 'schiebt')
                : verb(lastEvent.player, 'klopfst', 'klopft')
        }`
      : lastEvent?.type === 'newMiddle'
        ? 'Alle haben geschoben – drei neue Karten liegen in der Mitte'
        : null

  return (
    <>
      <TableLayout
        opponents={others.map((player) => (
          <OpponentSeat
            key={player}
            name={nameOf(player)}
            cardCount={view.alive.includes(player) ? 3 : 0}
            active={!session.isOver && view.turn === player}
            detail={
              <span className={cn(view.swimming[player] && 'text-sky-200')}>
                {livesLabel(view, player)}
                {view.knockedBy === player && ' · klopft'}
              </span>
            }
          />
        ))}
        center={
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-white/80">Mitte · Stapel: {view.stockCount}</p>
            <div className="flex gap-2" role="group" aria-label="Karten in der Mitte">
              {view.middle.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!myTurn || !chosen}
                  aria-label={`${cardName(card, style)} nehmen`}
                  className={cn(
                    'rounded-lg transition-transform focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:outline-none',
                    myTurn && chosen && 'ring-2 ring-yellow-300 hover:-translate-y-1',
                  )}
                  onClick={() =>
                    chosen && act({ type: 'swap', handCardId: chosen, middleCardId: card.id })
                  }
                >
                  <PlayingCard card={card} layoutId={card.id} />
                </button>
              ))}
            </div>
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {eventText && <span className="text-white/80">{eventText} · </span>}
              <span className={myTurn ? 'font-semibold text-yellow-200' : undefined}>{prompt}</span>
            </p>
            {meIn && (
              <p className="text-sm text-white/90">
                Dein Blatt: <strong className="tabular-nums">{formatValue(view.handValue)}</strong>{' '}
                · {livesLabel(view, humanId)}
                {view.knockedBy &&
                  ` · ${nameOf(view.knockedBy)} ${view.knockedBy === humanId ? 'hast' : 'hat'} geklopft`}
              </p>
            )}
            {myTurn && (
              <div className={cn('flex flex-wrap justify-center gap-2', LIFT_CLEARANCE)}>
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={() => act({ type: 'swapAll' })}
                >
                  Alle tauschen
                </Button>
                <Button variant="secondary" className="h-11" onClick={() => act({ type: 'pass' })}>
                  Schieben
                </Button>
                {canKnock && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => act({ type: 'knock' })}
                  >
                    Klopfen
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
            onPlay={() => {}}
            selection={{
              selectedIds: new Set(chosen ? [chosen] : []),
              onToggle: (card) => setChosen((c) => (c === card.id ? null : card.id)),
            }}
          />
        }
      />
      {summaryOpen && (
        <RoundSummary
          result={view.lastRound!}
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenRound(view.lastRound!.round)}
        />
      )}
    </>
  )
}
