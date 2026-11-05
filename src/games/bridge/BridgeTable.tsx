import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, PlayerId, SuitedCard } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  type BridgeAction,
  type BridgeOptions,
  type BridgeState,
  type BridgeView,
  type Call,
  callLabel,
  contractLabel,
  type DealResult,
  partnerOf,
  seatName,
  type Side,
  sideOf,
  STRAIN_SYMBOL,
  STRAINS,
} from './bridge'

type BridgeSession = GameSession<BridgeState, BridgeAction, BridgeOptions, BridgeView>

const TRICK_POSITION = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'left-0 top-1/2 -translate-y-1/2',
  'top-0 left-1/2 -translate-x-1/2',
  'right-0 top-1/2 -translate-y-1/2',
] as const
const ENTER_FROM = [{ y: 60 }, { x: -60 }, { y: -60 }, { x: 60 }] as const

const sideName = (s: Side) => (s === 'ns' ? 'Nord/Süd' : 'Ost/West')
const RED = new Set(['hearts', 'diamonds'])

function resultText(r: DealResult) {
  if (!r.contract) return 'Alle haben gepasst'
  const c = r.contract
  if (r.overtricks === 0) return `${contractLabel(c)} genau erfüllt`
  if (r.overtricks > 0)
    return `${contractLabel(c)} mit ${r.overtricks} Überstich${r.overtricks > 1 ? 'en' : ''}`
  return `${contractLabel(c)}, ${-r.overtricks} Faller`
}

