import { Trophy } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { GameResult, PlayerId, PlayerInfo } from '@/engine'

interface GameOverDialogProps {
  readonly result: GameResult
  readonly players: readonly PlayerInfo[]
  readonly humanId: PlayerId
  readonly onRestart: () => void
  readonly onExit: () => void
}

export function GameOverDialog({
  result,
  players,
  humanId,
  onRestart,
  onExit,
}: GameOverDialogProps) {
  const restartRef = useRef<HTMLButtonElement>(null)
  useEffect(() => restartRef.current?.focus(), [])

  const won = result.winners.includes(humanId)
  const ranking = result.ranking
    ? result.ranking.flatMap((id) => players.filter((p) => p.id === id))
    : [...players].sort((a, b) => (result.scores[b.id] ?? 0) - (result.scores[a.id] ?? 0))
  const winnerNames = players.filter((p) => result.winners.includes(p.id)).map((p) => p.name)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
        className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Trophy className={won ? 'size-10 text-yellow-500' : 'size-10 text-muted-foreground'} />
          <h2 id="game-over-title" className="text-2xl font-bold">
            {won ? (result.winners.length > 1 ? 'Unentschieden!' : 'Gewonnen!') : 'Verloren'}
          </h2>
          {!won && winnerNames.length > 0 && (
            <p className="text-muted-foreground">{winnerNames.join(' & ')} gewinnt.</p>
          )}
        </div>
        <ol className="divide-y rounded-lg border" aria-label="Ergebnis">
          <li className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground">
            <span>Platz</span>
            <span>{result.scoreLabel ?? 'Punkte'}</span>
          </li>
          {ranking.map((player, index) => (
            <li key={player.id} className="flex justify-between px-3 py-2 text-sm">
              <span className={player.id === humanId ? 'font-semibold' : undefined}>
                {index + 1}. {player.name}
              </span>
              <span className="tabular-nums">{result.scores[player.id] ?? 0}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button ref={restartRef} size="lg" className="flex-1" onClick={onRestart}>
            Nochmal spielen
          </Button>
          <Button size="lg" variant="outline" className="flex-1" onClick={onExit}>
            Spielauswahl
          </Button>
        </div>
      </div>
    </div>
  )
}
