import { cleanup, act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/renderRoute'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { App } from './App'
import { resolveTheme } from './useTheme'

describe('game catalog', () => {
  it('lists games by category and marks planned games', () => {
    renderRoute('/')
    expect(screen.getByRole('heading', { name: 'Spielauswahl' })).toBeInTheDocument()

    const german = screen.getByRole('region', { name: 'Deutsche Kartenspiele' })
    expect(within(german).getByText('Skat')).toBeInTheDocument()
    // Cribbage is still on the roadmap.
    const strategic = screen.getByRole('region', { name: 'Taktik & Strategie' })
    expect(within(strategic).getAllByText('Bald').length).toBeGreaterThan(0)
  })

  it('links playable games to their setup page', async () => {
    const { router, user } = renderRoute('/')
    await user.click(screen.getByRole('link', { name: /High Card/ }))
    expect(router.state.location.pathname).toBe('/games/high-card')
  })
})

describe('game setup', () => {
  // Unmount first: a mounted table would immediately start a new game after clear().
  afterEach(() => {
    cleanup()
    useMatch.getState().clear()
  })

  it('saves the chosen setup and opens the table', async () => {
    const { router, user } = renderRoute('/games/high-card')
    expect(screen.getByRole('heading', { name: 'High Card' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '3 Gegner' }))
    await user.click(screen.getByRole('radio', { name: 'Experte' }))
    await user.click(screen.getByRole('button', { name: /Spiel starten/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/play/high-card'))
    expect(useSettings.getState().games['high-card']).toMatchObject({
      opponents: 3,
      difficulty: 'expert',
    })
    for (const name of ['Anna', 'Ben', 'Clara']) {
      expect(await screen.findByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('starts with the previously saved setup', () => {
    useSettings.getState().setGamePreferences('high-card', { opponents: 2, difficulty: 'expert' })
    renderRoute('/games/high-card')
    expect(screen.getByRole('radio', { name: '2 Gegner' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Experte' })).toBeChecked()
  })

  it('shows planned games as coming soon', () => {
    renderRoute('/games/cribbage')
    expect(screen.getByText(/bald spielbar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Spiel starten/ })).not.toBeInTheDocument()
  })

  it('shows a not-found page for unknown games and routes', () => {
    renderRoute('/games/does-not-exist')
    expect(screen.getByText('Dieses Spiel gibt es nicht.')).toBeInTheDocument()
  })

  it('shows a not-found page for unknown paths', () => {
    renderRoute('/nope')
    expect(screen.getByRole('heading', { name: 'Nicht gefunden' })).toBeInTheDocument()
  })
})

describe('settings', () => {
  it('persists changes to local storage', async () => {
    const { user } = renderRoute('/settings')
    await user.click(await screen.findByRole('radio', { name: 'Schnell' }))
    await user.click(screen.getByRole('switch', { name: 'Soundeffekte' }))
    const name = screen.getByLabelText('Dein Name')
    await user.clear(name)
    await user.type(name, 'Lucas')

    expect(useSettings.getState()).toMatchObject({
      gameSpeed: 'fast',
      sound: false,
      playerName: 'Lucas',
    })
    const stored = JSON.parse(localStorage.getItem('cards:settings')!)
    expect(stored.state.gameSpeed).toBe('fast')

    await user.click(screen.getByRole('button', { name: /zurücksetzen/ }))
    expect(useSettings.getState().gameSpeed).toBe('normal')
  })
})

describe('theme', () => {
  it('resolves the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('applies the dark class and cycles via the header toggle', async () => {
    render(<App />)
    const html = document.documentElement
    expect(html).not.toHaveClass('dark')

    act(() => useSettings.getState().update({ theme: 'dark' }))
    expect(html).toHaveClass('dark')

    await userEvent.click(screen.getByRole('button', { name: /Design: Dunkel/ }))
    expect(useSettings.getState().theme).toBe('system')
    expect(html).not.toHaveClass('dark')
  })
})

describe('app bar position', () => {
  it('can be moved to the bottom on phones and is remembered on the device', async () => {
    const { useApplyBarPosition } = await import('./useTheme')
    function Probe() {
      useApplyBarPosition()
      return null
    }
    render(<Probe />)
    expect(document.documentElement.dataset.bar).toBe('top')

    const { user } = renderRoute('/settings')
    await user.click(await screen.findByRole('radio', { name: 'Unten' }))
    expect(useSettings.getState().barPosition).toBe('bottom')
    expect(JSON.parse(localStorage.getItem('cards:settings')!).state.barPosition).toBe('bottom')
    expect(document.documentElement.dataset.bar).toBe('bottom')
  })
})
