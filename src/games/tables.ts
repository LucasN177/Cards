import { type ComponentType, lazy, type LazyExoticComponent } from 'react'
import type { GameBodyProps } from '@/features/table/session'

type TableComponent = LazyExoticComponent<ComponentType<GameBodyProps>>

/** Game-specific table UIs, loaded on demand so each game is its own chunk. */
export const GAME_TABLES: Readonly<Record<string, TableComponent>> = {
  // Same condition as TEST_GAMES_ENABLED, written inline so the bundler can drop the chunk.
  ...(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_GAMES === 'true'
    ? { 'high-card': lazy(() => import('./high-card/HighCardTable')) }
    : {}),
}
