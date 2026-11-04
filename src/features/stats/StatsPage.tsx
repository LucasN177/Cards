import { Minus, Trophy, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DIFFICULTIES, gameRegistry } from '@/engine'
import { findCatalogGame } from '@/games/catalog'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import { useSettings } from '@/stores/settingsStore'
import { useStats } from '@/stores/statsStore'
import {
  formatCount,
  formatDecimal,
  formatDuration,
  formatPercent,
  type GameStats,
  overview,
  statsByGame,
} from './aggregate'
import type { MatchRecord, Outcome } from './types'

const gameName = (id: string) => findCatalogGame(id)?.name ?? id

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

const OUTCOME: Readonly<Record<Outcome, { label: string; icon: ReactNode }>> = {
  win: { label: 'Sieg', icon: <Trophy className="size-4 text-yellow-600 dark:text-yellow-400" /> },
  draw: { label: 'Unentschieden', icon: <Minus className="size-4 text-muted-foreground" /> },
  loss: { label: 'Niederlage', icon: <X className="size-4 text-muted-foreground" /> },
}

const streakText = (streak: ReturnType<typeof overview>['currentStreak']) => {
  if (!streak) return undefined
  const noun =
    streak.outcome === 'win'
      ? streak.length === 1
        ? 'Sieg'
        : 'Siege'
      : streak.outcome === 'loss'
        ? streak.length === 1
          ? 'Niederlage'
          : 'Niederlagen'
        : 'Unentschieden'
  return `Aktuell: ${streak.length} ${noun} in Folge`
}

function GameSection({ stats }: { stats: GameStats }) {
  const fields = gameRegistry.get(stats.gameId)?.statFields ?? []
  // Solitaire and other single-player games have no opponents to compare against.
  const solo = DIFFICULTIES.every((d) => stats.byDifficulty[d].games === 0)
  const rows: [string, string][] = [
    ['Partien', formatCount(stats.games)],
    ['Siege', `${stats.wins} (${formatPercent(stats.winRate)})`],
    ...(solo ? [] : [['Ø Platzierung', formatDecimal(stats.averagePlacement)] as [string, string]]),
    [`Ø ${stats.scoreLabel}`, formatDecimal(stats.averageScore)],
    [
      `Bestwert ${stats.scoreLabel}${stats.lowerScoreIsBetter ? ' (weniger ist besser)' : ''}`,
      formatDecimal(stats.bestScore),
    ],
    ['Schnellster Sieg', formatDuration(stats.fastestWinMs)],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{gameName(stats.gameId)}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b py-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {!solo && (
          <table className="w-full text-sm">
            <caption className="pb-2 text-left font-medium">Nach Stärke der Gegner</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left font-normal">Stufe</th>
                <th className="py-1.5 text-right font-normal">Partien</th>
                <th className="py-1.5 text-right font-normal">Siege</th>
                <th className="py-1.5 text-right font-normal">Quote</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {DIFFICULTIES.map((difficulty) => {
                const t = stats.byDifficulty[difficulty]
                return (
                  <tr key={difficulty} className="border-b last:border-0">
                    <td className="py-1.5">{DIFFICULTY_LABELS[difficulty]}</td>
                    <td className="py-1.5 text-right">{t.games}</td>
                    <td className="py-1.5 text-right">{t.wins}</td>
                    <td className="py-1.5 text-right">{formatPercent(t.winRate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {fields.length > 0 && (
          <table className="w-full text-sm">
            <caption className="pb-2 text-left font-medium">Spieldetails</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left font-normal">Wert</th>
                <th className="py-1.5 text-right font-normal">Gesamt</th>
                <th className="py-1.5 text-right font-normal">Ø pro Partie</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {fields.map((field) => {
                const total = stats.statTotals[field.key] ?? 0
                return (
                  <tr key={field.key} className="border-b last:border-0">
                    <td className="py-1.5">{field.label}</td>
                    <td className="py-1.5 text-right">{formatCount(total)}</td>
                    <td className="py-1.5 text-right">
                      {formatDecimal(stats.games ? total / stats.games : null)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })
const PAGE = 20

function History({ records }: { records: readonly MatchRecord[] }) {
  const [shown, setShown] = useState(PAGE)
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Letzte Partien</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="divide-y" aria-label="Spielverlauf">
          {records.slice(0, shown).map((record) => {
            const outcome = OUTCOME[record.outcome]
            return (
              <li key={record.id ?? record.endedAt} className="space-y-0.5 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {outcome.icon}
                    <span className="font-medium">{outcome.label}</span>
                    <span className="truncate text-muted-foreground">
                      · {gameName(record.gameId)}
                    </span>
                  </span>
                  <time
                    dateTime={new Date(record.endedAt).toISOString()}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {dateFormat.format(record.endedAt)}
                  </time>
                </div>
                <p className="pl-5.5 text-xs text-muted-foreground">
                  {[
                    record.players.length > 1 &&
                      `Platz ${record.placement} von ${record.players.length}`,
                    record.difficulty && DIFFICULTY_LABELS[record.difficulty],
                    `${record.humanScore} ${record.scoreLabel}`,
                    formatDuration(record.durationMs),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            )
          })}
        </ol>
        {records.length > shown && (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setShown(shown + PAGE)}>
            Weitere anzeigen
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function StatsPage() {
  const records = useStats((s) => s.records)
  const error = useStats((s) => s.error)
  const recordStats = useSettings((s) => s.recordStats)

  useEffect(() => {
    void useStats.getState().load()
  }, [])

  const disabledNote = !recordStats && (
    <Card>
      <CardHeader>
        <CardTitle>Aufzeichnung ist ausgeschaltet</CardTitle>
        <CardDescription>
          Neue Partien werden nicht gespeichert. Du kannst das in den{' '}
          <Link to="/settings" className="underline underline-offset-4">
            Einstellungen
          </Link>{' '}
          ändern.
        </CardDescription>
      </CardHeader>
    </Card>
  )

  if (records === null) {
    return <p className="text-muted-foreground">Statistik wird geladen …</p>
  }

  if (records.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Statistik</h1>
        {disabledNote}
        {error && <p className="text-destructive">{error}</p>}
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Noch keine Partien gespielt</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald du ein Spiel beendest, erscheint es hier – gespeichert nur auf diesem Gerät.
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Zur Spielauswahl</Link>
          </Button>
        </div>
      </div>
    )
  }

  const totals = overview(records)
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Statistik</h1>
      {disabledNote}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Partien" value={formatCount(totals.games)} />
        <StatTile
          label="Siegquote"
          value={formatPercent(totals.winRate)}
          note={`${totals.wins} Siege, ${totals.losses} Niederlagen`}
        />
        <StatTile
          label="Längste Siegesserie"
          value={String(totals.longestWinStreak)}
          note={streakText(totals.currentStreak)}
        />
        <StatTile label="Spielzeit" value={formatDuration(totals.playTimeMs)} />
      </dl>
      {statsByGame(records).map((stats) => (
        <GameSection key={stats.gameId} stats={stats} />
      ))}
      <History records={records} />
      <p className="text-center text-xs text-muted-foreground">
        Alle Daten bleiben auf diesem Gerät. Löschen kannst du sie in den Einstellungen.
      </p>
    </div>
  )
}
