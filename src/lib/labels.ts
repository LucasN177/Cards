import type { Difficulty } from '@/engine'
import type { DeckStyle, GameSpeed, ThemePreference } from '@/stores/settingsStore'

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  expert: 'Experte',
}

export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: 'System',
  light: 'Hell',
  dark: 'Dunkel',
}

export const DECK_STYLE_LABELS: Readonly<Record<DeckStyle, string>> = {
  french: 'Französisches Blatt',
  german: 'Deutsches Blatt',
}

export const GAME_SPEED_LABELS: Readonly<Record<GameSpeed, string>> = {
  slow: 'Langsam',
  normal: 'Normal',
  fast: 'Schnell',
}

export function playerCountLabel({ min, max }: { min: number; max: number }): string {
  if (min === max) return min === 1 ? '1 Spieler' : `${min} Spieler`
  return `${min}–${max} Spieler`
}
