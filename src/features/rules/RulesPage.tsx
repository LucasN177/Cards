import { ArrowLeft, X } from 'lucide-react'
import { Suspense, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { NotFound } from '@/app/ErrorPage'
import { Button } from '@/components/ui/button'
import { findCatalogGame } from '@/games/catalog'
import { GAME_RULES } from '@/games/rules'

const Loading = () => <p className="text-muted-foreground">Regeln werden geladen …</p>

/** Standalone rules page, reachable from the game setup (`#/games/:gameId/rules`). */
export function RulesPage() {
  const { gameId = '' } = useParams()
  const game = findCatalogGame(gameId)
  const Rules = GAME_RULES[gameId]
  if (!game) return <NotFound message="Dieses Spiel gibt es nicht." />

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/games/${game.id}`}>
          <ArrowLeft /> {game.name}
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Spielregeln: {game.name}</h1>
      {Rules ? (
        <Suspense fallback={<Loading />}>
          <Rules />
        </Suspense>
      ) : (
        <p className="text-muted-foreground">Die Regeln für dieses Spiel folgen bald.</p>
      )}
    </article>
  )
}

interface RulesSheetProps {
  readonly gameId: string
  readonly title: string
  readonly options?: Readonly<Record<string, unknown>>
  readonly onClose: () => void
}

/** Full-screen rules overlay for the table, so players can look something up mid-game. */
export function RulesSheet({ gameId, title, options, onClose }: RulesSheetProps) {
  const Rules = GAME_RULES[gameId]
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => closeRef.current?.focus(), [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <header className="flex items-center gap-2 border-b pt-safe px-safe">
        <h2 id="rules-title" className="flex-1 truncate py-3 text-lg font-semibold">
          Regeln: {title}
        </h2>
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onClose}
          aria-label="Regeln schließen"
        >
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-safe pb-safe">
        <div className="mx-auto max-w-2xl py-4">
          {Rules ? (
            <Suspense fallback={<Loading />}>
              <Rules options={options} />
            </Suspense>
          ) : (
            <p className="text-muted-foreground">Die Regeln für dieses Spiel folgen bald.</p>
          )}
        </div>
      </div>
    </div>
  )
}
