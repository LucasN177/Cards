import { defineGame } from '@/engine'
import { createSchwimmenAgent } from './ai'
import {
  type SchwimmenAction,
  type SchwimmenOptions,
  schwimmenRules,
  type SchwimmenState,
  type SchwimmenView,
} from './schwimmen'

export const schwimmenGame = defineGame<
  SchwimmenState,
  SchwimmenAction,
  SchwimmenOptions,
  SchwimmenView
>({
  ...schwimmenRules,
  createAgent: createSchwimmenAgent,
  statFields: [
    { key: 'rounds', label: 'Runden' },
    { key: 'knocks', label: 'Geklopft' },
    { key: 'fires', label: '31 („Feuer“)' },
  ],
  summarize({ history, finalState, player }) {
    let knocks = 0
    for (const entry of history)
      if (entry.player === player && entry.action.type === 'knock') knocks++
    const fires = history.filter((e, i) => {
      const next = history[i + 1]?.stateBefore ?? finalState
      return (
        e.player === player && next.events.some((ev) => ev.type === 'fire' && ev.player === player)
      )
    }).length
    return { rounds: finalState.round, knocks, fires }
  },
})

export * from './schwimmen'
