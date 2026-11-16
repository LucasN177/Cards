import { defineGame } from '@/engine'
import { createCribbageAgent } from './ai'
import {
  type CribbageAction,
  type CribbageOptions,
  cribbageRules,
  type CribbageState,
  type CribbageView,
  sideOf,
} from './cribbage'

export const cribbageGame = defineGame<
  CribbageState,
  CribbageAction,
  CribbageOptions,
  CribbageView
>({
  ...cribbageRules,
  createAgent: createCribbageAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'bestHand', label: 'Beste Hand' },
    { key: 'pegging', label: 'Punkte im Spiel (Pegging)' },
  ],
  summarize({ finalState, player }) {
    const side = sideOf(finalState.order, player)
    const shows = finalState.results.flatMap((r) =>
      r.shows.filter((s) => s.player === player && !s.crib),
    )
    return {
      hands: finalState.results.length,
      bestHand: Math.max(0, ...shows.map((s) => s.total)),
      pegging: finalState.results.reduce((sum, r) => sum + r.pegging[side]!, 0),
    }
  },
})

export * from './cribbage'
