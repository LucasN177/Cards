import { defineGame } from '@/engine'
import { createSkatAgent } from './ai'
import { type SkatAction, type SkatOptions, skatRules, type SkatState, type SkatView } from './skat'

export const skatGame = defineGame<SkatState, SkatAction, SkatOptions, SkatView>({
  ...skatRules,
  createAgent: createSkatAgent,
  statFields: [
    { key: 'games', label: 'Spiele' },
    { key: 'declared', label: 'Als Alleinspieler' },
    { key: 'won', label: 'Als Alleinspieler gewonnen' },
  ],
  summarize({ finalState, player }) {
    const mine = finalState.results.filter((r) => r.declarer === player)
    return {
      games: finalState.results.length,
      declared: mine.length,
      won: mine.filter((r) => r.won).length,
    }
  },
})

export * from './skat'
