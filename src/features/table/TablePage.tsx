import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { NotFound } from '@/app/ErrorPage'
import { gameRegistry } from '@/engine'
import { RulesSheet } from '@/features/rules/RulesPage'
import { useGameSounds } from '@/features/sound/useGameSounds'
import { buildMatchRecord } from '@/features/stats/record'
import { GAME_TABLES } from '@/games/tables'
import { type Match, persistMatch, seriesResults, useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { useStats } from '@/stores/statsStore'
import { GameOverDialog } from './GameOverDialog'
import { HUMAN_ID, useAiTurns, useSessionVersion } from './session'
import { TableBar } from './TableBar'
import { useWakeLock } from './useWakeLock'

/** Full-screen table without the app header, so phones get the whole screen for the game. */
export function TablePage() {
  const { gameId = '' } = useParams()
  const game = gameRegistry.get(gameId)
  const match = useMatch((s) => s.match)

  const current = match?.gameId === gameId ? match : null

  // Deep link or reload: continue the saved game if there is one, otherwise start a new one.
  useEffect(() => {
    if (!game || current) return
    const { resume, start, match: latest } = useMatch.getState()
    // The effect can run twice for one render (StrictMode); never start a second game then.
    if (latest?.gameId === game.id) return
    if (!(useSettings.getState().saveGames && resume(game))) start(game)
  }, [game, current])

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

  return <Table key={current.id} match={current} title={game.name} />
}

function Table({ match, title }: { match: Match; title: string }) {
  const { session } = match
  const version = useSessionVersion(session)
  const [rulesOpen, setRulesOpen] = useState(false)
  // A game may hold the opponents back, e.g. while it shows a summary between two hands.
  const [bodyPaused, setBodyPaused] = useState(false)
  const [showResumed, setShowResumed] = useState(match.resumed)
  // Opponents wait while the rules are open.
  useAiTurns(session, rulesOpen || bodyPaused)
  useWakeLock()
  useGameSounds(session, HUMAN_ID, match.resumed)
  const navigate = useNavigate()
  const start = useMatch((s) => s.start)
  const Body = GAME_TABLES[session.game.id]
  const animations = useSettings((s) => s.animations)
  const recorded = useRef(false)

  // Save after every move; record the result once the game is over.
  useEffect(() => {
    persistMatch(match)
    if (session.isOver && !recorded.current) {
      recorded.current = true
      const record = buildMatchRecord(session, HUMAN_ID, match.startedAt, Date.now(), {
        round: match.series.completed.length + 1,
        rounds: match.series.rounds,
      })
      if (record) void useStats.getState().record(record)
    }
  }, [match, session, version])

  useEffect(() => {
    if (!showResumed) return
    const timer = setTimeout(() => setShowResumed(false), 3000)
    return () => clearTimeout(timer)
  }, [showResumed])

  const exit = () => void navigate('/')
  const restart = () => start(session.game)

  return (
    // "user" follows the OS reduce-motion setting; the in-app switch turns motion off entirely.
    <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
      <div className="fixed inset-0 flex card-table flex-col overflow-hidden">
        <TableBar
          title={
            match.series.rounds > 1
              ? `${title} · Runde ${match.series.completed.length + 1}/${match.series.rounds}`
              : title
          }
          canUndo={session.canUndo}
          onExit={exit}
          onUndo={() => session.undo()}
          onRestart={restart}
          onRules={() => setRulesOpen(true)}
        />
        <AnimatePresence>
          {showResumed && (
            <motion.p
              role="status"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="app-bar-note pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-30 mx-auto w-fit rounded-full bg-black/60 px-4 py-1.5 text-sm text-white"
            >
              Gespeicherte Partie fortgesetzt
            </motion.p>
          )}
        </AnimatePresence>
        {Body ? (
          <div className="app-bar-body flex min-h-0 flex-1 flex-col">
            <Suspense fallback={<div className="flex-1" />}>
              <Body session={session} humanId={HUMAN_ID} onPauseChange={setBodyPaused} />
            </Suspense>
          </div>
        ) : (
          <p className="flex flex-1 items-center justify-center p-6 text-center text-white">
            Für dieses Spiel gibt es noch keinen Spieltisch.
          </p>
        )}
        {rulesOpen && (
          <RulesSheet
            gameId={session.game.id}
            title={title}
            options={session.options as Record<string, unknown>}
            onClose={() => setRulesOpen(false)}
          />
        )}
        {session.result && (
          <GameOverDialog
            series={{ rounds: match.series.rounds, results: seriesResults(match) }}
            onNextRound={() => useMatch.getState().nextRound()}
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
