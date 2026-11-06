import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Card, CardId, GameSession, PlayerId, Rank } from '@/engine'
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
  type CanastaAction,
  type CanastaOptions,
  type CanastaState,
  type CanastaView,
  type HandResult,
  isCanasta,
  isNaturalCanasta,
  isWild,
  type Meld,
  type MeldGroup,
  naturalRank,
  pointsOf,
} from './canasta'

type CanastaSession = GameSession<CanastaState, CanastaAction, CanastaOptions, CanastaView>

const RANK_LABEL: Partial<Record<Rank, string>> = { J: 'Buben', Q: 'Damen', K: 'Könige', A: 'Asse' }
const rankLabel = (rank: Rank) => RANK_LABEL[rank] ?? `${rank}er`

/** The rank a selection would meld as: all naturals of one rank (wild cards allowed). */
function rankOfSelection(cards: readonly Card[]): Rank | null {
  const ranks = new Set(cards.filter((c) => !isWild(c)).map(naturalRank))
  return ranks.size === 1 ? [...ranks][0]! : null
}

function MeldStack({
  meld,
  onClick,
  target,
}: {
  meld: Meld
  onClick?: () => void
  target?: boolean
}) {
  const style = useSettings((s) => s.deckStyle)
  const canasta = isCanasta(meld)
  const shown = canasta ? meld.cards.slice(0, 1) : meld.cards
  const label = `${rankLabel(meld.rank)}: ${meld.cards.length} Karten${
    canasta ? (isNaturalCanasta(meld) ? ', reiner Canasta' : ', gemischter Canasta') : ''
  } – ${meld.cards.map((c) => cardName(c, style)).join(', ')}`
  return (
    <button
      type="button"
      role="listitem"
      disabled={!onClick}
      onClick={onClick}
      aria-label={target ? `${label} – hier anlegen` : label}
      className={cn(
        'relative flex items-end rounded-md p-0.5',
        target && 'ring-2 ring-yellow-300',
        canasta && (isNaturalCanasta(meld) ? 'bg-red-500/40' : 'bg-black/40'),
      )}
    >
      {shown.map((c, i) => (
        <PlayingCard
          key={c.id}
          card={c}
          size="xs"
          style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.3)' }}
        />
      ))}
      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white tabular-nums">
        {meld.cards.length}
      </span>
    </button>
  )
}

