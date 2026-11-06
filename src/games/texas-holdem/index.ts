import { defineGame } from '@/engine'
import { createHoldemAgent } from './ai'
import {
  type HoldemAction,
  type HoldemOptions,
  holdemRules,
  type HoldemState,
  type HoldemView,
} from './holdem'

export const holdemGame = defineGame<HoldemState, HoldemAction, HoldemOptions, HoldemView>({
  ...holdemRules,
  createAgent: createHoldemAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'won', label: 'Hände gewonnen' },
    { key: 'showdowns', label: 'Showdowns gewonnen' },
    { key: 'biggest', label: 'Größter Pot' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results.filter((r) => r.net[player] !== undefined)
    const won = results.filter((r) => r.pots.some((p) => p.winners.includes(player)))
    return {
      hands: results.length,
      won: won.length,
      showdowns: won.filter((r) => player in r.shown).length,
      biggest: Math.max(0, ...won.map((r) => r.net[player]!)),
    }
  },
})

export * from './handRank'
export * from './holdem'
