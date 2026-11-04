import { Trophy } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  type GameResult,
  isSeriesOver,
  type PlayerId,
  type PlayerInfo,
  seriesStandings,
  seriesWinners,
} from '@/engine'

export interface SeriesProgress {
  readonly rounds: number
  /** Results of all finished rounds, including the one that just ended. */
  readonly results: readonly GameResult[]
}

interface GameOverDialogProps {
  readonly result: GameResult
  readonly players: readonly PlayerInfo[]
  readonly humanId: PlayerId
  /** Present for a series of more than one round. */
  readonly series?: SeriesProgress
  readonly onRestart: () => void
  readonly onNextRound?: () => void
  readonly onExit: () => void
}

function headline(winners: readonly PlayerId[], humanId: PlayerId) {
  if (!winners.includes(humanId)) return 'Verloren'
  return winners.length > 1 ? 'Unentschieden!' : 'Gewonnen!'
}

export function GameOverDialog({
  result,
  players,
  humanId,
  series,
  onRestart,
  onNextRound,
  onExit,
}: GameOverDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => primaryRef.current?.focus(), [])

  const ids = players.map((p) => p.id)
  const nameOf = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id
  const scoreLabel = result.scoreLabel ?? 'Punkte'

  const inSeries = series !== undefined && series.rounds > 1
  const seriesOver = !inSeries || isSeriesOver(series, series.results)
  const winners = inSeries && seriesOver ? seriesWinners(ids, series.results) : result.winners
  const won = winners.includes(humanId)

  const roundRanking = result.ranking
    ? [...result.ranking]
    : [...ids].sort((a, b) => (result.scores[b] ?? 0) - (result.scores[a] ?? 0))
  const rows = inSeries
    ? seriesStandings(ids, series.results).map((s) => ({ id: s.player, total: s.total }))
    : roundRanking.map((id) => ({ id, total: result.scores[id] ?? 0 }))

  let title = headline(winners, humanId)
  if (inSeries && seriesOver)
    title = won
      ? winners.length > 1
        ? 'Match unentschieden!'
        : 'Match gewonnen!'
      : 'Match verloren'
  if (inSeries && !seriesOver)
    title = `Runde ${series.results.length}: ${headline(result.winners, humanId)}`

  const shownWinners = inSeries && !seriesOver ? result.winners : winners

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
            {title}
          </h2>
          {!shownWinners.includes(humanId) && shownWinners.length > 0 && (
            <p className="text-muted-foreground">
              {shownWinners.map(nameOf).join(' & ')} gewinnt
              {inSeries && !seriesOver ? ' die Runde' : ''}.
            </p>
          )}
          {inSeries && (
            <p className="text-sm text-muted-foreground">
              {seriesOver
                ? `Endstand nach ${series.rounds} Runden`
                : `Zwischenstand nach Runde ${series.results.length} von ${series.rounds}`}
            </p>
          )}
        </div>

        <table className="w-full text-sm" aria-label="Ergebnis">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-normal">Platz</th>
              {inSeries && <th className="py-1.5 text-right font-normal">Runde</th>}
              <th className="py-1.5 text-right font-normal">
                {inSeries ? `Gesamt (${scoreLabel})` : scoreLabel}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className={row.id === humanId ? 'py-2 font-semibold' : 'py-2'}>
                  {index + 1}. {nameOf(row.id)}
                </td>
                {inSeries && <td className="py-2 text-right">{result.scores[row.id] ?? 0}</td>}
                <td className="py-2 text-right font-medium">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          {inSeries && !seriesOver && onNextRound ? (
            <Button ref={primaryRef} size="lg" className="flex-1" onClick={onNextRound}>
              Nächste Runde
            </Button>
          ) : (
            <Button ref={primaryRef} size="lg" className="flex-1" onClick={onRestart}>
              {inSeries ? 'Neues Match' : 'Nochmal spielen'}
            </Button>
          )}
          <Button size="lg" variant="outline" className="flex-1" onClick={onExit}>
            Spielauswahl
          </Button>
        </div>
      </div>
    </div>
  )
}