function DealSummary({
  result,
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  result: DealResult
  view: BridgeView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const mySide = sideOf(view.order, humanId)
  const gained = result.score[mySide] - result.score[mySide === 'ns' ? 'ew' : 'ns']
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="deal-summary-title" className="text-xl font-bold">
            Austeilung {result.number}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultText(result)}
            {result.contract &&
              ` · ${nameOf(result.contract.declarer)} (${seatName(view.order, result.contract.declarer)}) spielte`}
          </p>
          {result.contract && (
            <p
              className={cn(
                'text-sm font-medium',
                gained < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {gained >= 0 ? `+${gained}` : gained} für euch
            </p>
          )}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Seite</th>
              <th className="py-1.5 text-right font-normal">Austeilung</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(['ns', 'ew'] as const).map((s) => (
              <tr key={s} className="border-b last:border-0">
                <td className={s === mySide ? 'py-2 font-semibold' : 'py-2'}>
                  {sideName(s)} {s === mySide && '(ihr)'}
                  {result.vulnerable[s] && (
                    <span className="ml-1 text-xs text-destructive">in Gefahr</span>
                  )}
                </td>
                <td className="py-2 text-right">{result.score[s]}</td>
                <td className="py-2 text-right font-medium">{view.scores[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Austeilung
        </Button>
      </div>
    </div>
  )
}

/** The auction so far in four columns (West, North, East, South). */
function AuctionTable({ view }: { view: BridgeView }) {
  const columns = [1, 2, 3, 0].map((i) => view.order[i]!)
  const start = columns.indexOf(view.dealer)
  const cells: (Call | null)[] = [...Array(start).fill(null), ...view.auction.map((c) => c.call)]
  const rows: (Call | null)[][] = []
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4))
  return (
    <table className="text-center text-xs text-white tabular-nums" aria-label="Reizung">
      <thead className="text-white/70">
        <tr>
          {columns.map((p) => (
            <th key={p} className="w-12 px-1 font-normal">
              {seatName(view.order, p)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(-5).map((row, i) => (
          <tr key={i}>
            {[0, 1, 2, 3].map((j) => {
              const call = row[j]
              const red = call?.type === 'bid' && RED.has(call.strain)
              return (
                <td key={j} className={cn('px-1 py-0.5 font-semibold', red && 'text-red-300')}>
                  {call ? callLabel(call) : ''}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function BridgeTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as BridgeSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [level, setLevel] = useState<number | null>(null)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const seatOf = (id: PlayerId) => (view.order.indexOf(id) - myIndex + 4) % 4
  const others = [1, 2, 3].map((i) => view.order[(myIndex + i) % 4]!)
  const mySide = sideOf(view.order, humanId)
  const partner = partnerOf(view.order, humanId)

  const [seenDeals, setSeenDeals] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenDeals
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const c = view.contract
  const declarer = c?.declarer ?? null
  const actor = view.phase === 'playing' && view.turn === view.dummy ? declarer : view.turn
  const myTurn = !session.isOver && actor === humanId && !summaryOpen
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const playingDummy = myTurn && view.phase === 'playing' && view.turn === view.dummy
  const playingOwn = myTurn && view.phase === 'playing' && view.turn === humanId
  const can = (call: Call) => legal.some((l) => JSON.stringify(l) === JSON.stringify(call))
  const act = (action: BridgeAction) => {
    setLevel(null)
    session.dispatch(humanId, action)
  }

  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null

  const role = (p: PlayerId) => {
    const parts: string[] = [seatName(view.order, p)]
    if (p === partner) parts.push('Partner')
    if (c && p === declarer) parts.push('spielt')
    if (c && p === view.dummy) parts.push('Dummy')
    if (view.phase === 'auction' && p === view.dealer) parts.push('Geber')
    return parts.join(' · ')
  }

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'auction')
    prompt = myTurn ? 'Dein Gebot' : `${nameOf(view.turn)} bietet …`
  else if (view.dummy === humanId)
    prompt = `Du bist Dummy – ${nameOf(declarer!)} spielt deine Karten`
  else if (playingDummy) prompt = 'Spiel eine Karte vom Dummy'
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const vulText = (['ns', 'ew'] as const).filter((s) => view.vulnerable[s]).map(sideName)

  const dummyCards: readonly SuitedCard[] | null = view.dummy !== humanId ? view.dummyHand : null

  return (
    <>
      <TableLayout
        opponents={others.map((player) => (
          <OpponentSeat
            key={player}
            name={nameOf(player)}
            cardCount={view.handSizes[player] ?? 0}
            active={!session.isOver && view.turn === player}
            detail={<span>{role(player)}</span>}
          />
        ))}
        center={
          <div className="flex flex-col items-center gap-2">
            {view.phase === 'auction' && <AuctionTable view={view} />}
            {dummyCards && dummyCards.length > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[0.65rem] text-white/70">
                  Dummy: {nameOf(view.dummy!)} ({seatName(view.order, view.dummy!)})
                </span>
                <div
                  className="flex flex-wrap justify-center"
                  role="group"
                  aria-label="Karten des Dummys"
                >
                  {dummyCards.map((card, i) => {
                    const playable = playingDummy && legalIds.has(card.id)
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!playable}
                        aria-label={cardName(card, style)}
                        onClick={() => act({ type: 'play', cardId: card.id })}
                        className={cn(
                          'rounded-[7%] transition-transform',
                          playable
                            ? 'ring-2 ring-yellow-300 hover:-translate-y-1'
                            : playingDummy && 'brightness-75',
                        )}
                        style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.25)' }}
                      >
                        <PlayingCard card={card} size="sm" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {view.phase === 'playing' && (
              <DropZone ref={centerRef} active={dragging} label="Stich">
                <div className="pointer-events-none relative h-[calc(var(--card-h)*2)] w-[calc(var(--card-w)*3.2)]">
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
            )}
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
              Austeilung {view.dealNumber}/{view.options.deals}
              {c && ` · ${contractLabel(c)} von ${nameOf(c.declarer)}`}
              {view.phase === 'playing' &&
                ` · Stiche ihr ${view.tricksWon[mySide]} : ${view.tricksWon[mySide === 'ns' ? 'ew' : 'ns']}`}
              {` · in Gefahr: ${vulText.length ? vulText.join(', ') : 'niemand'}`}
            </p>
            {myTurn && view.phase === 'auction' && (
              <div
                className={cn('flex max-w-3xl flex-wrap justify-center gap-1.5', LIFT_CLEARANCE)}
                role="group"
                aria-label="Bietbox"
              >
                {level === null ? (
                  <>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant="secondary"
                        className="h-10 min-w-10"
                        disabled={!STRAINS.some((strain) => can({ type: 'bid', level: n, strain }))}
                        onClick={() => setLevel(n)}
                      >
                        {n}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Passe
                    </Button>
                    {can({ type: 'double' }) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-10"
                        onClick={() => act({ type: 'double' })}
                      >
                        Kontra
                      </Button>
                    )}
                    {can({ type: 'redouble' }) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-10"
                        onClick={() => act({ type: 'redouble' })}
                      >
                        Rekontra
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 text-white"
                      onClick={() => setLevel(null)}
                    >
                      Zurück
                    </Button>
                    {STRAINS.map((strain) => (
                      <Button
                        key={strain}
                        size="sm"
                        variant="secondary"
                        className={cn('h-10 min-w-12 text-base', RED.has(strain) && 'text-red-600')}
                        disabled={!can({ type: 'bid', level, strain })}
                        aria-label={`${level} ${strain === 'notrump' ? 'Sans Atout' : STRAIN_SYMBOL[strain]} bieten`}
                        onClick={() => act({ type: 'bid', level, strain })}
                      >
                        {level}
                        {STRAIN_SYMBOL[strain]}
                      </Button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={playingOwn}
            isPlayable={(card) => legalIds.has(card.id)}
            onPlay={(card) => act({ type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
          />
        }
      />
      {summaryOpen && (
        <DealSummary
          result={view.results.at(-1)!}
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenDeals(view.results.length)}
        />
      )}
    </>
  )
}
