import { gameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'
import { TEST_GAMES_ENABLED } from './flags'
import { blackjackGame } from './blackjack/blackjack'
import { crazyEightsGame } from './crazy-eights'
import { freeCellGame } from './freecell/freecell'
import { heartsGame } from './hearts'
import { klondikeGame } from './klondike/klondike'
import { mauMauGame } from './mau-mau'
import { durakGame } from './durak'
import { spadesGame } from './spades'
import { presidentGame } from './president'
import { schwimmenGame } from './schwimmen'
import { spiderGame } from './spider/spider'

const GAMES = [
  mauMauGame,
  crazyEightsGame,
  klondikeGame,
  freeCellGame,
  spiderGame,
  heartsGame,
  blackjackGame,
  schwimmenGame,
  presidentGame,
  durakGame,
  spadesGame,
]

/** Registers all playable games. Imported once at app start. */
export function registerGames(registry = gameRegistry) {
  for (const game of GAMES) if (!registry.get(game.id)) registry.register(game)
  if (TEST_GAMES_ENABLED && !registry.get(highCardGame.id)) registry.register(highCardGame)
}
