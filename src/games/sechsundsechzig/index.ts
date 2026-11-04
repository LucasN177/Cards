import { defineGame } from '@/engine'
import { createSechsundsechzigAgent } from './ai'
import {
  type SechsundsechzigAction,
  type SechsundsechzigOptions,
  sechsundsechzigRules,
  type SechsundsechzigState,
  type SechsundsechzigView,
} from './sechsundsechzig'

export const sechsundsechzigGame = defineGame<
  SechsundsechzigState,
  SechsundsechzigAction,
  SechsundsechzigOptions,
  SechsundsechzigView
>({
  ...sechsundsechzigRules,
  createAgent: createSechsundsechzigAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'handsWon', label: 'Hände gewonnen' },
    { key: 'melds', label: 'Gemeldet (20/40)' },
  ],
  summarize({ history, finalState, player }) {
    const melds = history.filter(
      (e) => e.player === player && e.action.type === 'play' && e.action.meld,
    ).length
    return {
      hands: finalState.handResults.length,
      handsWon: finalState.handResults.filter((r) => r.winner === player).length,
      melds,
    }
  },
})

export * from './sechsundsechzig'
