import { gameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'
import { TEST_GAMES_ENABLED } from './flags'

/** Registers all playable games. Imported once at app start. */
export function registerGames(registry = gameRegistry) {
  if (TEST_GAMES_ENABLED && !registry.get(highCardGame.id)) registry.register(highCardGame)
}
