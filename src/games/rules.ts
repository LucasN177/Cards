import { type ComponentType, lazy, type LazyExoticComponent } from 'react'
import type { RulesProps } from '@/features/rules/RulesText'

/** Player-facing rule texts per game, loaded on demand. */
export const GAME_RULES: Readonly<Record<string, LazyExoticComponent<ComponentType<RulesProps>>>> =
  {
    'mau-mau': lazy(() => import('./mau-mau/MauMauRules')),
    klondike: lazy(() => import('./klondike/KlondikeRules')),
    freecell: lazy(() => import('./freecell/FreeCellRules')),
    spider: lazy(() => import('./spider/SpiderRules')),
    hearts: lazy(() => import('./hearts/HeartsRules')),
  }
