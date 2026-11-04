import { defineGame } from '@/engine'
import { createDurakAgent } from './ai'
import {
  type DurakAction,
  type DurakOptions,
  durakRules,
  type DurakState,
  type DurakView,
} from './durak'

export const durakGame = defineGame<DurakState, DurakAction, DurakOptions, DurakView>({
  ...durakRules,
  createAgent: createDurakAgent,
  statFields: [
    { key: 'durak', label: 'Durak geworden' },
    { key: 'defended', label: 'Angriffe abgewehrt' },
    { key: 'taken', label: 'Karten aufgenommen' },
  ],
  summarize({ history, finalState, player }) {
    let defended = 0
    let taken = 0
    history.forEach((_, i) => {
      const after = history[i + 1]?.stateBefore ?? finalState
      for (const e of after.events) {
        if (e.type === 'beaten' && e.player === player) defended++
        if (e.type === 'took' && e.player === player) taken += e.count
      }
    })
    return { durak: finalState.durak === player ? 1 : 0, defended, taken }
  },
})

export * from './durak'
