import { defineGame } from '@/engine'
import { createSchafkopfAgent } from './ai'
import {
  type SchafkopfAction,
  type SchafkopfOptions,
  schafkopfRules,
  type SchafkopfState,
  type SchafkopfView,
} from './schafkopf'

export const schafkopfGame = defineGame<
  SchafkopfState,
  SchafkopfAction,
  SchafkopfOptions,
  SchafkopfView
>({
  ...schafkopfRules,
  createAgent: createSchafkopfAgent,
  statFields: [
    { key: 'games', label: 'Spiele' },
    { key: 'played', label: 'Selbst gespielt' },
    { key: 'won', label: 'Gewonnen' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results
    const onTeam = (r: (typeof results)[number]) => r.player === player || r.partner === player
    return {
      games: results.length,
      played: results.filter((r) => r.player === player).length,
      won: results.filter((r) => r.game && onTeam(r) === r.won).length,
    }
  },
})

export * from './schafkopf'
