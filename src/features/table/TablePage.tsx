import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { NotFound } from '@/app/ErrorPage'
import { Button } from '@/components/ui/button'
import { findCatalogGame } from '@/games/catalog'
import { DIFFICULTY_LABELS } from '@/lib/labels'
import { useSettings } from '@/stores/settingsStore'

/** Placeholder until the real table arrives in milestone M5. */
export function TablePage() {
  const { gameId = '' } = useParams()
  const game = findCatalogGame(gameId)
  const preferences = useSettings((s) => s.games[gameId])

  if (!game?.definition) return <NotFound message="Dieses Spiel ist nicht spielbar." />

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/games/${game.id}`}>
          <ArrowLeft /> Einstellungen
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">{game.name}</h1>
      <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-2xl bg-green-900 p-6 text-center text-green-50 shadow-inner">
        <p className="text-lg font-medium">Der Spieltisch kommt in Milestone M5.</p>
        {preferences && (
          <p className="text-sm text-green-200">
            {preferences.opponents} Gegner · {DIFFICULTY_LABELS[preferences.difficulty]}
          </p>
        )}
      </div>
    </div>
  )
}
