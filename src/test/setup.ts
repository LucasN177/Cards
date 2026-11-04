import '@testing-library/jest-dom/vitest'
// jsdom has no IndexedDB; the match history uses it.
import 'fake-indexeddb/auto'
import { cleanup, configure } from '@testing-library/react'
import { resetStatsDbForTests } from '@/features/stats/statsDb'
import { useMatch } from '@/stores/matchStore'
import { DEFAULT_SETTINGS, useSettings } from '@/stores/settingsStore'
import { useStats } from '@/stores/statsStore'

// Lazy routes are transformed on first use; under parallel load that can exceed 1 s.
configure({ asyncUtilTimeout: 5000 })

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

afterEach(async () => {
  // Unmount first: a mounted table would immediately start a new game after the store reset.
  cleanup()
  useMatch.getState().clear()
  localStorage.clear()
  useSettings.setState(DEFAULT_SETTINGS)
  useStats.setState({ records: null, error: null })
  document.documentElement.className = ''
  await resetStatsDbForTests()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('cards')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
})
