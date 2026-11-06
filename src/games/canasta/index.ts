import { defineGame } from '@/engine'
import { createCanastaAgent } from './ai'
import {
  type CanastaAction,
  type CanastaOptions,
  canastaRules,
  type CanastaState,
  type CanastaView,
  sideOf,
} from './canasta'

export const canastaGame = defineGame<CanastaState, CanastaAction, CanastaOptions, CanastaView>({
  ...canastaRules,
  createAgent: createCanastaAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'wentOut', label: 'Ausgemacht' },
    { key: 'canastas', label: 'Canastas' },
  ],
  summarize({ finalState, player }) {
    const side = sideOf(finalState.order, player)
    return {
      hands: finalState.results.length,
      wentOut: finalState.results.filter((r) => r.wentOut === player).length,
      canastas: finalState.results.reduce((s, r) => s + r.sides[side]!.canastaCount, 0),
    }
  },
})

export * from './canasta'
