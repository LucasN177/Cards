import { defineGame } from '@/engine'
import { createGinAgent } from './ai'
import { type GinAction, type GinOptions, ginRules, type GinState, type GinView } from './gin'

export const ginRummyGame = defineGame<GinState, GinAction, GinOptions, GinView>({
  ...ginRules,
  createAgent: createGinAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'won', label: 'Hände gewonnen' },
    { key: 'gin', label: 'Gin' },
    { key: 'undercuts', label: 'Unterschnitten' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results.filter((r) => r.outcome !== 'void')
    return {
      hands: results.length,
      won: results.filter((r) => r.winner === player).length,
      gin: results.filter(
        (r) => r.winner === player && (r.outcome === 'gin' || r.outcome === 'bigGin'),
      ).length,
      undercuts: results.filter((r) => r.winner === player && r.outcome === 'undercut').length,
    }
  },
})

export * from './gin'
export * from './melds'
