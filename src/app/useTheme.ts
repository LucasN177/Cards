import { useEffect } from 'react'
import { type ThemePreference, useSettings } from '@/stores/settingsStore'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** Keeps the `dark` class on <html> in sync with the setting and the OS preference. */
export function useApplyTheme() {
  const preference = useSettings((s) => s.theme)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => {
      const theme = resolveTheme(preference, media.matches)
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.style.colorScheme = theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])
}

/** Mirrors the "app bar at the bottom on phones" setting to <html data-bar>, used by CSS. */
export function useApplyBarPosition() {
  const position = useSettings((s) => s.barPosition)
  useEffect(() => {
    document.documentElement.dataset.bar = position
  }, [position])
}
