import { defineGame } from '@/engine'
import { createRommeAgent } from './ai'
import {
  type RommeAction,
  type RommeOptions,
  rommeRules,
  type RommeState,
  type RommeView,
} from './romme'

export const rommeGame = defineGame<RommeState, RommeAction, RommeOptions, RommeView>({
  ...rommeRules,
  createAgent: createRommeAgent,
  statFields: [
    { key: 'rounds', label: 'Runden' },
    { key: 'won', label: 'Runden gewonnen' },
    { key: 'handRomme', label: 'Hand-Rommé' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results
    return {
      rounds: results.length,
      won: results.filter((r) => r.winner === player).length,
      handRomme: results.filter((r) => r.winner === player && r.handRomme).length,
    }
  },
})

export * from './melds'
export * from './romme'
