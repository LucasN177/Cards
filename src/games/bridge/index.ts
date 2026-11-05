import { defineGame } from '@/engine'
import { createBridgeAgent } from './ai'
import {
  type BridgeAction,
  type BridgeOptions,
  bridgeRules,
  type BridgeState,
  type BridgeView,
} from './bridge'

export const bridgeGame = defineGame<BridgeState, BridgeAction, BridgeOptions, BridgeView>({
  ...bridgeRules,
  createAgent: createBridgeAgent,
  statFields: [
    { key: 'deals', label: 'Austeilungen' },
    { key: 'declared', label: 'Als Alleinspieler' },
    { key: 'made', label: 'Kontrakt erfüllt' },
  ],
  summarize({ finalState, player }) {
    const results = finalState.results
    const mine = results.filter((r) => r.contract?.declarer === player)
    return {
      deals: results.length,
      declared: mine.length,
      made: mine.filter((r) => r.overtricks >= 0).length,
    }
  },
})

export * from './bridge'
