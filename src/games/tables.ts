import { type ComponentType, lazy, type LazyExoticComponent } from 'react'
import type { GameBodyProps } from '@/features/table/session'

type TableComponent = LazyExoticComponent<ComponentType<GameBodyProps>>

/** Game-specific table UIs, loaded on demand so each game is its own chunk. */
export const GAME_TABLES: Readonly<Record<string, TableComponent>> = {
  'mau-mau': lazy(() => import('./mau-mau/MauMauTable')),
  'crazy-eights': lazy(() => import('./mau-mau/MauMauTable')),
  klondike: lazy(() => import('./klondike/KlondikeTable')),
  freecell: lazy(() => import('./freecell/FreeCellTable')),
  spider: lazy(() => import('./spider/SpiderTable')),
  hearts: lazy(() => import('./hearts/HeartsTable')),
  blackjack: lazy(() => import('./blackjack/BlackjackTable')),
  schwimmen: lazy(() => import('./schwimmen/SchwimmenTable')),
  president: lazy(() => import('./president/PresidentTable')),
  durak: lazy(() => import('./durak/DurakTable')),
  spades: lazy(() => import('./spades/SpadesTable')),
  // Same condition as TEST_GAMES_ENABLED, written inline so the bundler can drop the chunk.
  ...(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_GAMES === 'true'
    ? { 'high-card': lazy(() => import('./high-card/HighCardTable')) }
    : {}),
}
