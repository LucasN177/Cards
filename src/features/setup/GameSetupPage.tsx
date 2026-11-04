import { ArrowLeft, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { NotFound } from '@/app/ErrorPage'
import { ChoiceGroup } from '@/components/ChoiceGroup'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DIFFICULTIES, type Difficulty } from '@/engine'
import { findCatalogGame } from '@/games/catalog'
import { DIFFICULTY_LABELS, playerCountLabel } from '@/lib/labels'
import { useSettings } from '@/stores/settingsStore'

export function GameSetupPage() {
  const { gameId = '' } = useParams()
  const game = findCatalogGame(gameId)
  const saved = useSettings((s) => s.games[gameId])
  const setGamePreferences = useSettings((s) => s.setGamePreferences)
  const navigate = useNavigate()

  const minOpponents = Math.max(0, (game?.players.min ?? 1) - 1)
  const maxOpponents = Math.max(0, (game?.players.max ?? 1) - 1)
  const [opponents, setOpponents] = useState(() =>
    Math.min(Math.max(saved?.opponents ?? minOpponents, minOpponents), maxOpponents),
  )
  const [difficulty, setDifficulty] = useState<Difficulty>(saved?.difficulty ?? 'beginner')

  if (!game) return <NotFound message="Dieses Spiel gibt es nicht." />

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/">
        <ArrowLeft /> Spielauswahl
      </Link>
    </Button>
  )

  if (!game.definition) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {back}
        <h1 className="text-3xl font-bold tracking-tight">{game.name}</h1>
        <p className="text-muted-foreground">{game.description}</p>
        <p>Dieses Spiel ist in Planung und bald spielbar.</p>
      </div>
    )
  }

  const opponentChoices = Array.from({ length: maxOpponents - minOpponents + 1 }, (_, i) => {
    const count = minOpponents + i
    return { value: String(count), label: count === 1 ? '1 Gegner' : `${count} Gegner` }
  })

  const start = () => {
    setGamePreferences(game.id, { ...saved, opponents, difficulty })
    void navigate(`/play/${game.id}`)
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {back}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            <h1>{game.name}</h1>
          </CardTitle>
          <CardDescription>
            {game.description} · {playerCountLabel(game.players)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {maxOpponents > 0 && (
            <>
              {opponentChoices.length > 1 && (
                <ChoiceGroup
                  label="Gegner"
                  value={String(opponents)}
                  choices={opponentChoices}
                  onChange={(value) => setOpponents(Number(value))}
                />
              )}
              <ChoiceGroup
                label="Schwierigkeit"
                value={difficulty}
                choices={DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] }))}
                onChange={setDifficulty}
              />
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button size="lg" onClick={start} className="w-full sm:w-auto">
            <Play /> Spiel starten
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
