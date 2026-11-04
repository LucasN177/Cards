import { gameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'
import { TEST_GAMES_ENABLED } from './flags'
import { freeCellGame } from './freecell/freecell'
import { klondikeGame } from './klondike/klondike'
import { mauMauGame } from './mau-mau'
import { spiderGame } from './spider/spider'

const GAMES = [mauMauGame, klondikeGame, freeCellGame, spiderGame]

/** Registers all playable games. Imported once at app start. */
export function registerGames(registry = gameRegistry) {
  for (const game of GAMES) if (!registry.get(game.id)) registry.register(game)
  if (TEST_GAMES_ENABLED && !registry.get(highCardGame.id)) registry.register(highCardGame)
}