function HandSummary({
  result,
  view,
  sideName,
  onContinue,
}: {
  result: HandResult
  view: CanastaView
  sideName: (side: number) => string
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])
  const rows: [string, keyof HandResult['sides'][number]][] = [
    ['Gemeldete Karten', 'melds'],
    ['Canastas', 'canastas'],
    ['Rote Dreien', 'redThrees'],
    ['Ausmachen', 'goingOut'],
    ['Karten auf der Hand', 'hand'],
    ['Diese Hand', 'total'],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="canasta-summary-title"
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="canasta-summary-title" className="text-center text-xl font-bold">
          {result.wentOut
            ? `${sideName(view.sides.findIndex((s) => s.includes(result.wentOut!)))} ${result.concealed ? 'macht verdeckt aus' : 'macht aus'}`
            : 'Der Stapel ist aufgebraucht'}
        </h2>
        <table className="w-full text-sm" aria-label="Wertung der Hand">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal" />
              {view.sides.map((_, s) => (
                <th key={s} className="py-1.5 text-right font-normal">
                  {sideName(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map(([label, key]) => (
              <tr key={key} className={cn('border-b', key === 'total' && 'font-semibold')}>
                <td className="py-1.5">{label}</td>
                {result.sides.map((side, s) => (
                  <td key={s} className="py-1.5 text-right">
                    {side[key]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5">Gesamt</td>
              {view.scores.map((score, s) => (
                <td key={s} className="py-1.5 text-right">
                  {score}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <Button ref={buttonRef} size="lg" className="w-full" onClick={onContinue}>
          Nächste Hand
        </Button>
      </div>
    </div>
  )
}

export default function CanastaTable({
  session: anySession,
  humanId,
  onPauseChange,
}: GameBodyProps) {
  const session = anySession as unknown as CanastaSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  const [staged, setStaged] = useState<readonly MeldGroup[]>([])

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
  const drawing = myTurn && view.phase === 'draw'
  const playing = myTurn && view.phase === 'play'

  const stagedIds = new Set(staged.flatMap((g) => g.cardIds))
  const byId = (id: CardId) => view.hand.find((c) => c.id === id)!
  const selection = [...selected].filter((id) => !stagedIds.has(id)).map(byId)
  const selectionRank = selection.length > 0 ? rankOfSelection(selection) : null

  const reset = () => {
    setSelected(new Set())
    setStaged([])
  }
  const act = (action: CanastaAction) => {
    reset()
    session.dispatch(humanId, action)
  }
  // A new turn starts with an empty selection.
  const turnKey = `${view.handNumber}-${view.turn}-${view.phase}`
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
  /** Puts the selection aside as a group of `rank` (merged with a staged group of that rank). */
  const stage = (rank: Rank) => {
    setStaged((groups) => {
      const ids = selection.map((c) => c.id)
      const existing = groups.find((g) => g.rank === rank)
      return existing
        ? groups.map((g) => (g === existing ? { ...g, cardIds: [...g.cardIds, ...ids] } : g))
        : [...groups, { rank, cardIds: ids }]
    })
    setSelected(new Set())
  }

  const takeAction: CanastaAction = { type: 'takePile', groups: staged }
  const meldAction: CanastaAction = { type: 'meld', groups: staged }
  const takeProblem = drawing && view.discardTop ? session.whyNot(humanId, takeAction) : null
  const meldProblem = playing && staged.length > 0 ? session.whyNot(humanId, meldAction) : null
  const stagedValue = pointsOf(staged.flatMap((g) => g.cardIds).map(byId))
  const single = selection.length === 1 && staged.length === 0 ? selection[0]! : null
  const discardProblem =
    playing && single ? session.whyNot(humanId, { type: 'discard', cardId: single.id }) : null

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (drawing)
    prompt =
      view.drawCount === 2
        ? 'Zieh zwei Karten vom Stapel – oder nimm den Ablagestapel auf'
        : 'Zieh vom Stapel – oder nimm den Ablagestapel auf'
  else if (playing) prompt = 'Melden (Karten wählen, vormerken, auslegen) und eine Karte ablegen'
  else prompt = `${nameOf(view.turn)} ist am Zug …`

  const lastEvent = view.events.find((e) => e.type === 'tookPile') ?? view.events.at(-1)
  const eventText =
    lastEvent?.type === 'tookPile' && lastEvent.player !== humanId
      ? `${nameOf(lastEvent.player)} nimmt den Stapel (${lastEvent.count} Karten)`
      : lastEvent?.type === 'discarded' && lastEvent.player !== humanId
        ? `${nameOf(lastEvent.player)} legt ${cardName(lastEvent.card, style)} ab`
        : lastEvent?.type === 'melded' && lastEvent.player !== humanId
          ? `${nameOf(lastEvent.player)} meldet (${lastEvent.value})`
          : null
  const hint = takeProblem && staged.length > 0 ? takeProblem : meldProblem

  return (
    <>
      <TableLayout
        opponents={others.map((player) => (
          <OpponentSeat
            key={player}
            name={nameOf(player)}
            cardCount={view.handSizes[player] ?? 0}
            active={!session.isOver && view.turn === player}
            detail={player === partner ? 'Partner' : undefined}
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
                label={view.pileFrozen ? 'Ablage · eingefroren' : 'Ablage'}
                count={view.discardCount}
                topCard={view.discardTop ?? undefined}
              />
            </div>
            {view.melds.map((melds, side) => (
              <section
                key={side}
                aria-label={`Meldungen: ${sideName(side)}`}
                className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1"
              >
                <span className="text-[11px] text-white/80">
                  {sideName(side)} · {view.scores[side]}
                  {view.redThrees[side]!.length > 0 &&
                    ` · rote Dreien: ${view.redThrees[side]!.length}`}
                </span>
                <div role="list" className="flex flex-wrap gap-x-2 gap-y-1">
                  {melds.map((meld) => {
                    const target =
                      side === view.mySide &&
                      myTurn &&
                      selection.length > 0 &&
                      (selectionRank === meld.rank ||
                        (selectionRank === null && selection.every(isWild)))
                    return (
                      <MeldStack
                        key={meld.rank}
                        meld={meld}
                        target={target}
                        onClick={target ? () => stage(meld.rank) : undefined}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        }
        status={
          <div className="flex flex-col items-center gap-2">
            <p>
              {eventText && <span className="text-white/80">{eventText} · </span>}
              <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            </p>
            <p className="text-xs text-white/80 tabular-nums">
              {view.minimum > 0
                ? `Erste Meldung: mindestens ${view.minimum} Punkte`
                : `Zum Ausmachen: ${view.canastasNeeded} ${view.canastasNeeded === 1 ? 'Canasta' : 'Canastas'}`}
              {staged.length > 0 &&
                ` · vorgemerkt: ${staged.map((g) => `${rankLabel(g.rank)} (${g.cardIds.length})`).join(', ')} = ${stagedValue}`}
            </p>
            {hint && <p className="text-xs text-yellow-100">{hint}</p>}
            {myTurn && (
              <div
                className={cn('flex max-w-3xl flex-wrap justify-center gap-1.5', LIFT_CLEARANCE)}
              >
                {selectionRank && selection.length >= 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    onClick={() => stage(selectionRank)}
                  >
                    {rankLabel(selectionRank)} vormerken
                  </Button>
                )}
                {selection.length > 0 &&
                  selection.every(isWild) &&
                  staged.map((g) => (
                    <Button
                      key={g.rank}
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => stage(g.rank)}
                    >
                      Zu {rankLabel(g.rank)} vormerken
                    </Button>
                  ))}
                {drawing && view.discardTop && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    disabled={takeProblem !== null}
                    onClick={() => act(takeAction)}
                  >
                    Ablage aufnehmen ({view.discardCount})
                  </Button>
                )}
                {playing && staged.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    disabled={meldProblem !== null}
                    onClick={() => act(meldAction)}
                  >
                    Auslegen ({stagedValue})
                  </Button>
                )}
                {staged.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 text-white"
                    onClick={() => setStaged([])}
                  >
                    Verwerfen
                  </Button>
                )}
                {single && playing && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    disabled={discardProblem !== null}
                    onClick={() => act({ type: 'discard', cardId: single.id })}
                  >
                    {cardName(single, style)} ablegen
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        hand={
          <Hand
            cards={view.hand}
            enabled={myTurn}
            isPlayable={(card) => !stagedIds.has(card.id)}
            onPlay={toggle}
            selection={{ selectedIds: selected, onToggle: toggle }}
            highlightIds={stagedIds}
          />
        }
      />
      {summaryOpen && (
        <HandSummary
          result={view.results.at(-1)!}
          view={view}
          sideName={sideName}
          onContinue={() => setSeenHands(view.results.length)}
        />
      )}
    </>
  )
}
