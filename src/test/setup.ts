import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { DEFAULT_SETTINGS, useSettings } from '@/stores/settingsStore'

// jsdom has no matchMedia; default to a light OS theme.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  useSettings.setState(DEFAULT_SETTINGS)
  document.documentElement.className = ''
})
