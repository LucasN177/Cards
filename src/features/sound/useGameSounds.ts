import { useEffect, useRef } from 'react'
import type { PlayerId } from '@/engine'
import { type AnySession, useSessionVersion } from '@/features/table/session'
import { playSound } from './sound'

/**
 * Plays sounds for any game, derived from the move history: shuffling at the start, a card snap
 * per move (a slide for drawing), a softer slide for undo and a jingle when the game ends.
 */
export function useGameSounds(session: AnySession, humanId: PlayerId, resumed: boolean) {
  const version = useSessionVersion(session)
  const previous = useRef<{ moves: number; over: boolean } | null>(null)

  useEffect(() => {
    const moves = session.history.length
    const over = session.isOver
    const last = previous.current
    previous.current = { moves, over }

    if (!last) {
      if (!resumed && moves === 0) playSound('shuffle')
      return
    }
    if (moves > last.moves) {
      const action = session.history.at(-1)?.action as { type?: string } | undefined
      playSound(action?.type === 'draw' ? 'draw' : 'card')
    } else if (moves < last.moves) {
      playSound('undo')
    }
    if (over && !last.over) {
      const won = session.result?.winners.includes(humanId) ?? false
      const timer = setTimeout(() => playSound(won ? 'win' : 'lose'), 250)
      return () => clearTimeout(timer)
    }
  }, [session, humanId, resumed, version])
}
