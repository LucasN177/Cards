import { useEffect, useSyncExternalStore } from 'react'
import { createRandomAgent } from '@/ai'
import { createWorkerAgent } from '@/ai/worker/workerAgent'
import {
  type AiAgent,
  type AnyGameDefinition,
  GameSession,
  type PlayerId,
  type PlayerInfo,
  type SavedGame,
} from '@/engine'
import { GAME_SPEED_DELAY, type GamePreferences, useSettings } from '@/stores/settingsStore'

export type AnySession = GameSession<unknown, unknown, object, unknown>

/** Props every game-specific table body receives. */
export interface GameBodyProps {
  readonly session: AnySession
  readonly humanId: PlayerId
}

export const HUMAN_ID = 'you'
const OPPONENT_NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hugo']

/**
 * One agent per AI player. A game's own AI thinks in the AI web worker (with a main-thread
 * fallback); games without AI get random play.
 */
function createAgents(game: AnyGameDefinition, players: readonly PlayerInfo[]) {
  const agents: Record<PlayerId, AiAgent<unknown, unknown>> = {}
  for (const p of players) {
    if (p.kind !== 'ai') continue
    agents[p.id] = game.createAgent
      ? createWorkerAgent(game, p.difficulty ?? 'beginner')
      : createRandomAgent<unknown, unknown>()
  }
  return agents
}

export function createSession(
  game: AnyGameDefinition,
  preferences: GamePreferences,
  playerName: string,
): AnySession {
  const opponents: PlayerInfo[] = Array.from({ length: preferences.opponents }, (_, i) => ({
    id: `ai-${i + 1}`,
    name: OPPONENT_NAMES[i % OPPONENT_NAMES.length]!,
    kind: 'ai',
    difficulty: preferences.difficulty,
  }))
  const players: PlayerInfo[] = [
    { id: HUMAN_ID, name: playerName.trim() || 'Du', kind: 'human' },
    ...opponents,
  ]
  return new GameSession(game, {
    players,
    options: preferences.options as Partial<object> | undefined,
    agents: createAgents(game, players),
  })
}

/** Rebuilds a saved game. Returns null if it cannot be replayed (e.g. after a rules change). */
export function restoreSession(game: AnyGameDefinition, saved: SavedGame<object, unknown>) {
  try {
    return GameSession.restore(game, saved, createAgents(game, saved.players))
  } catch (error) {
    console.warn('Saved game could not be restored', error)
    return null
  }
}

/** Re-renders the component on every session change and returns the change counter. */
export function useSessionVersion(session: Pick<AnySession, 'subscribe' | 'version'>): number {
  return useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.version,
  )
}

/** Plays AI moves one at a time, paced by the game speed setting. `paused` holds them back. */
export function useAiTurns(session: AnySession, paused = false) {
  const version = useSessionVersion(session)
  const delay = GAME_SPEED_DELAY[useSettings((s) => s.gameSpeed)]

  useEffect(() => {
    if (paused || !session.isAiTurn) return
    const timer = setTimeout(() => {
      session.playAiTurn().catch((error: unknown) => console.error('AI move failed', error))
    }, delay)
    return () => clearTimeout(timer)
  }, [session, version, delay, paused])
}
