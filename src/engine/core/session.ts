import type { AiAgent } from './agent'
import { deepEqual } from './equal'
import { GameOverError, IllegalActionError, NotYourTurnError } from './errors'
import type { GameDefinition } from './game'
import { randomSeed, Rng } from './rng'
import type { GameResult, PlayerId, PlayerInfo } from './types'

export interface SessionConfig<V, A, O> {
  /** Players in seating order. */
  readonly players: readonly PlayerInfo[]
  /** Overrides on top of the game's default options. */
  readonly options?: Partial<O>
  /** Defaults to a random seed. Fix it for reproducible games. */
  readonly seed?: number
  /** Agents for AI players. Missing ones are created via the game's `createAgent`. */
  readonly agents?: Readonly<Record<PlayerId, AiAgent<V, A>>>
}

export interface HistoryEntry<S, A> {
  readonly player: PlayerId
  readonly action: A
  readonly stateBefore: S
}

/** Everything needed to rebuild a game: setup plus the action log, replayed deterministically. */
export interface SavedGame<O, A> {
  readonly version: 1
  readonly gameId: string
  readonly seed: number
  readonly options: O
  readonly players: readonly PlayerInfo[]
  readonly actions: readonly { readonly player: PlayerId; readonly action: A }[]
}

/** Seed offset so AI randomness is independent of the deal but still reproducible. */
const AI_SEED_SALT = 0x5eed_a11

/**
 * Runs one game: whose turn it is, validating and applying moves, asking AI agents for theirs,
 * plus history, undo and save/restore. UI-agnostic; React subscribes via `subscribe`/`version`
 * (compatible with `useSyncExternalStore`).
 */
export class GameSession<S, A, O extends object, V> {
  readonly game: GameDefinition<S, A, O, V>
  readonly players: readonly PlayerInfo[]
  readonly options: O
  readonly seed: number

  private currentState: S
  private readonly entries: HistoryEntry<S, A>[] = []
  private readonly agents = new Map<PlayerId, AiAgent<V, A>>()
  private readonly aiRng: Rng
  private readonly listeners = new Set<() => void>()
  private changeCount = 0

  constructor(game: GameDefinition<S, A, O, V>, config: SessionConfig<V, A, O>) {
    const { players } = config
    if (players.length < game.players.min || players.length > game.players.max) {
      throw new Error(
        `${game.name} needs ${game.players.min}–${game.players.max} players, got ${players.length}`,
      )
    }
    if (new Set(players.map((p) => p.id)).size !== players.length) {
      throw new Error('Player ids must be unique')
    }

    this.game = game
    this.players = players
    this.options = { ...game.defaultOptions, ...config.options }
    this.seed = config.seed ?? randomSeed()
    this.aiRng = Rng.fromSeed(this.seed ^ AI_SEED_SALT)

    for (const player of players) {
      if (player.kind !== 'ai') continue
      const agent =
        config.agents?.[player.id] ?? game.createAgent?.(player.difficulty ?? 'beginner')
      if (!agent) throw new Error(`No AI agent for player "${player.id}"`)
      this.agents.set(player.id, agent)
    }

    this.currentState = game.setup({ players, options: this.options, seed: this.seed })
  }

  /** Rebuilds a saved game by replaying its actions. */
  static restore<S, A, O extends object, V>(
    game: GameDefinition<S, A, O, V>,
    saved: SavedGame<O, A>,
    agents?: Readonly<Record<PlayerId, AiAgent<V, A>>>,
  ): GameSession<S, A, O, V> {
    if (saved.version !== 1) throw new Error(`Unsupported save version ${String(saved.version)}`)
    if (saved.gameId !== game.id) {
      throw new Error(`Save belongs to "${saved.gameId}", not "${game.id}"`)
    }
    const session = new GameSession(game, {
      players: saved.players,
      options: saved.options,
      seed: saved.seed,
      agents,
    })
    for (const { player, action } of saved.actions) session.apply(player, action, false)
    session.notify()
    return session
  }

  // --- State -----------------------------------------------------------------------------------

  /** Full state. Only for engine-side code; UIs and agents must use `view`. */
  get state(): S {
    return this.currentState
  }

  /** Increases on every change. */
  get version(): number {
    return this.changeCount
  }

  get history(): readonly HistoryEntry<S, A>[] {
    return this.entries
  }

