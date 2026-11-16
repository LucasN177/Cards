import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Card, CardId, GameSession, PlayerId, SuitedCard } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { CardPile } from '@/features/table/CardPile'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import {
  cardValue,
  type CribbageAction,
  type CribbageEvent,
  type CribbageOptions,
  type CribbageState,
  type CribbageView,
  type HandResult,
  type ScoreItem,
  type ScoreKind,
} from './cribbage'

type CribbageSession = GameSession<CribbageState, CribbageAction, CribbageOptions, CribbageView>

const KIND_LABEL: Readonly<Record<ScoreKind, string>> = {
  fifteen: 'Fünfzehn',
  pair: 'Paar',
  run: 'Folge',
  flush: 'Flush',
  nobs: 'Nobs',
  thirtyOne: 'Einunddreißig',
  go: 'Go',
  lastCard: 'Letzte Karte',
  heels: 'His Heels',
}

const pairLabel = (n: number) => (n === 2 ? 'Paar' : n === 3 ? 'Drilling' : 'Vierling')

/** "Fünfzehn 4 · Paar 2 · Folge 3" – grouped by kind. */
function describeItems(items: readonly ScoreItem[]) {
  const parts: string[] = []
  const kinds = [...new Set(items.map((i) => i.kind))]
  for (const kind of kinds) {
    const of = items.filter((i) => i.kind === kind)
    const points = of.reduce((s, i) => s + i.points, 0)
    if (kind === 'pair') {
      for (const i of of) parts.push(`${pairLabel(i.cards.length)} ${i.points}`)
    } else if (kind === 'run') {
      const length = of[0]!.cards.length
      parts.push(of.length > 1 ? `${of.length} Folgen à ${length}: ${points}` : `Folge ${points}`)
    } else if (kind === 'fifteen' && of.length > 1) {
      parts.push(`${of.length} × Fünfzehn: ${points}`)
    } else parts.push(`${KIND_LABEL[kind]} ${points}`)
  }
  return parts.join(' · ')
}

function CardRow({ cards, label }: { cards: readonly Card[]; label: string }) {
  return (
    <div className="flex" role="img" aria-label={label}>
      {cards.map((c, i) => (
        <PlayingCard
          key={c.id}
          card={c}
          size="xs"
          style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.22)' }}
        />
      ))}
    </div>
  )
}

