import { defineGame } from '@/engine'
import { createDoppelkopfAgent } from './ai'
import {
  type DoppelkopfAction,
  type DoppelkopfOptions,
  doppelkopfRules,
  type DoppelkopfState,
  type DoppelkopfView,
} from './doppelkopf'

export const doppelkopfGame = defineGame<
  DoppelkopfState,
  DoppelkopfAction,
  DoppelkopfOptions,
  DoppelkopfView
>({
  ...doppelkopfRules,
  createAgent: createDoppelkopfAgent,
  statFields: [
    { key: 'games', label: 'Spiele' },
    { key: 'won', label: 'Gewonnen' },
    { key: 'soli', label: 'Soli gespielt' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results
    return {
      games: results.length,
      won: results.filter((r) => r.winner !== null && r.teams[player] === r.winner).length,
      soli: results.filter((r) => r.contract.type === 'solo' && r.contract.player === player)
        .length,
    }
  },
})

export * from './doppelkopf'
