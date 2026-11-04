import type { AnyGameDefinition } from './game'

export class GameRegistry {
  private readonly games = new Map<string, AnyGameDefinition>()

  register(game: AnyGameDefinition): void {
    if (this.games.has(game.id)) throw new Error(`Game "${game.id}" is already registered`)
    this.games.set(game.id, game)
  }

  get(id: string): AnyGameDefinition | undefined {
    return this.games.get(id)
  }

  require(id: string): AnyGameDefinition {
    const game = this.games.get(id)
    if (!game) throw new Error(`Unknown game "${id}"`)
    return game
  }

  list(): AnyGameDefinition[] {
    return [...this.games.values()]
  }
}

/** App-wide registry. Games register themselves in `src/games/index.ts`. */
export const gameRegistry = new GameRegistry()
