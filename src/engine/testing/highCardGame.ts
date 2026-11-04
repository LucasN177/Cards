/**
 * Minimal trick game used to test the engine (not a real game for the app).
 * Each player plays one card per trick; the highest rank wins (first played wins ties);
 * the trick winner leads the next one. Most tricks wins.
 */
import { type Card, type CardId, createDeck, deal, RANKS } from '../cards'
import { defineGame } from '../core/game'
import { Rng } from '../core/rng'
import type { PlayerId } from '../core/types'
import { nextPlayer } from '../players'

export interface HighCardOptions {
  readonly handSize: number
}

export interface HighCardState {
  readonly order: readonly PlayerId[]
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>
  readonly trick: readonly { readonly player: PlayerId; readonly card: Card }[]
  /** The previous complete trick and its winner, so a UI can show who took it. */
  readonly lastTrick: HighCardState['trick']
  readonly lastWinner: PlayerId | null
  readonly tricksWon: Readonly<Record<PlayerId, number>>
  readonly turn: PlayerId
}

export interface HighCardView {
  readonly hand: readonly Card[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly trick: HighCardState['trick']
  readonly lastTrick: HighCardState['trick']
  readonly lastWinner: PlayerId | null
  readonly tricksWon: HighCardState['tricksWon']
  readonly turn: PlayerId
}

export interface HighCardAction {
  readonly type: 'play'
  readonly cardId: CardId
}

const rankValue = (card: Card) => (card.kind === 'suited' ? RANKS.indexOf(card.rank) : -1)

export const highCardGame = defineGame<
  HighCardState,
  HighCardAction,
  HighCardOptions,
  HighCardView
>({
  id: 'high-card',
  name: 'High Card',
  players: { min: 2, max: 4 },
  defaultOptions: { handSize: 3 },

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const deck = Rng.fromSeed(seed).shuffle(createDeck('piquet32'))
    const { hands } = deal(deck, order.length, options.handSize)
    return {
      order,
      hands: Object.fromEntries(order.map((id, i) => [id, hands[i]!])),
      trick: [],
      lastTrick: [],
      lastWinner: null,
      tricksWon: Object.fromEntries(order.map((id) => [id, 0])),
      turn: order[0]!,
    }
  },

  currentPlayer: (state) => state.turn,

  legalActions: (state, player) =>
    (state.hands[player] ?? []).map((card) => ({ type: 'play', cardId: card.id })),

  applyAction(state, player, action) {
    const hand = state.hands[player]!
    const card = hand.find((c) => c.id === action.cardId)!
    const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
    const trick = [...state.trick, { player, card }]

    if (trick.length < state.order.length) {
      return { ...state, hands, trick, turn: nextPlayer(state.order, player) }
    }
    const winner = trick.reduce((best, play) =>
      rankValue(play.card) > rankValue(best.card) ? play : best,
    ).player
    return {
      ...state,
      hands,
      trick: [],
      lastTrick: trick,
      lastWinner: winner,
      tricksWon: { ...state.tricksWon, [winner]: state.tricksWon[winner]! + 1 },
      turn: winner,
    }
  },

  playerView: (state, player) => ({
    hand: state.hands[player] ?? [],
    handSizes: Object.fromEntries(state.order.map((id) => [id, state.hands[id]!.length])),
    trick: state.trick,
    lastTrick: state.lastTrick,
    lastWinner: state.lastWinner,
    tricksWon: state.tricksWon,
    turn: state.turn,
  }),

  isTerminal: (state) =>
    state.trick.length === 0 && state.order.every((id) => state.hands[id]!.length === 0),

  result(state) {
    const best = Math.max(...Object.values(state.tricksWon))
    return {
      scores: state.tricksWon,
      winners: state.order.filter((id) => state.tricksWon[id] === best),
    }
  },

  describeAction: (action) => `play ${action.cardId}`,
})