  get currentPlayer(): PlayerId | null {
    return this.isOver ? null : this.game.currentPlayer(this.currentState)
  }

  get isOver(): boolean {
    return this.game.isTerminal(this.currentState)
  }

  get result(): GameResult | null {
    return this.isOver ? this.game.result(this.currentState) : null
  }

  get isAiTurn(): boolean {
    const player = this.currentPlayer
    return player !== null && this.agents.has(player)
  }

  player(id: PlayerId): PlayerInfo | undefined {
    return this.players.find((p) => p.id === id)
  }

  view(player: PlayerId): V {
    return this.game.playerView(this.currentState, player)
  }

  legalActions(player: PlayerId): readonly A[] {
    if (this.currentPlayer !== player) return []
    return this.game.legalActions(this.currentState, player)
  }

  /** Why `action` is not allowed for `player` right now, or null – e.g. to explain a button. */
  whyNot(player: PlayerId, action: A): string | null {
    if (this.isOver) return 'Das Spiel ist vorbei'
    if (this.currentPlayer !== player) return 'Du bist nicht am Zug'
    return this.validate(player, action)
  }

  // --- Moves -----------------------------------------------------------------------------------

  /** Validates and applies a move. Throws a `GameError` subclass if it is not allowed. */
  dispatch(player: PlayerId, action: A): void {
    this.apply(player, action, true)
  }

  /**
   * Lets the AI make one move if it is an AI player's turn. Returns the move, or `null` if no AI
   * was due or the game changed while the agent was thinking (e.g. after an undo).
   */
  async playAiTurn(): Promise<A | null> {
    const player = this.currentPlayer
    const agent = player === null ? undefined : this.agents.get(player)
    if (player === null || !agent) return null

    const before = this.changeCount
    const action = await agent.chooseAction({
      playerId: player,
      view: this.view(player),
      legalActions: this.game.legalActions(this.currentState, player),
      rng: this.aiRng,
    })
    if (this.changeCount !== before) return null

    this.dispatch(player, action)
    return action
  }

  /** Plays AI moves until a human is due or the game ends. Returns the number of moves. */
  async runAi(maxMoves = 10_000): Promise<number> {
    let moves = 0
    while (this.isAiTurn) {
      if (moves >= maxMoves) throw new Error(`AI did not finish within ${maxMoves} moves`)
      if ((await this.playAiTurn()) === null) break
      moves++
    }
    return moves
  }

  // --- Undo & persistence ----------------------------------------------------------------------

  get canUndo(): boolean {
    return this.lastHumanEntryIndex() !== -1
  }

  /** Takes back the last human move together with all AI moves that followed it. */
  undo(): boolean {
    const index = this.lastHumanEntryIndex()
    if (index === -1) return false
    this.currentState = this.entries[index]!.stateBefore
    this.entries.length = index
    this.notify()
    return true
  }

  toSaved(): SavedGame<O, A> {
    return {
      version: 1,
      gameId: this.game.id,
      seed: this.seed,
      options: this.options,
      players: this.players,
      actions: this.entries.map(({ player, action }) => ({ player, action })),
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // --- Internals -------------------------------------------------------------------------------

  private apply(player: PlayerId, action: A, emit: boolean): void {
    if (this.isOver) throw new GameOverError('The game is already over')
    const current = this.game.currentPlayer(this.currentState)
    if (current !== player) {
      throw new NotYourTurnError(`It is ${String(current)}'s turn, not ${player}'s`)
    }
    const error = this.validate(player, action)
    if (error) throw new IllegalActionError(error)

    const stateBefore = this.currentState
    this.currentState = this.game.applyAction(stateBefore, player, action)
    this.entries.push({ player, action, stateBefore })
    if (emit) this.notify()
  }

  private validate(player: PlayerId, action: A): string | null {
    if (this.game.validateAction) return this.game.validateAction(this.currentState, player, action)
    const legal = this.game.legalActions(this.currentState, player)
    return legal.some((candidate) => deepEqual(candidate, action))
      ? null
      : `Illegal action: ${this.game.describeAction?.(action) ?? JSON.stringify(action)}`
  }

  private lastHumanEntryIndex(): number {
    if (this.game.allowUndo === false) return -1
    return this.entries.findLastIndex((entry) => !this.agents.has(entry.player))
  }

  private notify(): void {
    this.changeCount++
    for (const listener of this.listeners) listener()
  }
}