function HandSummary({
  result,
  view,
  nameOf,
  sideName,
  onContinue,
}: {
  result: HandResult
  view: CribbageView
  nameOf: (id: PlayerId) => string
  sideName: (side: number) => string
  onContinue: () => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const names = (cards: readonly Card[]) => cards.map((c) => cardName(c, style)).join(', ')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cribbage-summary-title"
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 id="cribbage-summary-title" className="text-xl font-bold">
            Auszählen – Hand {result.hand + 1}
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Starter
            <PlayingCard card={result.starter} size="xs" />
          </div>
        </div>
        <div className="space-y-3">
          {result.shows.map((s) => (
            <section
              key={`${s.player}-${s.crib}`}
              aria-label={s.crib ? `Crib von ${nameOf(s.player)}` : nameOf(s.player)}
              className="space-y-1"
            >
              <h3 className="flex justify-between text-sm font-semibold">
                <span>{s.crib ? `Crib (${nameOf(s.player)})` : nameOf(s.player)}</span>
                <span className="tabular-nums">{s.total}</span>
              </h3>
              <CardRow cards={s.cards} label={names(s.cards)} />
              <p className="text-xs text-muted-foreground">
                {s.items.length > 0 ? describeItems(s.items) : 'Keine Punkte'}
              </p>
            </section>
          ))}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal" />
              <th className="py-1.5 text-right font-normal">Spiel</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {view.scores.map((score, side) => (
              <tr key={side} className="border-b last:border-0">
                <td className={side === view.mySide ? 'py-1.5 font-semibold' : 'py-1.5'}>
                  {sideName(side)}
                </td>
                <td className="py-1.5 text-right">{result.pegging[side]}</td>
                <td className="py-1.5 text-right font-medium">{score}</td>
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

/** The board: one track per side up to the target. */
function Board({ view, sideName }: { view: CribbageView; sideName: (side: number) => string }) {
  const target = view.options.targetScore
  return (
    <div className="w-full max-w-sm space-y-1" aria-label="Brett" role="group">
      {view.scores.map((score, side) => (
        <div key={side} className="flex items-center gap-2 text-[11px] text-white/90">
          <span className="w-24 truncate text-right">{sideName(side)}</span>
          <div
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/30"
            role="meter"
            aria-label={`${sideName(side)}: ${score} von ${target}`}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={score}
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
                side === view.mySide ? 'bg-yellow-300' : 'bg-sky-300',
              )}
              style={{ width: `${Math.min(100, (score / target) * 100)}%` }}
            />
          </div>
          <span className="w-14 tabular-nums">
            {score}/{target}
          </span>
        </div>
      ))}
    </div>
  )
}

function eventText(
  e: CribbageEvent,
  nameOf: (id: PlayerId) => string,
  style: ReturnType<typeof useSettings.getState>['deckStyle'],
) {
  switch (e.type) {
    case 'played': {
      const points = e.items.reduce((s, i) => s + i.points, 0)
      const base = `${nameOf(e.player)}: ${cardName(e.card, style)} (${e.count})`
      return points > 0 ? `${base} – ${describeItems(e.items)}` : base
    }
    case 'go':
      return `${nameOf(e.player)}: Go`
    case 'goPoint':
      return `${e.last ? 'Letzte Karte' : 'Go'} – 1 für ${nameOf(e.player)}`
    case 'cut':
      return `Starter: ${cardName(e.card, style)}${e.heels ? ' – His Heels, 2 für den Geber' : ''}`
    default:
      return null
  }
}

export default function CribbageTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as CribbageSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const partner = view.sides[view.mySide]!.find((p) => p !== humanId)
  const sideName = (side: number) =>
    side === view.mySide
      ? partner
        ? 'Ihr'
        : 'Du'
      : view.sides[side]!.map((p) => nameOf(p)).join(' & ')
  const myIndex = view.order.indexOf(humanId)
  const others = view.order
    .slice(1)
    .map((_, i) => view.order[(myIndex + 1 + i) % view.order.length]!)

  const [seenHands, setSeenHands] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const cribbing = myTurn && view.phase === 'crib'
  const playing = myTurn && view.phase === 'play'
  const needed = view.cribNeeded[humanId] ?? 0

  // A new hand starts with an empty selection.
  const [lastHand, setLastHand] = useState(view.handNumber)
  if (lastHand !== view.handNumber) {
    setLastHand(view.handNumber)
    setSelected(new Set())
  }

  const toggle = (card: Card) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(card.id)) next.delete(card.id)
      else if (next.size < needed) next.add(card.id)
      return next
    })
  const act = (action: CribbageAction) => {
    setSelected(new Set())
    session.dispatch(humanId, action)
  }

  const cribName = view.dealer === humanId ? 'deinen Crib' : `den Crib von ${nameOf(view.dealer)}`
  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (cribbing)
    prompt = `Wähle ${needed === 1 ? 'eine Karte' : `${needed} Karten`} für ${cribName}`
  else if (playing) prompt = 'Spiel eine Karte – die Summe darf 31 nicht übersteigen'
  else if (view.phase === 'crib') prompt = `${nameOf(view.turn)} gibt in den Crib …`
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  // The last few things that happened, across moves (so a "go" is not lost behind the next card).
  const [log, setLog] = useState({ events: view.events, texts: [] as string[] })
  if (log.events !== view.events) {
    const fresh = view.events
      .map((e) => eventText(e, nameOf, style))
      .filter((t): t is string => t !== null)
    setLog({ events: view.events, texts: [...log.texts, ...fresh].slice(-3) })
  }
  const texts = log.texts

  const cribSelection = [...selected]
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
              [player === partner ? 'Partner' : null, player === view.dealer ? 'Geber' : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        ))}
        center={
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex items-end gap-4">
              <CardPile label="Starter" count={1} topCard={view.starter ?? undefined} />
              <CardPile
                label={`Crib (${view.dealer === humanId ? 'deiner' : nameOf(view.dealer)})`}
                count={view.cribCount}
              />
            </div>
            <section
              aria-label="Gespielte Karten"
              className="flex min-h-[calc(var(--card-h)*0.75)] flex-col items-center gap-1"
            >
              {view.phase === 'play' && (
                <>
                  <div className="flex">
                    {view.series.map((p, i) => (
                      <PlayingCard
                        key={p.card.id}
                        card={p.card}
                        size="sm"
                        aria-label={`${nameOf(p.player)}: ${cardName(p.card, style)}`}
                        style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.45)' }}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-white tabular-nums">
                    Summe {view.count}
                  </p>
                </>
              )}
            </section>
            <Board view={view} sideName={sideName} />
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            {texts.length > 0 && <p className="text-white/80">{texts.join(' · ')}</p>}
            <p className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</p>
            {cribbing && (
              <div className={cn('flex flex-wrap justify-center gap-1.5', LIFT_CLEARANCE)}>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-10"
                  disabled={cribSelection.length !== needed}
                  onClick={() => act({ type: 'crib', cardIds: cribSelection })}
                >
                  In den Crib legen ({cribSelection.length}/{needed})
                </Button>
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={cribbing || playing}
            isPlayable={(card) => cribbing || view.count + cardValue(card as SuitedCard) <= 31}
            onPlay={(card) => (cribbing ? toggle(card) : act({ type: 'play', cardId: card.id }))}
            selection={cribbing ? { selectedIds: selected, onToggle: toggle } : undefined}
          />
        }
      />
      {summaryOpen && (
        <HandSummary
          result={view.results[seenHands]!}
          view={view}
          nameOf={nameOf}
          sideName={sideName}
          onContinue={() => setSeenHands((n) => n + 1)}
        />
      )}
    </>
  )
}
