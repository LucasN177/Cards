import { gameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'
import { TEST_GAMES_ENABLED } from './flags'
import { blackjackGame } from './blackjack/blackjack'
import { bridgeGame } from './bridge'
import { crazyEightsGame } from './crazy-eights'
import { doppelkopfGame } from './doppelkopf'
import { freeCellGame } from './freecell/freecell'
import { heartsGame } from './hearts'
import { klondikeGame } from './klondike/klondike'
import { mauMauGame } from './mau-mau'
import { durakGame } from './durak'
import { euchreGame } from './euchre'
import { spadesGame } from './spades'
import { presidentGame } from './president'
import { sechsundsechzigGame } from './sechsundsechzig'
import { canastaGame } from './canasta'
import { holdemGame } from './texas-holdem'
import { ginRummyGame } from './gin-rummy'
import { rommeGame } from './romme'
import { schafkopfGame } from './schafkopf'
import { schwimmenGame } from './schwimmen'
import { skatGame } from './skat'
import { spiderGame } from './spider/spider'
import { wizardGame } from './wizard'

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
  sechsundsechzigGame,
  euchreGame,
  wizardGame,
  skatGame,
  doppelkopfGame,
  schafkopfGame,
  bridgeGame,
  rommeGame,
  ginRummyGame,
  canastaGame,
  holdemGame,
]

/** Registers all playable games. Imported once at app start. */
export function registerGames(registry = gameRegistry) {
  for (const game of GAMES) if (!registry.get(game.id)) registry.register(game)
  if (TEST_GAMES_ENABLED && !registry.get(highCardGame.id)) registry.register(highCardGame)
}
