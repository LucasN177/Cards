import { defineGame } from '@/engine'
import { createEuchreAgent } from './ai'
import {
  type EuchreAction,
  type EuchreOptions,
  euchreRules,
  type EuchreState,
  type EuchreView,
  teamOf,
} from './euchre'

export const euchreGame = defineGame<EuchreState, EuchreAction, EuchreOptions, EuchreView>({
  ...euchreRules,
  createAgent: createEuchreAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'made', label: 'Trumpf bestimmt und geschafft' },
    { key: 'euchred', label: 'Gegner euchred' },
  ],
  summarize({ history, finalState, player }) {
    const team = teamOf(finalState.order, player)
    const results = finalState.handResults
    const called = history.filter(
      (e) => e.player === player && (e.action.type === 'order' || e.action.type === 'call'),
    )
    let made = 0
    for (const entry of called) {
      const result = results.find((r) => r.hand === entry.stateBefore.handNumber)
      if (result && !result.euchred) made++
    }
    return {
      hands: results.length,
      made,
      euchred: results.filter((r) => r.makers !== team && r.euchred).length,
    }
  },
})

export * from './euchre'
