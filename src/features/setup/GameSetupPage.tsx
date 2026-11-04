import { ArrowLeft, BookOpen, Play } from 'lucide-react'
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
import { GAME_RULES } from '@/games/rules'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { RuleOptions } from './RuleOptions'

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
  const [options, setOptions] = useState<Record<string, unknown>>(() => ({
    ...(game?.definition?.defaultOptions as Record<string, unknown> | undefined),
    ...saved?.options,
  }))

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
    const preferences = { ...saved, opponents, difficulty, options }
    setGamePreferences(game.id, preferences)
    if (game.definition) useMatch.getState().start(game.definition, preferences)
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
          {GAME_RULES[game.id] && (
            <Button variant="link" size="sm" asChild className="h-auto justify-start px-0">
              <Link to={`/games/${game.id}/rules`}>
                <BookOpen /> Spielregeln lesen
              </Link>
            </Button>
          )}
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
          {game.definition.optionFields && game.definition.optionFields.length > 0 && (
            <section aria-labelledby="rule-options" className="space-y-4 border-t pt-5">
              <h2 id="rule-options" className="text-sm font-semibold">
                Regeln
              </h2>
              <RuleOptions
                fields={game.definition.optionFields}
                value={options}
                onChange={setOptions}
              />
            </section>
          )}
        </CardContent>
        {/* Sticky on phones so the long rules form never hides the start button. */}
        <CardFooter className="sticky bottom-0 -mb-6 rounded-b-xl border-t bg-card py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mb-0 sm:border-0 sm:pt-0 sm:pb-0">
          <Button size="lg" onClick={start} className="w-full sm:w-auto">
            <Play /> Spiel starten
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
