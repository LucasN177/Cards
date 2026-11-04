import { defineGame } from '@/engine'
import { createPresidentAgent } from './ai'
import {
  type PresidentAction,
  type PresidentOptions,
  presidentRules,
  type PresidentState,
  type PresidentView,
} from './president'

export const presidentGame = defineGame<
  PresidentState,
  PresidentAction,
  PresidentOptions,
  PresidentView
>({
  ...presidentRules,
  createAgent: createPresidentAgent,
  statFields: [
    { key: 'president', label: 'Präsident geworden' },
    { key: 'bettler', label: 'Bettler geworden' },
    { key: 'tricks', label: 'Stiche gewonnen' },
  ],
  summarize({ history, finalState, player }) {
    let president = 0
    let bettler = 0
    for (const round of finalState.rounds) {
      if (round.order[0] === player) president++
      if (round.order.at(-1) === player) bettler++
    }
    let tricks = 0
    history.forEach((_, i) => {
      const after = history[i + 1]?.stateBefore ?? finalState
      for (const e of after.events) if (e.type === 'trickWon' && e.player === player) tricks++
    })
    return { president, bettler, tricks }
  },
})

export * from './president'
