import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Card, CardId, GameSession, PlayerId } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { CardPile } from '@/features/table/CardPile'
import { Hand, LIFT_CLEARANCE } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { TableLayout } from '@/features/table/TableLayout'
import { cn } from '@/lib/utils'
import { useSettings } from '@/stores/settingsStore'
import { analyzeMeld, layOff, type Meld, meldValue } from './melds'
import type { RommeAction, RommeOptions, RommeState, RommeView, RoundResult } from './romme'

type RommeSession = GameSession<RommeState, RommeAction, RommeOptions, RommeView>

function RoundSummary({
  result,
  view,
  nameOf,
  humanId,
  onContinue,
}: {
  result: RoundResult
  view: RommeView
  nameOf: (id: PlayerId) => string
  humanId: PlayerId
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-summary-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="text-center">
          <h2 id="round-summary-title" className="text-xl font-bold">
            {result.winner === humanId ? 'Du bist fertig!' : `${nameOf(result.winner)} ist fertig`}
          </h2>
          {result.handRomme && (
            <p className="mt-1 font-medium text-yellow-600 dark:text-yellow-400">
              Hand-Rommé – die Strafpunkte zählen doppelt.
            </p>
          )}
        </div>
        <table className="w-full text-sm" aria-label="Zwischenstand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Spieler</th>
              <th className="py-1.5 text-right font-normal">Diese Runde</th>
              <th className="py-1.5 text-right font-normal">Gesamt</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {view.order.map((id) => (
              <tr key={id} className="border-b last:border-0">
                <td className={id === humanId ? 'py-2 font-semibold' : 'py-2'}>{nameOf(id)}</td>
                <td className="py-2 text-right">{result.penalties[id]}</td>
                <td className="py-2 text-right font-medium">{view.scores[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-center text-xs text-muted-foreground">Strafpunkte – wenig ist gut.</p>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Runde
        </Button>
      </div>
    </div>
  )
}

export default function RommeTable({ session: anySession, humanId, onPauseChange }: GameBodyProps) {
  const session = anySession as unknown as RommeSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  /** Groups put aside for laying out together (the first lay-out needs enough points). */
  const [staged, setStaged] = useState<readonly (readonly CardId[])[]>([])

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myIndex = view.order.indexOf(humanId)
  const others = view.order
    .slice(1)
    .map((_, i) => view.order[(myIndex + 1 + i) % view.order.length]!)

  const [seenRounds, setSeenRounds] = useState(view.results.length)
  const summaryOpen = !session.isOver && view.results.length > seenRounds
  useEffect(() => onPauseChange?.(summaryOpen), [summaryOpen, onPauseChange])
  useEffect(() => () => onPauseChange?.(false), [onPauseChange])

  const myTurn = !session.isOver && view.turn === humanId && !summaryOpen
  const drawing = myTurn && view.phase === 'draw'
  const playing = myTurn && view.phase === 'play'
  const stagedIds = new Set(staged.flat())
  const byId = (id: CardId) => view.hand.find((c) => c.id === id)!
  const selectedCards = [...selected].filter((id) => !stagedIds.has(id)).map(byId)
  const selectionMeld = selectedCards.length >= 3 ? analyzeMeld(selectedCards) : null
  const stagedValue = staged.reduce((s, g) => s + meldValue(analyzeMeld(g.map(byId))!), 0)
  const hasMelded = view.hasMelded[humanId]!
  const enough = hasMelded || stagedValue >= view.options.firstMeld
  const layOffTargets = new Set(
    hasMelded && selectedCards.length > 0
      ? view.melds.filter((m) => layOff(m, selectedCards)).map((m) => m.id)
      : [],
  )

  const reset = () => {
    setSelected(new Set())
    setStaged([])
  }
  const act = (action: RommeAction) => {
    reset()
    session.dispatch(humanId, action)
  }
  // A new turn (or round) starts with an empty selection.
  const turnKey = `${view.round}-${view.turn}-${view.phase}`
  const [lastKey, setLastKey] = useState(turnKey)
  if (lastKey !== turnKey) {
    setLastKey(turnKey)
    if (!playing) reset()
  }

  const toggle = (card: Card) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (drawing) prompt = 'Zieh eine Karte vom Stapel oder nimm die oberste Ablage'
  else if (playing) {
    prompt = hasMelded
      ? 'Auslegen, anlegen (Karten wählen, dann Kombination antippen) und zum Schluss eine Karte ablegen'
      : `Zum ersten Auslegen brauchst du ${view.options.firstMeld} Punkte – oder leg eine Karte ab`
  } else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastEvent = view.events.at(-1)
  const eventText =
    lastEvent?.type === 'melded'
      ? `${nameOf(lastEvent.player)} legt aus (${lastEvent.value} Punkte)`
      : lastEvent?.type === 'discarded' && lastEvent.player !== humanId
        ? `${nameOf(lastEvent.player)} legt ${cardName(lastEvent.card, style)} ab`
        : lastEvent?.type === 'drew' &&
            lastEvent.from === 'discard' &&
            lastEvent.player !== humanId &&
            lastEvent.card
          ? `${nameOf(lastEvent.player)} nimmt ${cardName(lastEvent.card, style)}`
          : null

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
              <span className="tabular-nums">
                {view.hasMelded[player] ? 'ausgelegt' : 'noch nicht'} · {view.scores[player]}
              </span>
            }
          />
        ))}
        center={
          <div className="flex w-full flex-col items-center gap-2">
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
                count={view.discardTop ? 1 : 0}
                topCard={view.discardTop ?? undefined}
                onClick={() => act({ type: 'drawDiscard' })}
                disabled={!drawing || !view.discardTop}
              />
            </div>
            {view.melds.length > 0 && (
              <div
                className="flex max-h-[calc(var(--card-h)*1.6)] max-w-full flex-wrap justify-center gap-x-3 gap-y-1 overflow-y-auto px-1"
                role="list"
                aria-label="Ausgelegte Kombinationen"
              >
                {view.melds.map((meld: Meld) => {
                  const target = layOffTargets.has(meld.id)
                  return (
                    <button
                      key={meld.id}
                      type="button"
                      role="listitem"
                      disabled={!target}
                      onClick={() =>
                        act({
                          type: 'layOff',
                          meldId: meld.id,
                          cardIds: selectedCards.map((c) => c.id),
                        })
                      }
                      aria-label={`${meld.kind === 'set' ? 'Satz' : 'Folge'}: ${meld.cards.map((c) => cardName(c, style)).join(', ')}${target ? ' – hier anlegen' : ''}`}
                      className={cn('flex rounded-md p-0.5', target && 'ring-2 ring-yellow-300')}
                    >
                      {meld.cards.map((c, i) => (
                        <PlayingCard
                          key={c.id}
                          card={c}
                          size="xs"
                          style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.25)' }}
                        />
                      ))}
                    </button>
                  )
                })}
              </div>
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
              Runde {view.round}/{view.options.rounds} · deine Strafpunkte {view.scores[humanId]}
              {staged.length > 0 &&
                ` · vorgemerkt: ${staged.length} ${staged.length === 1 ? 'Gruppe' : 'Gruppen'}, ${stagedValue} Punkte`}
            </p>
            {playing && (
              <div
                className={cn('flex max-w-3xl flex-wrap justify-center gap-1.5', LIFT_CLEARANCE)}
              >
                {selectionMeld && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    onClick={() => {
                      setStaged((g) => [...g, selectedCards.map((c) => c.id)])
                      setSelected(new Set())
                    }}
                  >
                    {selectionMeld.kind === 'set' ? 'Satz' : 'Folge'} vormerken (
                    {meldValue(selectionMeld)})
                  </Button>
                )}
                {staged.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      disabled={!enough}
                      onClick={() => act({ type: 'meld', melds: staged })}
                    >
                      Auslegen ({stagedValue})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 text-white"
                      onClick={() => setStaged([])}
                    >
                      Verwerfen
                    </Button>
                  </>
                )}
                {selectedCards.length === 1 && staged.length === 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    disabled={selectedCards[0]!.id === view.takenDiscard && view.hand.length > 1}
                    onClick={() => act({ type: 'discard', cardId: selectedCards[0]!.id })}
                  >
                    {cardName(selectedCards[0]!, style)} ablegen
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={playing}
            isPlayable={(card) => !stagedIds.has(card.id)}
            onPlay={toggle}
            selection={{ selectedIds: selected, onToggle: toggle }}
            highlightIds={stagedIds}
          />
        }
      />
      {summaryOpen && (
        <RoundSummary
          result={view.results.at(-1)!}
          view={view}
          nameOf={nameOf}
          humanId={humanId}
          onContinue={() => setSeenRounds(view.results.length)}
        />
      )}
    </>
  )
}
