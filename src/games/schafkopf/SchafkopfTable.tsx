import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  gameName,
  type SchafkopfAction,
  type SchafkopfGame,
  type SchafkopfOptions,
  type SchafkopfResult,
  type SchafkopfState,
  type SchafkopfView,
  SUIT_NAME,
} from './schafkopf'

type SchafkopfSession = GameSession<
  SchafkopfState,
  SchafkopfAction,
  SchafkopfOptions,
  SchafkopfView
>

const TRICK_POSITION = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'left-0 top-1/2 -translate-y-1/2',
  'top-0 left-1/2 -translate-x-1/2',
  'right-0 top-1/2 -translate-y-1/2',
] as const
const ENTER_FROM = [{ y: 60 }, { x: -60 }, { y: -60 }, { x: 60 }] as const

const buttonLabel = (g: SchafkopfGame) =>
  g.type === 'sau'
    ? `${SUIT_NAME[g.suit]}-Sau`
    : g.type === 'wenz'
      ? 'Wenz'
      : `${SUIT_NAME[g.suit]}-Solo`

function GameSummary({
  result,
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  result: SchafkopfResult
  view: SchafkopfView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const onTeam = result.player === humanId || result.partner === humanId
  let headline: string
  if (!result.game) headline = 'Zusammengeworfen'
  else headline = onTeam === result.won ? 'Spiel gewonnen!' : 'Spiel verloren'
  const team = [result.player, result.partner].filter(Boolean).map((p) => nameOf(p!))
  const details: string[] = []
  if (result.game) {
    details.push(`${result.points} Augen`)
    if (result.schwarz) details.push('Schwarz')
    else if (result.schneider) details.push('Schneider')
    if (result.laufende > 0) details.push(`${result.laufende} Laufende`)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="game-summary-title" className="text-xl font-bold">
            {headline}
          </h2>
          {result.game && (
            <p className="mt-1 text-sm text-muted-foreground">
              {gameName(result.game)} · {team.join(' & ')} {result.won ? 'gewinnt' : 'verliert'} ·{' '}
              {result.value} pro Spieler
            </p>
          )}
          {details.length > 0 && (
            <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
          )}
          {!result.game && (
            <p className="mt-1 text-sm text-muted-foreground">Alle haben gepasst.</p>
          )}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-right font-normal">Spiel</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {view.order.map((id) => {
              const d = result.delta[id] ?? 0
              return (
                <tr key={id} className="border-b last:border-0">
                  <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                  <td className={cn('py-2 text-right', d < 0 && 'text-destructive')}>
                    {d > 0 ? `+${d}` : d}
                  </td>
                  <td className="py-2 text-right font-medium">{view.scores[id]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächstes Spiel
        </Button>
      </div>
    </div>
  )
}

export default function SchafkopfTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as SchafkopfSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [soloOpen, setSoloOpen] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const seatOf = (id: PlayerId) => (view.order.indexOf(id) - myIndex + 4) % 4
  const others = [1, 2, 3].map((i) => view.order[(myIndex + i) % 4]!)

  const [seenGames, setSeenGames] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenGames
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const games = legal.flatMap((a) => (a.type === 'announce' ? [a.game] : []))
  const solos = games.filter((g) => g.type === 'solo')
  const act = (action: SchafkopfAction) => {
    setSoloOpen(false)
    session.dispatch(humanId, action)
  }

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const role = (p: PlayerId) => {
    if (view.phase !== 'playing' || !view.game) return p === view.dealer ? 'Geber' : null
    if (p === view.player) return 'Spieler'
    if (p === view.partner) return 'Mitspieler'
    if (view.game.type !== 'sau' || view.partner !== null) return 'Gegenspieler'
    return null
  }

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'bidding') {
    const best = view.best ? `${nameOf(view.best.player)}: ${gameName(view.best.game)}. ` : ''
    prompt = myTurn ? `${best}Spielst du?` : `${best}${nameOf(view.turn)} überlegt …`
  } else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const myRole = role(humanId)

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
              <span>
                {role(player) ?? '–'}
                {view.phase === 'playing' && ` · ${view.tricksWon[player]} St.`}
              </span>
            }
          />
        ))}
        center={
          <DropZone ref={centerRef} active={dragging} label="Stich">
            <div className="pointer-events-none relative h-[calc(var(--card-h)*2.25)] w-[calc(var(--card-w)*3.2)]">
              <AnimatePresence>
                {shownTrick.map(({ player, card }) => {
                  const seat = seatOf(player)
                  return (
                    <motion.div
                      key={card.id}
                      className={`absolute ${TRICK_POSITION[seat]}`}
                      initial={player === humanId ? false : { opacity: 0, ...ENTER_FROM[seat] }}
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
            </div>
          </DropZone>
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
              Spiel {view.gameNumber}/{view.options.games}
              {view.game && ` · ${gameName(view.game)} (${nameOf(view.player!)})`}
              {myRole && ` · Du: ${myRole}`}
              {view.phase === 'playing' && ` · Augen ${view.myPoints}`}
            </p>
            {myTurn && view.phase === 'bidding' && (
              // One row of buttons at a time: the solo choice replaces the main row, so the panel
              // stays short enough for phones in landscape.
              <div className={cn('flex max-w-3xl flex-col items-center gap-2', LIFT_CLEARANCE)}>
                {!soloOpen && (
                  <div
                    className="flex flex-wrap justify-center gap-1.5"
                    role="group"
                    aria-label="Spiel wählen (Sauspiel: Sau rufen)"
                  >
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Weiter
                    </Button>
                    {games
                      .filter((g) => g.type !== 'solo')
                      .map((game) => (
                        <Button
                          key={buttonLabel(game)}
                          variant="secondary"
                          className="h-11"
                          onClick={() => act({ type: 'announce', game })}
                        >
                          {buttonLabel(game)}
                        </Button>
                      ))}
                    {solos.length > 0 && (
                      <Button
                        variant="secondary"
                        className="h-11"
                        onClick={() => setSoloOpen((o) => !o)}
                      >
                        Solo …
                      </Button>
                    )}
                  </div>
                )}
                {soloOpen && (
                  <div
                    className="flex flex-wrap justify-center gap-1.5"
                    role="group"
                    aria-label="Solo wählen"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 text-white"
                      onClick={() => setSoloOpen(false)}
                    >
                      Zurück
                    </Button>
                    {solos.map((game) => (
                      <Button
                        key={buttonLabel(game)}
                        size="sm"
                        variant="secondary"
                        className="h-10"
                        onClick={() => act({ type: 'announce', game })}
                      >
                        {buttonLabel(game)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn && view.phase === 'playing'}
            isPlayable={(card) => legalIds.has(card.id)}
            onPlay={(card) => act({ type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
          />
        }
      />
      {summaryOpen && (
        <GameSummary
          result={view.results.at(-1)!}
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenGames(view.results.length)}
        />
      )}
    </>
  )
}
