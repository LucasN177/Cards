import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GameSession, SuitedCard } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { type GameBodyProps, useSessionVersion } from '@/features/table/session'
import { cn } from '@/lib/utils'
import {
  type BlackjackAction,
  type BlackjackOptions,
  type BlackjackState,
  type BlackjackView,
  BETS,
  handValue,
  type Move,
  type Outcome,
  type PlayerHand,
} from './blackjack'

type BlackjackSession = GameSession<
  BlackjackState,
  BlackjackAction,
  BlackjackOptions,
  BlackjackView
>

const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  blackjack: 'Blackjack!',
  win: 'Gewonnen',
  push: 'Unentschieden',
  lose: 'Verloren',
}

const MOVE_LABEL: Readonly<Record<Move, string>> = {
  hit: 'Karte',
  stand: 'Stehen',
  double: 'Verdoppeln',
  split: 'Teilen',
}

function CardRow({ cards, label }: { cards: readonly (SuitedCard | null)[]; label: string }) {
  return (
    <div className="flex justify-center" role="group" aria-label={label}>
      <AnimatePresence initial={false}>
        {cards.map((card, i) => (
          <motion.div
            key={card ? card.id : `hidden-${i}`}
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.45)' }}
          >
            {card ? <PlayingCard card={card} /> : <PlayingCard faceDown />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function HandBox({
  hand,
  active,
  index,
  count,
}: {
  hand: PlayerHand
  active: boolean
  index: number
  count: number
}) {
  const { total, soft } = handValue(hand.cards)
  const signed = hand.payout > 0 ? `+${hand.payout}` : hand.payout < 0 ? `−${-hand.payout}` : '±0'
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-2xl p-2',
        active && 'bg-white/10 ring-2 ring-yellow-300',
      )}
    >
      <CardRow cards={hand.cards} label={count > 1 ? `Deine Hand ${index + 1}` : 'Deine Hand'} />
      <p className="text-sm text-white tabular-nums">
        <strong>
          {total > 21 ? `${total} – überkauft` : soft && total < 21 ? `${total} (weich)` : total}
        </strong>
        <span className="text-white/75">
          {' '}
          · Einsatz {hand.bet}
          {hand.doubled ? ' (verdoppelt)' : ''}
        </span>
      </p>
      {hand.outcome && (
        <p
          role="status"
          className={cn(
            'rounded-full px-3 py-0.5 text-sm font-semibold',
            hand.outcome === 'lose' ? 'bg-black/40 text-white' : 'bg-yellow-300 text-zinc-900',
          )}
        >
          {OUTCOME_TEXT[hand.outcome]} {signed}
        </p>
      )}
    </div>
  )
}

export default function BlackjackTable({ session: anySession, humanId }: GameBodyProps) {
  const session = anySession as unknown as BlackjackSession
  const version = useSessionVersion(session)
  const [hintAt, setHintAt] = useState<number | null>(null)
  const view = session.view(humanId)
  const legal = session.legalActions(humanId)
  const can = (type: BlackjackAction['type']) => legal.some((a) => a.type === type)
  const act = (action: BlackjackAction) => session.dispatch(humanId, action)
  const hint = hintAt === version ? view.hint : null

  const big = 'h-12 flex-1 text-base'
  const moveButton = (move: Move) => (
    <Button
      key={move}
      size="lg"
      variant="secondary"
      className={cn(big, hint === move && 'animate-pulse ring-4 ring-yellow-300')}
      disabled={!can(move)}
      onClick={() => act({ type: move })}
    >
      {MOVE_LABEL[move]}
    </Button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 pt-3 px-safe pb-safe text-white">
      <section aria-label="Bank" className="flex flex-col items-center gap-1.5">
        <p className="text-sm text-white/80">
          Bank
          {view.dealerValue !== null && (
            <strong className="text-white"> · {view.dealerValue}</strong>
          )}
        </p>
        {view.dealer.length > 0 ? (
          <CardRow cards={view.dealer} label="Karten der Bank" />
        ) : (
          <div className="h-(--card-h)" />
        )}
      </section>

      <p className="text-center text-sm text-white/85 tabular-nums" aria-live="polite">
        <strong className="text-yellow-200">Chips: {view.chips}</strong> · Runde{' '}
        {Math.max(1, view.round)}/{view.rounds}
        {view.reshuffled && view.phase !== 'betting' && ' · neu gemischt'}
      </p>

      <section aria-label="Deine Hände" className="flex flex-wrap items-end justify-center gap-3">
        {view.hands.map((hand, i) => (
          <HandBox
            key={i}
            hand={hand}
            index={i}
            count={view.hands.length}
            active={view.phase === 'playing' && view.hands.length > 1 && i === view.active}
          />
        ))}
        {view.hands.length === 0 && (
          <p className="py-8 text-center text-white/85">
            Wähle deinen Einsatz für die nächste Runde.
          </p>
        )}
      </section>

      <div className="mx-auto flex w-full max-w-md flex-col gap-2 pb-3">
        {view.phase === 'betting' && (
          <>
            <div className="flex gap-2">
              {BETS.map((amount) => (
                <Button
                  key={amount}
                  size="lg"
                  variant="secondary"
                  className={big}
                  disabled={!legal.some((a) => a.type === 'bet' && a.amount === amount)}
                  onClick={() => act({ type: 'bet', amount })}
                >
                  {amount} setzen
                </Button>
              ))}
            </div>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 text-white hover:bg-white/15 hover:text-white"
              onClick={() => act({ type: 'leave' })}
            >
              Aufhören und Chips zählen
            </Button>
          </>
        )}
        {view.phase === 'playing' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['hit', 'stand', 'double', 'split'] as const).map(moveButton)}
            </div>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 text-white hover:bg-white/15 hover:text-white"
              onClick={() => setHintAt(version)}
              disabled={!view.hint}
            >
              <Lightbulb /> Tipp (Grundstrategie)
            </Button>
          </>
        )}
        {view.phase === 'settled' && (
          <div className="flex gap-2">
            <Button
              size="lg"
              variant="secondary"
              className={big}
              onClick={() => act({ type: 'next' })}
            >
              {view.round >= view.rounds ? 'Abrechnen' : 'Nächste Runde'}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-12 text-white hover:bg-white/15 hover:text-white"
              onClick={() => act({ type: 'leave' })}
            >
              Aufhören
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
