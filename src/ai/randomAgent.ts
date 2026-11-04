import type { AiAgent } from '@/engine'

/** Picks a uniformly random legal move. Baseline "beginner" opponent and fuzzing tool for tests. */
export function createRandomAgent<V, A>(name = 'Random'): AiAgent<V, A> {
  return {
    name,
    chooseAction: ({ legalActions, rng }) => rng.pick(legalActions),
  }
}
