import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { evaluate, handName } from './handRank'
import type { HandResult, HoldemAction, HoldemOptions, HoldemState, HoldemView } from './holdem'

type HoldemSession = GameSession<HoldemState, HoldemAction, HoldemOptions, HoldemView>

function HandSummary({
  result,
  view,
  nameOf,
  onContinue,
}: {
  result: HandResult
  view: HoldemView
  nameOf: (id: PlayerId) => string
  onContinue: () => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const shown = Object.keys(result.shown)
  const main = result.pots[0]
  const title =
    shown.length === 0
      ? `${nameOf(main?.winners[0] ?? '')} gewinnt – alle anderen sind ausgestiegen`
      : main && main.winners.length > 1
        ? 'Geteilter Pot'
        : `${nameOf(main?.winners[0] ?? '')} gewinnt mit ${handName(result.scores[main?.winners[0] ?? '']!)}`
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="holdem-summary-title"
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="holdem-summary-title" className="text-center text-xl font-bold">
          {title}
        </h2>
        {result.board.length > 0 && (
          <div
            className="flex justify-center gap-1"
            role="img"
            aria-label={`Board: ${result.board.map((c) => cardName(c, style)).join(', ')}`}
          >
            {result.board.map((c) => (
              <PlayingCard key={c.id} card={c} size="xs" />
            ))}
          </div>
        )}
        {shown.length > 0 && (
          <ul className="space-y-2" aria-label="Aufgedeckte Hände">
            {shown.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <div
                  className="flex"
                  role="img"
                  aria-label={result.shown[p]!.map((c) => cardName(c, style)).join(', ')}
                >
                  {result.shown[p]!.map((c) => (
                    <PlayingCard key={c.id} card={c} size="xs" />
                  ))}
                </div>
                <span className="text-sm">
                  <strong>{nameOf(p)}</strong>: {handName(result.scores[p]!)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {result.pots.length > 1 && (
          <ul className="text-sm text-muted-foreground">
            {result.pots.map((pot, i) => (
              <li key={i}>
                {i === 0 ? 'Hauptpot' : `Nebenpot ${i}`} ({pot.amount}):{' '}
                {pot.winners.map(nameOf).join(' & ')}
              </li>
            ))}
          </ul>
        )}
        <table className="w-full text-sm" aria-label="Chips">
          <tbody className="tabular-nums">
            {view.order.map((p) => (
              <tr key={p} className="border-b last:border-0">
                <td className="py-1.5">
                  {nameOf(p)}
                  {result.busted.includes(p) && ' – ausgeschieden'}
                </td>
                <td
                  className={cn(
                    'py-1.5 text-right',
                    (result.net[p] ?? 0) > 0 && 'text-green-600 dark:text-green-400',
                  )}
                >
                  {result.net[p] !== undefined && result.net[p] !== 0
                    ? `${result.net[p]! > 0 ? '+' : ''}${result.net[p]}`
                    : ''}
                </td>
                <td className="py-1.5 text-right font-medium">{view.stacks[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

const ACTION_TEXT = (action: HoldemAction, amount: number) => {
  switch (action.type) {
    case 'fold':
      return 'steigt aus'
    case 'check':
      return 'schiebt'
    case 'call':
      return `geht mit (${amount})`
    case 'raise':
      return `erhöht auf ${action.to}`
  }
}

export default function HoldemTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as HoldemSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const others = view.order
    .slice(1)
    .map((_, i) => view.order[(myIndex + 1 + i) % view.order.length]!)

  const [seenHands, setSeenHands] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const inHand = view.seated.includes(humanId) && !view.folded.includes(humanId)
  const canRaise = view.maxRaiseTo > view.currentBet
  const [amount, setAmount] = useState(view.minRaiseTo)
  // A new decision starts at the minimum raise.
  const decisionKey = `${view.handNumber}-${view.street}-${view.currentBet}-${view.turn}`
  const [lastKey, setLastKey] = useState(decisionKey)
  if (lastKey !== decisionKey) {
    setLastKey(decisionKey)
    setAmount(view.minRaiseTo)
  }
  const raiseTarget = Math.max(view.minRaiseTo, Math.min(view.maxRaiseTo, amount))
  const potRaise = (fraction: number) =>
    // A pot-sized raise: call first, then raise by the pot after calling.
    view.currentBet + Math.round((view.pot + view.toCall) * fraction)

  const act = (action: HoldemAction) => session.dispatch(humanId, action)
  const myHand =
    view.hole.length === 2 && view.board.length >= 3
      ? handName(evaluate([...view.hole, ...view.board]))
      : null

  const last = view.events.findLast((e) => e.type === 'acted')
  const eventText =
    last?.type === 'acted' && last.player !== humanId
      ? `${nameOf(last.player)} ${ACTION_TEXT(last.action, last.amount)}`
      : null

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (!view.seated.includes(humanId)) prompt = 'Du bist ausgeschieden'
  else if (view.folded.includes(humanId))
    prompt = 'Du bist ausgestiegen – die anderen spielen weiter'
  else if (myTurn) prompt = view.toCall > 0 ? `${view.toCall} zum Mitgehen` : 'Du bist dran'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const seatDetail = (p: PlayerId) => {
    const parts = [`${view.stacks[p]}`]
    if (view.bets[p]! > 0) parts.push(`Einsatz ${view.bets[p]}`)
    if (!view.seated.includes(p)) return 'ausgeschieden'
    if (view.folded.includes(p)) parts.push('raus')
    else if (view.stacks[p] === 0) parts.push('all-in')
    return parts.join(' · ')
  }

  return (
    <>
      <TableLayout
        opponents={others.map((p) => (
          <OpponentSeat
            key={p}
            name={`${nameOf(p)}${p === view.button ? ' (D)' : ''}`}
            cardCount={view.seated.includes(p) && !view.folded.includes(p) ? 2 : 0}
            active={!session.isOver && view.turn === p}
            detail={<span className="tabular-nums">{seatDetail(p)}</span>}
          />
        ))}
        center={
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1.5" role="list" aria-label="Board">
              {Array.from({ length: 5 }, (_, i) => {
                const card = view.board[i]
                return card ? (
                  <PlayingCard
                    key={card.id}
                    card={card}
                    role="listitem"
                    aria-label={cardName(card, style)}
                  />
                ) : (
                  <div
                    key={i}
                    aria-hidden
                    className="h-[var(--card-h)] w-[var(--card-w)] rounded-lg border-2 border-dashed border-white/25"
                  />
                )
              })}
            </div>
            <p className="font-semibold text-yellow-200 tabular-nums" aria-live="polite">
              Pot: {view.pot}
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Blinds {view.smallBlind}/{view.bigBlind} · Hand {view.handNumber + 1}
              {view.options.handLimit > 0 ? ` von ${view.options.handLimit}` : ''}
            </p>
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {eventText && <span className="text-white/80">{eventText} · </span>}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Deine Chips: {view.stacks[humanId]}
              {view.bets[humanId]! > 0 && ` · Einsatz ${view.bets[humanId]}`}
              {view.button === humanId && ' · du hast den Dealer-Button'}
              {myHand && inHand && ` · ${myHand}`}
            </p>
            {myTurn && (
              <div className="flex w-full max-w-xl flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-1.5">
                  {view.toCall > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => act({ type: 'fold' })}
                    >
                      Aussteigen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    onClick={() => act(view.toCall > 0 ? { type: 'call' } : { type: 'check' })}
                  >
                    {view.toCall > 0
                      ? view.toCall >= view.stacks[humanId]!
                        ? `Mitgehen – all-in (${view.toCall})`
                        : `Mitgehen (${view.toCall})`
                      : 'Schieben'}
                  </Button>
                  {canRaise && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => act({ type: 'raise', to: raiseTarget })}
                    >
                      {raiseTarget === view.maxRaiseTo
                        ? `All-in (${raiseTarget})`
                        : view.currentBet === 0
                          ? `Setzen ${raiseTarget}`
                          : `Erhöhen auf ${raiseTarget}`}
                    </Button>
                  )}
                </div>
                {canRaise && view.maxRaiseTo > view.minRaiseTo && (
                  <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
                    {(
                      [
                        ['Min', view.minRaiseTo],
                        ['½ Pot', potRaise(0.5)],
                        ['Pot', potRaise(1)],
                        ['All-in', view.maxRaiseTo],
                      ] as const
                    ).map(([label, to]) => (
                      <Button
                        key={label}
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-white"
                        onClick={() => setAmount(to)}
                      >
                        {label}
                      </Button>
                    ))}
                    <input
                      type="range"
                      aria-label="Betrag"
                      min={view.minRaiseTo}
                      max={view.maxRaiseTo}
                      step={view.smallBlind}
                      value={raiseTarget}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-40 accent-yellow-300"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        }
        hand={<Hand cards={view.hole} enabled={false} onPlay={() => {}} />}
      />
      {summaryOpen && (
        <HandSummary
          result={view.results.at(-1)!}
          view={view}
          nameOf={nameOf}
          onContinue={() => setSeenHands(view.results.length)}
        />
      )}
    </>
  )
}
