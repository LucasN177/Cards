import { AnimatePresence, motion } from 'framer-motion'
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
  canPlay,
  type PresidentAction,
  type PresidentOptions,
  type PresidentState,
  type PresidentView,
  titleOf,
} from './president'

type PresidentSession = GameSession<
  PresidentState,
  PresidentAction,
  PresidentOptions,
  PresidentView
>

function RoundSummary({
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  view: PresidentView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const last = view.rounds.at(-1)!
  const n = view.seats.length
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="round-summary-title" className="text-center text-xl font-bold">
          Runde {last.round} von {view.options.rounds} beendet
        </h2>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-left font-normal">Titel</th>
              <th className="py-1.5 text-right font-normal">+</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {last.order.map((id, place) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                <td className="py-2">{titleOf(place, n)}</td>
                <td className="py-2 text-right">{last.points[id]}</td>
                <td className="py-2 text-right font-medium">{view.scores[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.options.exchange && (
          <p className="text-center text-xs text-muted-foreground">
            Gleich wird getauscht: Der Bettler gibt dem Präsidenten seine zwei besten Karten
            {n >= 4 && ', der Vize-Bettler dem Vize seine beste'}.
          </p>
        )}
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Runde
        </Button>
      </div>
    </div>
  )
}

export default function PresidentTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as PresidentSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [chosen, setChosen] = useState<ReadonlySet<CardId>>(new Set())

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const n = view.seats.length
  const titleFor = (id: PlayerId) => {
    const place = view.titles.indexOf(id)
    return place < 0 ? null : titleOf(place, n)
  }

  const [seenRounds, setSeenRounds] = useState(view.rounds.length)
  const summaryOpen = !session.isOver && view.rounds.length > seenRounds
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const exchanging = myTurn && view.phase === 'exchange' && view.gift !== null
  const legal = myTurn ? session.legalActions(humanId) : []
  const playableRanks = new Set(
    legal.flatMap((a) =>
      a.type === 'play' ? a.cardIds.map((id) => view.hand.find((c) => c.id === id)!.rank) : [],
    ),
  )
  const canPass = legal.some((a) => a.type === 'pass')
  const top = view.trick.at(-1) ?? null
  const chosenCards = view.hand.filter((c) => chosen.has(c.id))
  const playOk = canPlay(chosenCards, top?.cards ?? null)

  const toggle = (card: { id: CardId; rank?: string }) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(card.id)) {
        next.delete(card.id)
        return next
      }
      if (exchanging) {
        if (next.size < view.gift!.count) next.add(card.id)
        return next
      }
      // Only cards of one rank can be played together.
      const rank = view.hand.find((c) => c.id === card.id)!.rank
      const sameRank = [...next].every((id) => view.hand.find((c) => c.id === id)?.rank === rank)
      const limit = top ? top.cards.length : 4
      if (!sameRank) return new Set([card.id])
      if (next.size < limit) next.add(card.id)
      return next
    })
  const act = (action: PresidentAction) => {
    setChosen(new Set())
    session.dispatch(humanId, action)
  }

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'exchange') {
    prompt = exchanging
      ? `Wähle ${view.gift!.count} ${view.gift!.count === 1 ? 'Karte' : 'Karten'} für ${nameOf(view.gift!.to)}`
      : 'Es wird getauscht …'
  } else if (view.hand.length === 0) prompt = 'Du bist fertig – warte auf die anderen'
  else if (myTurn) {
    prompt = top
      ? `Lege ${top.cards.length === 1 ? 'eine höhere Karte' : `${top.cards.length} gleiche, höhere Karten`} oder passe`
      : 'Du spielst aus: eine bis vier gleiche Karten'
  } else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastPass = view.events.find((e) => e.type === 'passed')
  const trickWon = view.events.find((e) => e.type === 'trickWon')
  const myTitle = titleFor(humanId)

  return (
    <>
      <TableLayout
        opponents={view.seats
          .filter((p) => p !== humanId)
          .map((player) => {
            const place = view.finished.indexOf(player)
            const title = titleFor(player)
            return (
              <OpponentSeat
                key={player}
                name={nameOf(player)}
                cardCount={view.handSizes[player] ?? 0}
                active={!session.isOver && view.turn === player}
                detail={
                  <span>
                    {place >= 0
                      ? `${place + 1}. fertig`
                      : view.passed.includes(player)
                        ? 'passt'
                        : (title ?? `${view.scores[player]} P.`)}
                  </span>
                }
              />
            )
          })}
        center={
          <div className="flex min-h-[calc(var(--card-h)*1.3)] flex-col items-center justify-center gap-2">
            <AnimatePresence mode="popLayout">
              {top ? (
                <motion.div
                  key={top.cards.map((c) => c.id).join()}
                  initial={{ opacity: 0, y: -30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="flex"
                    aria-label={`${nameOf(top.player)}: ${top.cards.map((c) => cardName(c, style)).join(', ')}`}
                    role="img"
                  >
                    {top.cards.map((card, i) => (
                      <PlayingCard
                        key={card.id}
                        card={card}
                        style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.55)' }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-white/80">{nameOf(top.player)}</p>
                </motion.div>
              ) : (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-white/70"
                >
                  {trickWon && trickWon.type === 'trickWon'
                    ? `${trickWon.player === humanId ? 'Du gewinnst' : `${nameOf(trickWon.player)} gewinnt`} den Stich`
                    : 'Neuer Stich'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {lastPass && lastPass.type === 'passed' && lastPass.player !== humanId && (
                <span className="text-white/80">{nameOf(lastPass.player)} passt · </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
              <span className="text-white/80">
                {' '}
                · Runde {view.round}/{view.options.rounds} · {view.scores[humanId]} P.
                {myTitle && ` · ${myTitle}`}
              </span>
            </p>
            {view.received.length > 0 && (
              <p className="text-xs text-sky-200">
                Erhalten: {view.received.map((c) => cardName(c, style)).join(', ')}
              </p>
            )}
            {exchanging && (
              <Button
                size="lg"
                variant="secondary"
                className={cn('h-11 min-w-40', LIFT_CLEARANCE)}
                disabled={chosen.size !== view.gift!.count}
                onClick={() => act({ type: 'give', cardIds: [...chosen] })}
              >
                Abgeben ({chosen.size}/{view.gift!.count})
              </Button>
            )}
            {myTurn && view.phase === 'playing' && (
              <div className={cn('flex gap-2', LIFT_CLEARANCE)}>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 min-w-32"
                  disabled={!playOk}
                  onClick={() => act({ type: 'play', cardIds: [...chosen] })}
                >
                  {chosen.size > 0 ? `Legen (${chosen.size})` : 'Legen'}
                </Button>
                {canPass && (
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-11 min-w-28"
                    onClick={() => act({ type: 'pass' })}
                  >
                    Passen
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn && (exchanging || view.phase === 'playing')}
            isPlayable={(card) => exchanging || ('rank' in card && playableRanks.has(card.rank))}
            onPlay={() => {}}
            selection={{ selectedIds: chosen, onToggle: toggle }}
            highlightIds={new Set(view.received.map((c) => c.id))}
          />
        }
      />
      {summaryOpen && (
        <RoundSummary
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenRounds(view.rounds.length)}
        />
      )}
    </>
  )
}
