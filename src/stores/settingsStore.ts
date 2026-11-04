import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Difficulty } from '@/engine'

export type ThemePreference = 'system' | 'light' | 'dark'
export type DeckStyle = 'french' | 'german'
export type GameSpeed = 'slow' | 'normal' | 'fast'

/** Last used setup per game, so the setup screen starts with the player's preferred choice. */
export interface GamePreferences {
  readonly opponents: number
  readonly difficulty: Difficulty
  readonly options?: Readonly<Record<string, unknown>>
}

export interface Settings {
  readonly playerName: string
  readonly theme: ThemePreference
  readonly deckStyle: DeckStyle
  readonly gameSpeed: GameSpeed
  readonly animations: boolean
  readonly sound: boolean
  readonly games: Readonly<Record<string, GamePreferences>>
}

interface SettingsActions {
  update(patch: Partial<Omit<Settings, 'games'>>): void
  setGamePreferences(gameId: string, preferences: GamePreferences): void
  reset(): void
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'Du',
  theme: 'system',
  deckStyle: 'french',
  gameSpeed: 'normal',
  animations: true,
  sound: true,
  games: {},
}

/** Delay between AI moves in ms. */
export const GAME_SPEED_DELAY: Readonly<Record<GameSpeed, number>> = {
  slow: 1200,
  normal: 700,
  fast: 250,
}

export const SETTINGS_STORAGE_KEY = 'cards:settings'

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setGamePreferences: (gameId, preferences) =>
        set((state) => ({ games: { ...state.games, [gameId]: preferences } })),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
