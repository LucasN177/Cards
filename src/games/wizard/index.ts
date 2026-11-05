import { defineGame } from '@/engine'
import { createWizardAgent } from './ai'
import {
  type WizardAction,
  type WizardOptions,
  wizardRules,
  type WizardState,
  type WizardView,
} from './wizard'

export const wizardGame = defineGame<WizardState, WizardAction, WizardOptions, WizardView>({
  ...wizardRules,
  createAgent: createWizardAgent,
  statFields: [
    { key: 'rounds', label: 'Gespielte Runden' },
    { key: 'exact', label: 'Ansage genau getroffen' },
    { key: 'best', label: 'Beste Runde (Punkte)' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.roundResults
    return {
      rounds: results.length,
      exact: results.filter((r) => r.bids[player] === r.tricks[player]).length,
      best: Math.max(0, ...results.map((r) => r.points[player] ?? 0)),
    }
  },
})

export * from './wizard'
