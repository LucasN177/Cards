import { Users } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORY_LABELS, type CatalogGame, type GameCategory, listCatalog } from '@/games/catalog'
import { listSaves } from '@/features/persistence/savedGames'
import { playerCountLabel } from '@/lib/labels'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'

const CATEGORY_ORDER: readonly GameCategory[] = ['development', 'classic', 'german', 'strategic']

function GameTile({ game, running }: { game: CatalogGame; running: boolean }) {
  const playable = game.definition !== undefined
  const content = (
    <Card
      className={
        playable
          ? 'h-full transition-colors group-hover:border-primary group-focus-visible:border-primary'
          : 'h-full opacity-60'
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{game.name}</CardTitle>
          {!playable && <Badge variant="secondary">Bald</Badge>}
          {playable && running && <Badge>Läuft</Badge>}
        </div>
        <CardDescription>{game.description}</CardDescription>
        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          {playerCountLabel(game.players)}
        </p>
      </CardHeader>
    </Card>
  )

  if (!playable) return <li aria-disabled="true">{content}</li>
  return (
    <li>
      <Link to={`/games/${game.id}`} className="group block h-full rounded-xl outline-none">
        {content}
      </Link>
    </li>
  )
}

export function GameCatalogPage() {
  const games = listCatalog()
  const saveGames = useSettings((s) => s.saveGames)
  const match = useMatch((s) => s.match)
  const running = new Set(saveGames ? listSaves() : [])
  if (match && !match.session.isOver) running.add(match.gameId)

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Spielauswahl</h1>
        <p className="text-muted-foreground">
          Klassische Kartenspiele gegen Computergegner – komplett im Browser, auch offline.
        </p>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const inCategory = games.filter((game) => game.category === category)
        if (inCategory.length === 0) return null
        const headingId = `category-${category}`
        return (
          <section key={category} aria-labelledby={headingId} className="space-y-4">
            <h2 id={headingId} className="text-xl font-semibold">
              {CATEGORY_LABELS[category]}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inCategory.map((game) => (
                <GameTile key={game.id} game={game} running={running.has(game.id)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
