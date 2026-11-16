import { gameRegistry } from '@/engine'

/**
 * Hides a registered game, so it looks like a game still on the roadmap (every catalog game is
 * playable by now). Returns the spy; call `mockRestore()` when done.
 */
export function hideGame(id: string) {
  const get = gameRegistry.get.bind(gameRegistry)
  return vi.spyOn(gameRegistry, 'get').mockImplementation((g) => (g === id ? undefined : get(g)))
}
