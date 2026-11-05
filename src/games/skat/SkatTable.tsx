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
import { useSettings } from '@/stores/settingsStore'
import {
  BID_VALUES,
  type DeclareAction,
  declareOptions,
  gameName,
  minimumValue,
  positionOf,
  type SkatAction,
  type SkatGame,
  type SkatGameResult,
  type SkatOptions,
  type SkatState,
  type SkatView,
} from './skat'

type SkatSession = GameSession<SkatState, SkatAction, SkatOptions, SkatView>

/** Seat of a player in the trick, seen from the human (bottom): next player left, other right. */
const TRICK_POSITION = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'left-0 top-1/4',
  'right-0 top-1/4',
] as const
const ENTER_FROM = [{ y: 60 }, { x: -60 }, { x: 60 }] as const

function describeGame(r: SkatGameResult) {
  if (!r.game) return 'Eingepasst'
  const extras = [
    r.hand && 'Hand',
    r.announcement.ouvert && 'ouvert',
    r.announcement.schwarz ? 'Schwarz angesagt' : r.announcement.schneider && 'Schneider angesagt',
  ].filter(Boolean)
  return [gameName(r.game), ...extras].join(' ')
}

function GameSummary({
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  view: SkatView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const r = view.results.at(-1)!
  let headline: string
  if (!r.declarer) headline = 'Alle haben gepasst'
  else if (r.declarer === humanId) headline = r.won ? 'Spiel gewonnen!' : 'Spiel verloren'
  else headline = r.won ? `${nameOf(r.declarer)} gewinnt` : `${nameOf(r.declarer)} verliert`
  const details: string[] = []
  if (r.game && r.game.type !== 'null') {
    details.push(`${r.points} Augen`)
    details.push(`${r.matadors} Spitzen`)
    if (r.schwarz) details.push('Schwarz')
    else if (r.schneider) details.push('Schneider')
  }
  if (r.overbid) details.push(`überreizt (${r.bid})`)
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
            Spiel {r.number}: {describeGame(r)}
            {r.declarer && ` · Wert ${r.value}`}
          </p>
          {details.length > 0 && (
            <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Skat:</span>
          <span
            className="flex gap-1"
            aria-label={r.skat.map((c) => cardName(c, style)).join(', ')}
          >
            {r.skat.map((c) => (
              <PlayingCard key={c.id} card={c} size="xs" />
            ))}
          </span>
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
              const d = r.delta[id] ?? 0
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

/** Game choice for the declarer, with the least value each game is worth. */
function DeclarePanel({
  view,
  hand,
  onDeclare,
}: {
  view: SkatView
  hand: boolean
  onDeclare: (action: DeclareAction) => void
}) {
  const [schneider, setSchneider] = useState(false)
  const [schwarz, setSchwarz] = useState(false)
  const cards = [...view.hand, ...(view.skat ?? [])]
  const announce = { schneider: schneider || schwarz, schwarz }
  const options = declareOptions(hand)
  const pick = (game: SkatGame, ouvert = false): DeclareAction => {
    if (game.type === 'null')
      return ouvert ? { type: 'declare', game, ouvert: true } : { type: 'declare', game }
    if (schwarz) return { type: 'declare', game, schneider: true, schwarz: true }
    if (schneider) return { type: 'declare', game, schneider: true }
    return { type: 'declare', game }
  }
  const games = options.filter((o) => !o.schneider && !o.ouvert)
  const button = (action: DeclareAction, label: string) => {
    const value = minimumValue(
      cards,
      action.game,
      hand,
      action.game.type === 'null' ? action : announce,
    )
    const tooLow = value < view.bid
    return (
      <Button
        key={label}
        variant="secondary"
        className={cn('h-11 flex-col gap-0 px-3 leading-tight', tooLow && 'opacity-70')}
        onClick={() => onDeclare(action)}
        aria-label={`${label} ansagen (Wert mindestens ${value})`}
      >
        <span>{label}</span>
        <span className={cn('text-[0.65rem] font-normal', tooLow && 'text-destructive')}>
          {tooLow ? `nur ${value}` : `≥ ${value}`}
        </span>
      </Button>
    )
  }
  return (
    <div className={cn('flex max-w-3xl flex-col items-center gap-2', LIFT_CLEARANCE)}>
      <div
        className="flex flex-wrap justify-center gap-1.5"
        role="group"
        aria-label="Spiel ansagen"
      >
        {games.map((o) => button(pick(o.game), gameName(o.game)))}
        {button(pick({ type: 'null' }, true), 'Null ouvert')}
      </div>
      {hand && (
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4"
              checked={schneider || schwarz}
              onChange={(e) => setSchneider(e.target.checked)}
            />
            Schneider angesagt
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4"
              checked={schwarz}
              onChange={(e) => setSchwarz(e.target.checked)}
            />
            Schwarz angesagt
          </label>
        </div>
      )}
      <p className="text-xs text-white/70">
        Gereizt bis {view.bid}. Rot: Das Spiel reicht dafür nicht.
      </p>
    </div>
  )
}

export default function SkatTable({ session: anySession, humanId, onPauseChange }: GameBodyProps) {
  const session = anySession as unknown as SkatSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<CardId>>(new Set())
  const [handMode, setHandMode] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const seatOf = (id: PlayerId) => (view.order.indexOf(id) - myIndex + 3) % 3
  const others = [1, 2].map((i) => view.order[(myIndex + i) % 3]!)

  const [seenGames, setSeenGames] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenGames
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(legal.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
  const act = (action: SkatAction) => {
    setChosen(new Set())
    setHandMode(false)
    session.dispatch(humanId, action)
  }

  const b = view.bidding
  const nextBid = BID_VALUES.find((v) => v > b.value) ?? null
  const showingLast = view.trick.length === 0 && view.lastTrick !== null && view.phase === 'playing'
  const shownTrick = showingLast ? view.lastTrick!.cards : view.trick
  const lastWinner = showingLast ? view.lastTrick!.winner : null
  const discarding = myTurn && view.phase === 'discard'

  const role = (p: PlayerId) => {
    if (view.declarer && view.phase !== 'bidding')
      return p === view.declarer ? 'Alleinspieler' : 'Gegenspieler'
    return positionOf(view.order, view.dealer, p)
  }
  const lastBidEvent = view.events.find(
    (e) => e.type === 'bid' || e.type === 'hold' || e.type === 'passed',
  )
  const bidStatus = (p: PlayerId) => {
    if (view.phase !== 'bidding') return null
    // Stage 1: Hinterhand is still waiting; later only bidder and listener are left.
    const out =
      b.stage === 2 ? p !== b.bidder && p !== b.listener : b.stage === 3 && p !== b.listener
    if (out) return 'passt'
    if (b.bidder === p || b.listener === p) return b.value > 0 ? `${b.value}` : null
    return 'wartet'
  }

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (view.phase === 'bidding') {
    if (!myTurn)
      prompt = `${nameOf(view.turn)} ${b.waiting === 'listener' ? 'überlegt' : 'reizt'} …`
    else if (b.stage === 3) prompt = 'Alle haben gepasst – willst du 18 spielen?'
    else if (b.waiting === 'listener') prompt = `${nameOf(b.bidder)} reizt ${b.value}. Hältst du?`
    else
      prompt =
        b.value > 0
          ? `${nameOf(b.listener)} hält ${b.value}. Weiter reizen?`
          : `Reize ${nameOf(b.listener)}`
  } else if (view.phase === 'skat')
    prompt = myTurn
      ? `Du spielst (gereizt ${view.bid}): Skat aufnehmen oder Hand spielen?`
      : `${nameOf(view.declarer!)} überlegt …`
  else if (view.phase === 'discard')
    prompt = discarding ? 'Wähle zwei Karten zum Drücken' : `${nameOf(view.declarer!)} drückt …`
  else if (view.phase === 'declare')
    prompt = myTurn ? 'Sag dein Spiel an' : `${nameOf(view.declarer!)} sagt an …`
  else if (myTurn) prompt = 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const gameLine =
    view.game &&
    `${gameName(view.game)}${view.handGame ? ' Hand' : ''}${view.announcement.ouvert ? ' ouvert' : ''}${
      view.announcement.schwarz
        ? ' · Schwarz angesagt'
        : view.announcement.schneider
          ? ' · Schneider angesagt'
          : ''
    } · ${nameOf(view.declarer!)} · gereizt ${view.bid}`

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
                {role(player)}
                {bidStatus(player) && ` · ${bidStatus(player)}`}
                {view.phase === 'playing' && ` · ${view.tricksWon[player]} St.`}
              </span>
            }
          />
        ))}
        center={
          <div className="flex flex-col items-center gap-2">
            {view.openHand && view.declarer !== humanId && (
              <div
                className="flex flex-col items-center gap-0.5"
                aria-label={`Offene Karten von ${nameOf(view.declarer!)}`}
              >
                <div className="flex">
                  {view.openHand.map((c, i) => (
                    <PlayingCard
                      key={c.id}
                      card={c}
                      size="xs"
                      style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.2)' }}
                    />
                  ))}
                </div>
                <span className="text-[0.65rem] text-white/70">
                  offen: {nameOf(view.declarer!)}
                </span>
              </div>
            )}
            <DropZone ref={centerRef} active={dragging} label="Stich">
              <div className="pointer-events-none relative h-[calc(var(--card-h)*1.9)] w-[calc(var(--card-w)*3.2)]">
                {view.phase !== 'playing' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-white/80">
                    <div className="flex gap-1">
                      {view.skat && view.phase === 'declare' ? (
                        view.skat.map((c) => <PlayingCard key={c.id} card={c} size="sm" />)
                      ) : (
                        <>
                          <PlayingCard faceDown size="sm" />
                          <PlayingCard faceDown size="sm" />
                        </>
                      )}
                    </div>
                    <span>{view.phase === 'declare' && view.skat ? 'Gedrückt' : 'Skat'}</span>
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
              {view.phase === 'bidding' && !myTurn && lastBidEvent?.type === 'passed' && (
                <span className="text-white/80">{nameOf(lastBidEvent.player)} passt · </span>
              )}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Spiel {view.gameNumber}/{view.options.games} · Du: {role(humanId)}
              {gameLine && ` · ${gameLine}`}
              {view.phase === 'playing' &&
                view.game?.type !== 'null' &&
                ` · deine Augen ${view.myPoints}`}
            </p>

            {myTurn && view.phase === 'bidding' && (
              <div className={cn('flex gap-2', LIFT_CLEARANCE)}>
                {b.stage === 3 ? (
                  <>
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'bid', value: 18 })}
                    >
                      Spielen (18)
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Einpassen
                    </Button>
                  </>
                ) : b.waiting === 'listener' ? (
                  <>
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'hold' })}
                    >
                      Ja ({b.value})
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Passe
                    </Button>
                  </>
                ) : (
                  <>
                    {nextBid !== null && (
                      <Button
                        variant="secondary"
                        className="h-11"
                        onClick={() => act({ type: 'bid', value: nextBid })}
                      >
                        Reizen {nextBid}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="h-11"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Passe
                    </Button>
                  </>
                )}
              </div>
            )}

            {myTurn && view.phase === 'skat' && !handMode && (
              <div className={cn('flex gap-2', LIFT_CLEARANCE)}>
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={() => act({ type: 'takeSkat' })}
                >
                  Skat aufnehmen
                </Button>
                <Button variant="secondary" className="h-11" onClick={() => setHandMode(true)}>
                  Hand spielen
                </Button>
              </div>
            )}
            {myTurn && view.phase === 'skat' && handMode && (
              <DeclarePanel view={view} hand onDeclare={act} />
            )}
            {myTurn && view.phase === 'declare' && (
              <DeclarePanel view={view} hand={false} onDeclare={act} />
            )}
            {discarding && (
              <Button
                size="lg"
                variant="secondary"
                className={cn('h-11 min-w-40', LIFT_CLEARANCE)}
                disabled={chosen.size !== 2}
                onClick={() => act({ type: 'discard', cardIds: [...chosen] })}
              >
                Drücken ({chosen.size}/2)
              </Button>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn && (view.phase === 'playing' || discarding)}
            isPlayable={(card) => discarding || legalIds.has(card.id)}
            onPlay={(card) => act({ type: 'play', cardId: card.id })}
            dropTarget={centerRef}
            onDragActiveChange={setDragging}
            selection={
              discarding
                ? {
                    selectedIds: chosen,
                    onToggle: (card) =>
                      setChosen((current) => {
                        const next = new Set(current)
                        if (next.has(card.id)) next.delete(card.id)
                        else if (next.size < 2) next.add(card.id)
                        return next
                      }),
                  }
                : undefined
            }
          />
        }
      />
      {summaryOpen && (
        <GameSummary
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenGames(view.results.length)}
        />
      )}
    </>
  )
}
