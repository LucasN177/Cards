import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { estimateTricks } from './ai'
import {
  partnerOf,
  type SpadesAction,
  type SpadesOptions,
  type SpadesState,
  type SpadesView,
  type Team,
  teamOf,
} from './spades'

type SpadesSession = GameSession<SpadesState, SpadesAction, SpadesOptions, SpadesView>

/** Where a seat's card lies in the trick, seen from the human player (bottom). */
const TRICK_POSITION = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'left-0 top-1/2 -translate-y-1/2',
  'top-0 left-1/2 -translate-x-1/2',
  'right-0 top-1/2 -translate-y-1/2',
] as const
const ENTER_FROM = [{ y: 60 }, { x: -60 }, { y: -60 }, { x: 60 }] as const

function HandSummary({
  view,
  myTeam,
  nameOf,
  onContinue,
}: {
  view: SpadesView
  myTeam: Team
  nameOf: (id: PlayerId) => string
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const result = view.handResults.at(-1)!
  const teams = [myTeam, (1 - myTeam) as Team]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="hand-summary-title" className="text-center text-xl font-bold">
          Hand {view.handResults.length} beendet
        </h2>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Team</th>
              <th className="py-1.5 text-right font-normal">Ansage</th>
              <th className="py-1.5 text-right font-normal">Stiche</th>
              <th className="py-1.5 text-right font-normal">Punkte</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {teams.map((team) => {
              const r = result.teams[team]
              return (
                <tr key={team} className="border-b last:border-0">
                  <td className={team === myTeam ? 'py-2 font-semibold' : 'py-2'}>
                    {team === myTeam ? 'Ihr' : 'Gegner'}
                  </td>
                  <td className="py-2 text-right">{r.bid}</td>
                  <td className="py-2 text-right">{r.tricks}</td>
                  <td className={cn('py-2 text-right', r.points < 0 && 'text-destructive')}>
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </td>
                  <td className="py-2 text-right font-medium">{view.scores[team]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <ul className="space-y-1 text-center text-xs text-muted-foreground">
          {Object.entries(result.nils).map(([p, made]) => (
            <li key={p}>
              Nil von {nameOf(p)} {made ? 'geschafft (+100)' : 'verfehlt (−100)'}
            </li>
          ))}
          {teams.some((t) => result.teams[t].bagPenalty) && (
            <li>
              10 Bags erreicht: −100 für {result.teams[myTeam].bagPenalty ? 'euch' : 'die Gegner'}
            </li>
          )}
          <li>
            Bags: Ihr {view.bags[myTeam]} · Gegner {view.bags[1 - myTeam]}
            {view.options.targetScore > 0 && ` · Ziel ${view.options.targetScore} Punkte`}
          </li>
        </ul>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

export default function SpadesTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as SpadesSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const seatOf = (id: PlayerId) => (view.order.indexOf(id) - myIndex + 4) % 4
  const myTeam = teamOf(view.order, humanId)
  const partner = partnerOf(view.order, humanId)

  const [seenHands, setSeenHands] = useState(view.handResults.length)
  const summaryOpen = !session.isOver && view.handResults.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const bidding = view.phase === 'bidding'
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const bids = legal.flatMap((a) => (a.type === 'bid' ? [a.tricks] : []))
  const suggestion = Math.min(13, Math.max(1, Math.round(estimateTricks(view.hand))))

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && !bidding
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const bidLabel = (p: PlayerId) => {
    const bid = view.bids[p]
    if (bid === null || bid === undefined) return bidding ? 'reizt …' : '–'
    return bid === 0 ? 'Nil' : String(bid)
  }
  const teamBid = (team: Team) =>
    view.order
      .filter((p) => teamOf(view.order, p) === team)
      .reduce((s, p) => s + (view.bids[p] ?? 0), 0)
  const teamTricks = (team: Team) =>
    view.order
      .filter((p) => teamOf(view.order, p) === team)
      .reduce((s, p) => s + view.tricks[p]!, 0)

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (bidding)
    prompt = myTurn ? 'Wie viele Stiche machst du?' : `${nameOf(view.turn)} sagt an …`
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  return (
    <>
      <TableLayout
        opponents={view.order
          .filter((p) => p !== humanId)
          .map((player) => (
            <OpponentSeat
              key={player}
              name={`${nameOf(player)}${player === partner ? ' (Partner)' : ''}`}
              cardCount={view.handSizes[player] ?? 0}
              active={!session.isOver && view.turn === player}
              detail={
                <span className="tabular-nums">
                  {bidLabel(player)} · {view.tricks[player]} St.
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
              <span className="text-white/80">
                {' '}
                · Du: {bidLabel(humanId)} / {view.tricks[humanId]} St.
              </span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Ihr {view.scores[myTeam]} ({teamTricks(myTeam)}/{teamBid(myTeam)}) · Gegner{' '}
              {view.scores[1 - myTeam]} ({teamTricks((1 - myTeam) as Team)}/
              {teamBid((1 - myTeam) as Team)})
              {!view.spadesBroken && !bidding && ' · Pik noch nicht gebrochen'}
            </p>
            {myTurn && bidding && (
              <div className="flex max-w-sm flex-col items-center gap-1">
                <div
                  className="flex flex-wrap justify-center gap-1"
                  role="group"
                  aria-label="Ansage"
                >
                  {bids.map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant="secondary"
                      className={cn('h-10 min-w-10', n === suggestion && 'ring-2 ring-yellow-300')}
                      aria-label={n === 0 ? 'Nil ansagen' : `${n} ansagen`}
                      onClick={() => session.dispatch(humanId, { type: 'bid', tricks: n })}
                    >
                      {n === 0 ? 'Nil' : n}
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
            enabled={myTurn && !bidding}
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
          myTeam={myTeam}
          nameOf={nameOf}
          onContinue={() => setSeenHands(view.handResults.length)}
        />
      )}
    </>
  )
}
