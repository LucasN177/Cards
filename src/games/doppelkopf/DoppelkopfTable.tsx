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
  type Contract,
  type DoppelkopfAction,
  type DoppelkopfOptions,
  type DoppelkopfResult,
  type DoppelkopfState,
  type DoppelkopfView,
  LEVEL_NAME,
  type Party,
  type SoloKind,
  soloName,
} from './doppelkopf'

type DoppelkopfSession = GameSession<
  DoppelkopfState,
  DoppelkopfAction,
  DoppelkopfOptions,
  DoppelkopfView
>

const TRICK_POSITION = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'left-0 top-1/2 -translate-y-1/2',
  'top-0 left-1/2 -translate-x-1/2',
  'right-0 top-1/2 -translate-y-1/2',
] as const
const ENTER_FROM = [{ y: 60 }, { x: -60 }, { y: -60 }, { x: 60 }] as const

const SOLO_CHOICES: readonly SoloKind[] = [
  'queens',
  'jacks',
  'clubs',
  'spades',
  'hearts',
  'diamonds',
  'fleischlos',
]

const partyName = (p: Party) => (p === 're' ? 'Re' : 'Kontra')
const EXTRA_NAME = { fuchs: 'Fuchs gefangen', doppelkopf: 'Doppelkopf', karlchen: 'Karlchen' }

function contractName(c: Contract, nameOf: (id: PlayerId) => string) {
  if (c.type === 'normal') return 'Normalspiel'
  if (c.type === 'silent') return `Stille Hochzeit (${nameOf(c.player)})`
  return `${soloName(c.kind)} (${nameOf(c.player)})`
}

function announcementText(party: Party, level: number | null) {
  if (level === null) return null
  return level === 0 ? partyName(party) : `${partyName(party)}, ${LEVEL_NAME[level as 1]}`
}

function GameSummary({
  result,
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  result: DoppelkopfResult
  view: DoppelkopfView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const mine = result.teams[humanId]!
  const headline = !result.winner
    ? 'Niemand hat sein Ziel erreicht'
    : result.winner === mine
      ? 'Spiel gewonnen!'
      : 'Spiel verloren'
  const reMembers = view.order.filter((p) => result.teams[p] === 're').map(nameOf)
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
          <p className="mt-1 text-sm text-muted-foreground">
            Spiel {result.number}: {contractName(result.contract, nameOf)} · Re:{' '}
            {reMembers.join(' & ')}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            Re {result.points.re} : {result.points.kontra} Kontra
          </p>
        </div>
        {(result.items.length > 0 || result.extras.length > 0) && (
          <ul className="space-y-0.5 text-center text-xs text-muted-foreground">
            {result.items.length > 0 && (
              <li>
                {result.winner && partyName(result.winner)}: {result.items.join(', ')}
              </li>
            )}
            {result.extras.map((e, i) => (
              <li key={i}>
                {EXTRA_NAME[e.kind]} für {partyName(e.party)}
              </li>
            ))}
          </ul>
        )}
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
                  <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>
                    {nameOf(id)}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({partyName(result.teams[id]!)})
                    </span>
                  </td>
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

export default function DoppelkopfTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as DoppelkopfSession
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
  const announce = legal.find((a) => a.type === 'announce')
  const act = (action: DoppelkopfAction) => {
    setSoloOpen(false)
    session.dispatch(humanId, action)
  }

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const announceLabel =
    announce?.type === 'announce'
      ? announce.level === 0
        ? `${partyName(view.myParty)} ansagen`
        : `${LEVEL_NAME[announce.level]} absagen`
      : null

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'reservation')
    prompt = myTurn ? 'Gesund oder Solo?' : `${nameOf(view.turn)} überlegt …`
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastAnnounce = view.events.find((e) => e.type === 'announced')
  const lastSolo = view.events.find((e) => e.type === 'solo')

  return (
    <>
      <TableLayout
        opponents={others.map((player) => {
          const party = view.knownParties[player]
          return (
            <OpponentSeat
              key={player}
              name={nameOf(player)}
              cardCount={view.handSizes[player] ?? 0}
              active={!session.isOver && view.turn === player}
              detail={
                <span>
                  {party ? partyName(party) : '?'}
                  {view.phase === 'playing' && ` · ${view.tricksWon[player]} St.`}
                  {player === view.dealer && ' · Geber'}
                </span>
              }
            />
          )
        })}
        center={
          <DropZone ref={centerRef} active={dragging} label="Stich">
            <div className="pointer-events-none relative h-[calc(var(--card-h)*2.25)] w-[calc(var(--card-w)*3.2)]">
              <AnimatePresence>
                {shownTrick.map(({ player, card }) => {
                  const seat = seatOf(player)
                  return (
                    <motion.div
                      key={`${card.id}-${player}`}
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
              {lastAnnounce?.type === 'announced' && (
                <span className="font-medium text-yellow-200">
                  {nameOf(lastAnnounce.player)}: „
                  {announcementText(lastAnnounce.party, lastAnnounce.level)}“ ·{' '}
                </span>
              )}
              {lastSolo?.type === 'solo' && (
                <span className="font-medium text-yellow-200">
                  {nameOf(lastSolo.player)} spielt {soloName(lastSolo.kind)} ·{' '}
                </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Spiel {view.gameNumber}/{view.options.games} · Du:{' '}
              {view.phase === 'reservation' ? '…' : partyName(view.myParty)}
              {view.phase === 'playing' &&
                view.contract.type !== 'normal' &&
                ` · ${contractName(view.contract, nameOf)}`}
              {view.phase === 'playing' && ` · eure Augen ${view.myPoints}`}
              {(['re', 'kontra'] as const).map((p) => {
                const text = announcementText(p, view.announcements[p])
                return text ? ` · „${text}“` : ''
              })}
            </p>
            {myTurn && view.phase === 'reservation' && (
              <div className={cn('flex max-w-md flex-col items-center gap-2', LIFT_CLEARANCE)}>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => act({ type: 'healthy' })}
                  >
                    Gesund
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => setSoloOpen((o) => !o)}
                  >
                    Solo …
                  </Button>
                </div>
                {soloOpen && (
                  <div
                    className="flex flex-wrap justify-center gap-1.5"
                    role="group"
                    aria-label="Solo wählen"
                  >
                    {SOLO_CHOICES.map((kind) => (
                      <Button
                        key={kind}
                        size="sm"
                        variant="secondary"
                        className="h-10"
                        onClick={() => act({ type: 'solo', kind })}
                      >
                        {soloName(kind)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {myTurn && announce && announceLabel && (
              <Button
                variant="secondary"
                size="sm"
                className={cn('h-10', LIFT_CLEARANCE)}
                onClick={() => act(announce)}
              >
                {announceLabel}
              </Button>
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
