import { defineGame } from '@/engine'
import { createHeartsAgent } from './ai'
import {
  type HeartsAction,
  type HeartsOptions,
  heartsRules,
  type HeartsState,
  type HeartsView,
  trickPoints,
} from './hearts'

export const heartsGame = defineGame<HeartsState, HeartsAction, HeartsOptions, HeartsView>({
  ...heartsRules,
  createAgent: createHeartsAgent,
  statFields: [
    { key: 'hands', label: 'Gespielte Hände' },
    { key: 'penalty', label: 'Strafpunkte' },
    { key: 'cleanHands', label: 'Hände ohne Punkte' },
    { key: 'moons', label: 'Shoot the Moon' },
  ],
  summarize({ finalState, player }) {
    const hands = finalState.handResults
    return {
      hands: hands.length,
      penalty: hands.reduce((sum, h) => sum + Math.max(0, h[player] ?? 0), 0),
      cleanHands: hands.filter((h) => (h[player] ?? 0) <= 0).length,
      moons: finalState.moons[player] ?? 0,
    }
  },
})

export { trickPoints }
export * from './hearts'
