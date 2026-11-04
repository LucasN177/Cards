import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, useSyncExternalStore } from 'react'
import type { GameSession } from '@/engine'
import type {
  HighCardAction,
  HighCardOptions,
  HighCardState,
  HighCardView,
} from '@/engine/testing/highCardGame'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Hand } from '@/features/table/Hand'
import { OpponentSeat } from '@/features/table/OpponentSeat'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { DropZone, TableLayout } from '@/features/table/TableLayout'

type HighCardSession = GameSession<HighCardState, HighCardAction, HighCardOptions, HighCardView>

const COARSE_POINTER = '(pointer: coarse)'
const subscribeToPointer = (onChange: () => void) => {
  const media = window.matchMedia(COARSE_POINTER)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const useCoarsePointer = () =>
  useSyncExternalStore(subscribeToPointer, () => window.matchMedia(COARSE_POINTER).matches)

const tricksLabel = (n: number) => (n === 1 ? '1 Stich' : `${n} Stiche`)

/** Table for the engine test game. Doubles as the reference for how game tables are built. */
export default function HighCardTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as HighCardSession
  useSessionVersion(session)
  const touch = useCoarsePointer()
  const centerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const view = session.view(humanId)
  const myTurn = session.currentPlayer === humanId
  const nameOf = (id: string) => session.player(id)?.name ?? id
  const opponents = session.players.filter((p) => p.id !== humanId)

  const showingLast = view.trick.length === 0 && view.lastTrick.length > 0
  const shownTrick = showingLast ? view.lastTrick : view.trick

  let status: string
  if (session.isOver) status = 'Spiel beendet'
  else if (myTurn) {
    status = touch
      ? 'Du bist dran – Karte zweimal antippen oder in die Mitte ziehen'
      : 'Du bist dran – Karte anklicken oder in die Mitte ziehen'
  } else status = `${nameOf(view.turn)} ist am Zug …`

  return (
    <TableLayout
      opponents={opponents.map((player) => (
        <OpponentSeat
          key={player.id}
          name={player.name}
          cardCount={view.handSizes[player.id] ?? 0}
          active={!session.isOver && view.turn === player.id}
          detail={tricksLabel(view.tricksWon[player.id] ?? 0)}
        />
      ))}
      center={
        <DropZone ref={centerRef} active={dragging} label="Tischmitte">
          <AnimatePresence mode="popLayout">
            {shownTrick.map(({ player, card }) => (
              <motion.div
                key={card.id}
                className="flex flex-col items-center gap-1"
                initial={player === humanId ? false : { opacity: 0, y: -60, scale: 0.7 }}
                animate={{ opacity: showingLast ? 0.75 : 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <PlayingCard card={card} layoutId={card.id} />
                <span className="max-w-20 truncate text-xs text-white/80">{nameOf(player)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </DropZone>
      }
      status={
        <>
          {/* Part of the status line (not its own row) so it also fits on landscape phones. */}
          {showingLast && view.lastWinner && (
            <span className="font-medium text-yellow-200">
              {view.lastWinner === humanId ? 'Du gewinnst' : `${nameOf(view.lastWinner)} gewinnt`}{' '}
              den Stich ·{' '}
            </span>
          )}
          {status} ·{' '}
          <span className="text-white/80">Du: {tricksLabel(view.tricksWon[humanId] ?? 0)}</span>
        </>
      }
      hand={
        <Hand
          cards={view.hand}
          enabled={myTurn}
          onPlay={(card) => session.dispatch(humanId, { type: 'play', cardId: card.id })}
          dropTarget={centerRef}
          onDragActiveChange={setDragging}
        />
      }
    />
  )
}
