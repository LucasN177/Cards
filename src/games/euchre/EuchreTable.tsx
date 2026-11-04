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
import {
  type EuchreAction,
  type EuchreOptions,
  type EuchreState,
  type EuchreView,
  partnerOf,
  type Team,
  teamOf,
} from './euchre'

type EuchreSession = GameSession<EuchreState, EuchreAction, EuchreOptions, EuchreView>

const SUIT_NAME: Readonly<Record<Suit, string>> = {
  clubs: 'Kreuz',
  spades: 'Pik',
  hearts: 'Herz',
  diamonds: 'Karo',
}

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
  view: EuchreView
  myTeam: Team
  nameOf: (id: PlayerId) => string
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const r = view.handResults.at(-1)!
  const ours = r.makers === myTeam
  const makerEvent = [...view.events].reverse().find((e) => e.type === 'trump')
  let headline: string
  if (r.euchred) headline = ours ? 'Ihr wurdet euchred' : 'Gegner euchred!'
  else if (r.march) headline = ours ? 'Alle fünf Stiche!' : 'Gegner mit allen fünf Stichen'
  else headline = ours ? 'Ansage geschafft' : 'Gegner schaffen ihre Ansage'
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
            {headline}
          </h2>
          {makerEvent?.type === 'trump' && (
            <p className="mt-1 text-sm text-muted-foreground">
              Trumpf {SUIT_NAME[makerEvent.suit]} von {nameOf(makerEvent.player)}
              {r.alone && ' (allein)'}
            </p>
          )}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Team</th>
              <th className="py-1.5 text-right font-normal">Stiche</th>
              <th className="py-1.5 text-right font-normal">+</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[myTeam, (1 - myTeam) as Team].map((team) => (
              <tr key={team} className="border-b last:border-0">
                <td className={team === myTeam ? 'py-2 font-semibold' : 'py-2'}>
                  {team === myTeam ? 'Ihr' : 'Gegner'}
                </td>
                <td className="py-2 text-right">{r.tricks[team]}</td>
                <td className="py-2 text-right">{r.points[team]}</td>
                <td className="py-2 text-right font-medium">{view.scores[team]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-center text-xs text-muted-foreground">
          Gespielt wird bis {view.options.target} Punkte.
        </p>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

export default function EuchreTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as EuchreSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [alone, setAlone] = useState(false)

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
  const legal = myTurn ? session.legalActions(humanId) : []
  const bidding = view.phase === 'bid1' || view.phase === 'bid2'
  const discarding = myTurn && view.phase === 'discard'
  const legalIds = new Set(
    legal.flatMap((a) => (a.type === 'play' || a.type === 'discard' ? [a.cardId] : [])),
  )
  const canAlone = view.options.goAlone
  const canPass = legal.some((a) => a.type === 'pass')
  const callSuits = legal.flatMap((a) => (a.type === 'call' && !a.alone ? [a.suit] : []))

  const act = (action: EuchreAction) => {
    setAlone(false)
    session.dispatch(humanId, action)
  }

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const teamTricks = (team: Team) =>
    view.order
      .filter((p) => teamOf(view.order, p) === team)
      .reduce((s, p) => s + view.tricks[p]!, 0)

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'bid1')
    prompt = myTurn
      ? `${SUIT_NAME[view.upcard.suit]} als Trumpf? ${humanId === view.dealer ? 'Du nimmst die Karte auf.' : `${nameOf(view.dealer)} nimmt die Karte auf.`}`
      : `${nameOf(view.turn)} überlegt …`
  else if (view.phase === 'bid2')
    prompt = myTurn
      ? 'Bestimme eine andere Farbe als Trumpf oder passe'
      : `${nameOf(view.turn)} überlegt …`
  else if (view.phase === 'discard')
    prompt = discarding ? 'Lege eine Karte ab' : `${nameOf(view.dealer)} legt eine Karte ab …`
  else if (view.sittingOut === humanId) prompt = 'Dein Partner spielt allein – du setzt aus'
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const seatDetail = (p: PlayerId) => {
    const parts: string[] = []
    if (p === view.dealer) parts.push('Geber')
    if (p === view.maker) parts.push('Trumpf')
    if (p === view.sittingOut) parts.push('setzt aus')
    if (view.phase === 'playing' || view.phase === 'discard') parts.push(`${view.tricks[p]} St.`)
    return parts.join(' · ')
  }

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
              detail={seatDetail(player) || undefined}
            />
          ))}
        center={
          <DropZone ref={centerRef} active={dragging} label="Stich">
            <div className="pointer-events-none relative flex h-[calc(var(--card-h)*2.25)] w-[calc(var(--card-w)*3.2)] items-center justify-center">
              {bidding ? (
                <div className="flex flex-col items-center gap-1 text-xs text-white/80">
                  <PlayingCard
                    card={view.upcard}
                    faceDown={view.phase === 'bid2'}
                    aria-label={
                      view.phase === 'bid1'
                        ? `Aufgedeckt: ${cardName(view.upcard, style)}`
                        : 'Umgedrehte Karte'
                    }
                  />
                  <span>
                    {view.phase === 'bid1'
                      ? 'Aufgedeckte Karte'
                      : `${SUIT_NAME[view.upcard.suit]} ist aus`}
                  </span>
                </div>
              ) : (
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
                  ·{' '}
                </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Ihr {view.scores[myTeam]} · Gegner {view.scores[1 - myTeam]}
              {view.trump &&
                ` · Trumpf ${SUIT_NAME[view.trump]} · Stiche ${teamTricks(myTeam)}:${teamTricks((1 - myTeam) as Team)}`}
            </p>
            {myTurn && bidding && (
              <div className={cn('flex flex-wrap items-center justify-center gap-2')}>
                {view.phase === 'bid1' && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => act(alone ? { type: 'order', alone: true } : { type: 'order' })}
                  >
                    {humanId === view.dealer ? 'Aufnehmen' : 'Bestellen'}
                  </Button>
                )}
                {view.phase === 'bid2' &&
                  callSuits.map((suit) => (
                    <Button
                      key={suit}
                      variant="secondary"
                      className="h-11"
                      onClick={() =>
                        act(alone ? { type: 'call', suit, alone: true } : { type: 'call', suit })
                      }
                    >
                      {SUIT_NAME[suit]}
                    </Button>
                  ))}
                {canPass && (
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => act({ type: 'pass' })}
                  >
                    Passen
                  </Button>
                )}
                {canAlone && (
                  <label className="flex h-11 items-center gap-2 rounded-md bg-white/10 px-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={alone}
                      onChange={(e) => setAlone(e.target.checked)}
                    />
                    Allein spielen
                  </label>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn && (view.phase === 'playing' || discarding)}
            isPlayable={(card) => legalIds.has(card.id)}
            onPlay={(card) =>
              act(
                discarding
                  ? { type: 'discard', cardId: card.id }
                  : { type: 'play', cardId: card.id },
              )
            }
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
