import { defineGame } from '@/engine'
import { createMauMauAgent } from './ai'
import {
  type MauMauAction,
  type MauMauOptions,
  mauMauRules,
  type MauMauState,
  type MauMauView,
} from './mauMau'

export const mauMauGame = defineGame<MauMauState, MauMauAction, MauMauOptions, MauMauView>({
  ...mauMauRules,
  createAgent: createMauMauAgent,
})

export * from './mauMau'
