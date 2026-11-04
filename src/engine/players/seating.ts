import type { PlayerId } from '../core/types'

/**
 * The player `step` seats after `current` (negative steps go the other way round, e.g. after a
 * reverse card in Crazy Eights).
 */
export function nextPlayer(order: readonly PlayerId[], current: PlayerId, step = 1): PlayerId {
  const index = order.indexOf(current)
  if (index === -1) throw new Error(`Player "${current}" is not seated`)
  const n = order.length
  return order[(((index + step) % n) + n) % n]!
}

/** Seating order rotated so that `first` comes first, e.g. to start a trick with its leader. */
export function rotateTo(order: readonly PlayerId[], first: PlayerId): PlayerId[] {
  const index = order.indexOf(first)
  if (index === -1) throw new Error(`Player "${first}" is not seated`)
  return [...order.slice(index), ...order.slice(0, index)]
}
