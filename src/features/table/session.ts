import { useEffect, useSyncExternalStore } from 'react'
import { createRandomAgent } from '@/ai'
import {
  type AiAgent,
  type AnyGameDefinition,
  GameSession,
  type PlayerId,
  type PlayerInfo,
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
  const agents: Record<PlayerId, AiAgent<unknown, unknown>> = Object.fromEntries(
    opponents.map((p) => [
      p.id,
      game.createAgent?.(preferences.difficulty) ?? createRandomAgent<unknown, unknown>(),
    ]),
  )
  return new GameSession(game, {
    players: [{ id: HUMAN_ID, name: playerName.trim() || 'Du', kind: 'human' }, ...opponents],
    options: preferences.options as Partial<object> | undefined,
    agents,
  })
}

/** Re-renders the component on every session change and returns the change counter. */
export function useSessionVersion(session: Pick<AnySession, 'subscribe' | 'version'>): number {
  return useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.version,
  )
}

/** Plays AI moves one at a time, paced by the game speed setting. */
export function useAiTurns(session: AnySession) {
  const version = useSessionVersion(session)
  const delay = GAME_SPEED_DELAY[useSettings((s) => s.gameSpeed)]

  useEffect(() => {
    if (!session.isAiTurn) return
    const timer = setTimeout(() => {
      session.playAiTurn().catch((error: unknown) => console.error('AI move failed', error))
    }, delay)
    return () => clearTimeout(timer)
  }, [session, version, delay])
}
