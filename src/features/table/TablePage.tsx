import { MotionConfig } from 'framer-motion'
import { Suspense, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { NotFound } from '@/app/ErrorPage'
import { gameRegistry } from '@/engine'
import { GAME_TABLES } from '@/games/tables'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { GameOverDialog } from './GameOverDialog'
import { type AnySession, HUMAN_ID, useAiTurns, useSessionVersion } from './session'
import { TableBar } from './TableBar'
import { useWakeLock } from './useWakeLock'

/** Full-screen table without the app header, so phones get the whole screen for the game. */
export function TablePage() {
  const { gameId = '' } = useParams()
  const game = gameRegistry.get(gameId)
  const match = useMatch((s) => s.match)
  const start = useMatch((s) => s.start)

  const current = match?.gameId === gameId ? match : null

  // Deep link or reload: start a game with the saved preferences.
  useEffect(() => {
    if (game && !current) start(game)
  }, [game, current, start])

  useEffect(() => {
    document.documentElement.classList.add('table-open')
    return () => document.documentElement.classList.remove('table-open')
  }, [])

  if (!game) {
    return (
      <div className="p-4">
        <NotFound message="Dieses Spiel ist nicht spielbar." />
      </div>
    )
  }
  if (!current) return <div className="fixed inset-0 card-table" />

  return <Table key={current.id} session={current.session} title={game.name} />
}

function Table({ session, title }: { session: AnySession; title: string }) {
  useSessionVersion(session)
  useAiTurns(session)
  useWakeLock()
  const navigate = useNavigate()
  const start = useMatch((s) => s.start)
  const Body = GAME_TABLES[session.game.id]
  const animations = useSettings((s) => s.animations)

  const exit = () => void navigate('/')
  const restart = () => start(session.game)

  return (
    // "user" follows the OS reduce-motion setting; the in-app switch turns motion off entirely.
    <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
      <div className="fixed inset-0 flex card-table flex-col overflow-hidden">
        <TableBar
          title={title}
          canUndo={session.canUndo}
          onExit={exit}
          onUndo={() => session.undo()}
          onRestart={restart}
        />
        {Body ? (
          <Suspense fallback={<div className="flex-1" />}>
            <Body session={session} humanId={HUMAN_ID} />
          </Suspense>
        ) : (
          <p className="flex flex-1 items-center justify-center p-6 text-center text-white">
            Für dieses Spiel gibt es noch keinen Spieltisch.
          </p>
        )}
        {session.result && (
          <GameOverDialog
            result={session.result}
            players={session.players}
            humanId={HUMAN_ID}
            onRestart={restart}
            onExit={exit}
          />
        )}
      </div>
    </MotionConfig>
  )
}
