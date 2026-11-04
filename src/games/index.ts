import { gameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'

/** Registers all playable games. Imported once at app start. */
export function registerGames(registry = gameRegistry) {
  if (import.meta.env.DEV && !registry.get(highCardGame.id)) registry.register(highCardGame)
}
