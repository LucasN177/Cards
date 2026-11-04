import { defineGame } from '@/engine'
import { createSpadesAgent } from './ai'
import {
  type SpadesAction,
  type SpadesOptions,
  spadesRules,
  type SpadesState,
  type SpadesView,
  teamOf,
} from './spades'

export const spadesGame = defineGame<SpadesState, SpadesAction, SpadesOptions, SpadesView>({
  ...spadesRules,
  createAgent: createSpadesAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'contracts', label: 'Ansagen erfüllt' },
    { key: 'nils', label: 'Nil geschafft' },
  ],
  summarize({ finalState, player }) {
    const team = teamOf(finalState.order, player)
    const results = finalState.handResults
    return {
      hands: results.length,
      contracts: results.filter((r) => r.teams[team].bid > 0 && r.teams[team].points > 0).length,
      nils: results.filter((r) => r.nils[player] === true).length,
    }
  },
})

export * from './spades'
