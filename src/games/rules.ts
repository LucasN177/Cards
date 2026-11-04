import { type ComponentType, lazy, type LazyExoticComponent } from 'react'
import type { RulesProps } from '@/features/rules/RulesText'

/** Player-facing rule texts per game, loaded on demand. */
export const GAME_RULES: Readonly<Record<string, LazyExoticComponent<ComponentType<RulesProps>>>> =
  {
    'mau-mau': lazy(() => import('./mau-mau/MauMauRules')),
    'crazy-eights': lazy(() => import('./crazy-eights/CrazyEightsRules')),
    klondike: lazy(() => import('./klondike/KlondikeRules')),
    freecell: lazy(() => import('./freecell/FreeCellRules')),
    spider: lazy(() => import('./spider/SpiderRules')),
    hearts: lazy(() => import('./hearts/HeartsRules')),
    blackjack: lazy(() => import('./blackjack/BlackjackRules')),
    schwimmen: lazy(() => import('./schwimmen/SchwimmenRules')),
    president: lazy(() => import('./president/PresidentRules')),
    durak: lazy(() => import('./durak/DurakRules')),
    spades: lazy(() => import('./spades/SpadesRules')),
    sechsundsechzig: lazy(() => import('./sechsundsechzig/SechsundsechzigRules')),
  }
