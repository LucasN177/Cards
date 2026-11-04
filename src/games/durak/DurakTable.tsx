import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
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
import type { DurakAction, DurakOptions, DurakState, DurakView } from './durak'

type DurakSession = GameSession<DurakState, DurakAction, DurakOptions, DurakView>

const SUIT_NAME: Readonly<Record<Suit, string>> = {
  clubs: 'Kreuz',
  spades: 'Pik',
  hearts: 'Herz',
  diamonds: 'Karo',
}

export default function DurakTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as DurakSession
  useSessionVersion(session)
  const style = useSettings((s) => s.deckStyle)
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const view = session.view(humanId)
  const nameOf = (id: PlayerId) => (id === humanId ? 'Du' : (session.player(id)?.name ?? id))
  const myTurn = !session.isOver && view.turn === humanId
  const legal = myTurn ? session.legalActions(humanId) : []
  const legalIds = new Set(
    legal.flatMap((a) => (a.type === 'attack' || a.type === 'defend' ? [a.cardId] : [])),
  )
  const canDone = legal.some((a) => a.type === 'done')
  const canTake = legal.some((a) => a.type === 'take')
  const defending = view.defender === humanId
  const out = view.finished.includes(humanId)

  const play = (cardId: string) => {
    const action = legal.find(
      (a) => (a.type === 'attack' || a.type === 'defend') && a.cardId === cardId,
    )
    if (action) session.dispatch(humanId, action)
  }

  let prompt: string
  if (session.isOver) prompt = 'Spiel beendet'
  else if (out) prompt = 'Du bist raus – keine Karten mehr'
  else if (myTurn && view.phase === 'defend') {
    prompt =
      legalIds.size > 0 ? 'Stich die Karte oder nimm auf' : 'Du kannst nicht stechen – nimm auf'
  } else if (myTurn) {
    prompt =
      view.table.length === 0
        ? `Greif ${nameOf(view.defender)} an: lege eine Karte`
        : legalIds.size > 0
          ? 'Lege eine Karte mit passendem Wert bei oder sag „Fertig“'
          : 'Nichts beizulegen – „Fertig“'
  } else if (view.phase === 'defend') prompt = `${nameOf(view.defender)} verteidigt …`
  else prompt = `${nameOf(view.turn)} greift an …`

  const last = view.events.find((e) => e.type === 'took' || e.type === 'beaten')
  const lastText =
    last?.type === 'took'
      ? `${last.player === humanId ? 'Du nimmst' : `${nameOf(last.player)} nimmt`} ${last.count} Karten auf`
      : last?.type === 'beaten'
        ? `${last.player === humanId ? 'Du hast' : `${nameOf(last.player)} hat`} alles abgewehrt`
        : null

  const role = (p: PlayerId) =>
    view.finished.includes(p)
      ? 'raus'
      : p === view.defender
        ? 'verteidigt'
        : p === view.attacker
          ? 'greift an'
          : null

  return (
    <TableLayout
      opponents={view.seats
        .filter((p) => p !== humanId)
        .map((player) => (
          <OpponentSeat
            key={player}
            name={nameOf(player)}
            cardCount={view.handSizes[player] ?? 0}
            active={!session.isOver && view.turn === player}
            detail={role(player) && <span>{role(player)}</span>}
          />
        ))}
      center={
        <div className="flex w-full items-center justify-center gap-4">
          <div className="flex shrink-0 flex-col items-center gap-1 text-xs text-white/80">
            <div className="relative h-(--card-h) w-[calc(var(--card-w)*1.3)]">
              {view.stockCount > 0 && (
                <PlayingCard
                  card={view.trumpCard}
                  className="absolute top-[12%] left-[30%] rotate-90"
                  aria-label={`Trumpf: ${cardName(view.trumpCard, style)}`}
                />
              )}
              {view.stockCount > 1 && <PlayingCard faceDown className="absolute top-0 left-0" />}
            </div>
            <span>
              Stapel {view.stockCount} · Trumpf {SUIT_NAME[view.trumpCard.suit]}
            </span>
          </div>
          <DropZone ref={centerRef} active={dragging} label="Tisch">
            <div
              className="grid min-h-[calc(var(--card-h)*1.3)] min-w-[calc(var(--card-w)*2)] grid-cols-3 gap-x-2 gap-y-3 p-1"
              aria-label="Angriffe auf dem Tisch"
              role="list"
            >
              <AnimatePresence>
                {view.table.map((pair) => (
                  <motion.div
                    key={pair.attack.id}
                    role="listitem"
                    className="relative h-[calc(var(--card-h)*1.2)] w-[calc(var(--card-w)*1.2)]"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    aria-label={
                      cardName(pair.attack, style) +
                      (pair.defense
                        ? ` – gestochen mit ${cardName(pair.defense, style)}`
                        : ' – offen')
                    }
                  >
                    <PlayingCard
                      card={pair.attack}
                      layoutId={pair.attack.id}
                      className="absolute top-0 left-0"
                    />
                    {pair.defense && (
                      <PlayingCard
                        card={pair.defense}
                        layoutId={pair.defense.id}
                        className="absolute top-[18%] left-[18%]"
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </DropZone>
        </div>
      }
      status={
        <div className="flex flex-col items-center gap-2">
          <p>
            {lastText && view.table.length === 0 && (
              <span className="text-white/80">{lastText} · </span>
            )}
            <span className={cn(myTurn && 'font-semibold text-yellow-200')}>{prompt}</span>
            {!out && !session.isOver && (
              <span className="text-white/80">
                {' '}
                · {defending ? 'Du verteidigst' : view.attacker === humanId ? 'Du greifst an' : ''}
                {view.table.length > 0 && ` · ${view.table.length}/${view.limit} Karten`}
              </span>
            )}
          </p>
          {(canDone || canTake) && (
            <div className="flex gap-2">
              {canTake && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 min-w-32"
                  onClick={() => session.dispatch(humanId, { type: 'take' })}
                >
                  Aufnehmen
                </Button>
              )}
              {canDone && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 min-w-32"
                  onClick={() => session.dispatch(humanId, { type: 'done' })}
                >
                  Fertig
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
          isPlayable={(card) => legalIds.has(card.id)}
          onPlay={(card) => play(card.id)}
          dropTarget={centerRef}
          onDragActiveChange={setDragging}
        />
      }
    />
  )
}
