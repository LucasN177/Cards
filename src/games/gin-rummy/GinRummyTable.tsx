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
  canBigGin,
  deadwoodAfter,
  type GinAction,
  type GinOptions,
  type GinState,
  type GinView,
  type HandResult,
} from './gin'
import { bestArrangement, sortCards } from './melds'

type GinSession = GameSession<GinState, GinAction, GinOptions, GinView>

const OUTCOME_TEXT: Readonly<Record<HandResult['outcome'], string>> = {
  knock: 'klopft',
  gin: 'macht Gin',
  bigGin: 'macht Big Gin',
  undercut: 'klopft – und wird unterschnitten',
  void: '',
}

/** A row of small cards (a meld, or the deadwood). */
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
  humanId,
  onContinue,
}: {
  result: HandResult
  view: GinView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const style = useSettings((s) => s.deckStyle)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const names = (cards: readonly Card[]) => cards.map((c) => cardName(c, style)).join(', ')
  const title =
    result.outcome === 'void'
      ? 'Keine Wertung – der Stapel ist aufgebraucht'
      : `${result.knocker === humanId ? 'Du' : nameOf(result.knocker!)} ${OUTCOME_TEXT[result.outcome]}`
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gin-summary-title"
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="gin-summary-title" className="text-xl font-bold">
            {title}
          </h2>
          {result.winner && (
            <p className="mt-1 font-medium text-yellow-600 dark:text-yellow-400">
              {result.winner === humanId ? 'Du bekommst' : `${nameOf(result.winner)} bekommt`}{' '}
              {result.points} Punkte{result.doubled ? ' (Pik: doppelt)' : ''}
            </p>
          )}
        </div>
        {result.outcome !== 'void' && (
          <div className="space-y-3">
            {view.order.map((id) => (
              <section key={id} aria-label={nameOf(id)} className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {nameOf(id)} – Totholz {result.deadwoodValue[id]}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.melds[id]!.map((meld, i) => (
                    <CardRow
                      key={i}
                      cards={meld.cards}
                      label={`${meld.kind === 'set' ? 'Satz' : 'Folge'}: ${names(meld.cards)}`}
                    />
                  ))}
                  {result.deadwood[id]!.length > 0 && (
                    <div className="opacity-70">
                      <CardRow
                        cards={result.deadwood[id]!}
                        label={`Totholz: ${names(result.deadwood[id]!)}`}
                      />
                    </div>
                  )}
                </div>
                {id !== result.knocker && result.laidOff.length > 0 && (
                  <p className="text-xs text-muted-foreground">Angelegt: {names(result.laidOff)}</p>
                )}
              </section>
            ))}
          </div>
        )}
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <tbody className="tabular-nums">
            {view.order.map((id) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-1.5 font-semibold' : 'py-1.5'}>{nameOf(id)}</td>
                <td className="py-1.5 text-right font-medium">{view.scores[id]}</td>
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

/** The hand as the player would hold it: melds first (in order), then the deadwood. */
function arrange(hand: readonly SuitedCard[]) {
  const { melds, deadwood, value } = bestArrangement(hand)
  return {
    cards: [...melds.flatMap((m) => m.cards), ...sortCards(deadwood)],
    melded: new Set(melds.flatMap((m) => m.cards.map((c) => c.id))),
    deadwood: value,
  }
}

export default function GinRummyTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as GinSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [selected, setSelected] = useState<CardId | null>(null)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const opponent = view.order.find((p) => p !== humanId)!

  const [seenHands, setSeenHands] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenHands
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const upcard = myTurn && view.phase === 'upcard'
  const drawing = myTurn && view.phase === 'draw'
  const playing = myTurn && view.phase === 'play'
  const { cards, melded, deadwood } = arrange(view.hand)

  const act = (action: GinAction) => {
    setSelected(null)
    session.dispatch(humanId, action)
  }
  const card = selected ? view.hand.find((c) => c.id === selected) : undefined
  const afterDiscard = card ? deadwoodAfter(view.hand, card.id) : null
  const canKnock = card !== undefined && afterDiscard! <= view.knockLimit
  const takenBlocked = card?.id === view.takenDiscard

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (upcard) prompt = 'Nimmst du die aufgedeckte Karte?'
  else if (drawing)
    prompt = view.stockOnly
      ? 'Zieh eine Karte vom Stapel'
      : 'Zieh vom Stapel oder nimm die oberste Ablage'
  else if (playing) prompt = 'Wähle eine Karte zum Ablegen – oder klopf'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastEvent = view.events.at(-1)
  const eventText =
    lastEvent?.type === 'discarded' && lastEvent.player !== humanId
      ? `${nameOf(lastEvent.player)} legt ${cardName(lastEvent.card, style)} ab`
      : lastEvent?.type === 'drew' && lastEvent.player !== humanId
        ? lastEvent.card
          ? `${nameOf(lastEvent.player)} nimmt ${cardName(lastEvent.card, style)}`
          : `${nameOf(lastEvent.player)} zieht vom Stapel`
        : lastEvent?.type === 'passed' && lastEvent.player !== humanId
          ? `${nameOf(lastEvent.player)} passt`
          : null

  const target = view.options.targetScore
  return (
    <>
      <TableLayout
        opponents={
          <OpponentSeat
            name={nameOf(opponent)}
            cardCount={view.handSizes[opponent] ?? 0}
            active={!session.isOver && view.turn === opponent}
            detail={<span className="tabular-nums">{view.scores[opponent]} Punkte</span>}
          />
        }
        center={
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-end gap-4">
              <CardPile
                label="Stapel"
                count={view.stockCount}
                onClick={() => act({ type: 'drawStock' })}
                disabled={!drawing}
                highlight={drawing}
              />
              <CardPile
                label="Ablage"
                count={view.discardPile.length}
                topCard={view.discardTop ?? undefined}
                onClick={() => act({ type: upcard ? 'takeUpcard' : 'drawDiscard' })}
                disabled={!(upcard || (drawing && !view.stockOnly)) || !view.discardTop}
                highlight={upcard}
              />
            </div>
            {(view.options.oklahoma || view.knockLimit !== 10) && (
              <p className="text-xs text-white/80">
                {view.knockLimit === 0 ? 'Nur Gin' : `Klopfen bis ${view.knockLimit}`}
                {view.doubled ? ' · Pik: Hand zählt doppelt' : ''}
              </p>
            )}
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {eventText && <span className="text-white/80">{eventText} · </span>}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              Totholz {deadwood} · du {view.scores[humanId]}
              {target > 0 ? ` von ${target}` : ''} Punkten · Hand {view.handNumber + 1}
            </p>
            {(upcard || playing) && (
              <div className={cn('flex flex-wrap justify-center gap-1.5', LIFT_CLEARANCE)}>
                {upcard && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => act({ type: 'takeUpcard' })}
                    >
                      {view.discardTop ? `${cardName(view.discardTop, style)} nehmen` : 'Nehmen'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => act({ type: 'pass' })}
                    >
                      Passen
                    </Button>
                  </>
                )}
                {playing && canBigGin(view.hand, view.options) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    onClick={() => act({ type: 'knock' })}
                  >
                    Big Gin!
                  </Button>
                )}
                {playing && card && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      disabled={takenBlocked}
                      onClick={() => act({ type: 'discard', cardId: card.id })}
                    >
                      {cardName(card, style)} ablegen
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      disabled={takenBlocked || !canKnock}
                      onClick={() => act({ type: 'knock', cardId: card.id })}
                    >
                      {afterDiscard === 0 ? 'Gin!' : `Klopfen (Totholz ${afterDiscard})`}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={cards}
            enabled={playing}
            onPlay={(c) => setSelected((s) => (s === c.id ? null : c.id))}
            selection={{
              selectedIds: new Set(selected ? [selected] : []),
              onToggle: (c) => setSelected((s) => (s === c.id ? null : c.id)),
            }}
            highlightIds={melded}
          />
        }
      />
      {summaryOpen && (
        <HandSummary
          result={view.results.at(-1)!}
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenHands(view.results.length)}
        />
      )}
    </>
  )
}
