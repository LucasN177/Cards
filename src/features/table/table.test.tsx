import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { readSave } from '@/features/persistence/savedGames'
import { useMatch } from '@/stores/matchStore'
import { useStats } from '@/stores/statsStore'
import { useSettings } from '@/stores/settingsStore'
import { renderRoute } from '@/test/renderRoute'

function setUpQuickGame() {
  useSettings.getState().update({ gameSpeed: 'fast', animations: false, playerName: 'Lucas' })
  useSettings.getState().setGamePreferences('high-card', {
    opponents: 1,
    difficulty: 'beginner',
    options: { handSize: 1 },
  })
}

// Unmount first: a mounted table would immediately start a new game after clear().
afterEach(() => {
  cleanup()
  useMatch.getState().clear()
})

describe('table', () => {
  it('plays a full game against the AI and offers a rematch', async () => {
    setUpQuickGame()
    const { user, router } = renderRoute('/play/high-card')

    expect(await screen.findByRole('region', { name: 'Anna' })).toBeInTheDocument()
    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    const [card] = within(hand).getAllByRole('button')
    await user.click(card!)

    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 })
    const ranking = within(dialog).getByRole('table', { name: 'Ergebnis' })
    expect(within(ranking).getByText(/Lucas/)).toBeInTheDocument()
    expect(within(ranking).getByText(/Anna/)).toBeInTheDocument()

    const firstMatch = useMatch.getState().match
    await user.click(within(dialog).getByRole('button', { name: 'Nochmal spielen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(useMatch.getState().match).not.toBe(firstMatch)

    await user.click(screen.getByRole('button', { name: 'Zur Spielauswahl' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('abandons a running game: not saved, not counted, back to the setup', async () => {
    setUpQuickGame()
    useSettings.getState().update({ saveGames: true })
    useSettings.getState().setGamePreferences('high-card', {
      opponents: 1,
      difficulty: 'beginner',
      options: { handSize: 3 },
    })
    const record = vi.spyOn(useStats.getState(), 'record')
    const { user, router } = renderRoute('/play/high-card')
    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    await user.click(within(hand).getAllByRole('button')[0]!)
    expect(readSave('high-card')).not.toBeNull()

    // "Weiterspielen" keeps the game.
    await user.click(screen.getByRole('button', { name: 'Partie abbrechen' }))
    const ask = screen.getByRole('alertdialog', { name: 'Partie abbrechen?' })
    expect(within(ask).getByRole('button', { name: 'Weiterspielen' })).toHaveFocus()
    await user.click(within(ask).getByRole('button', { name: 'Weiterspielen' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(useMatch.getState().match).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Partie abbrechen' }))
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/high-card'))
    expect(useMatch.getState().match).toBeNull()
    expect(readSave('high-card')).toBeNull()
    expect(record).not.toHaveBeenCalled()
    // The setup offers a fresh start, not "continue".
    expect(await screen.findByRole('button', { name: /Spiel starten/ })).toBeInTheDocument()
    record.mockRestore()
  })

  it('offers no abort once the game is over', async () => {
    setUpQuickGame()
    const { user } = renderRoute('/play/high-card')
    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    await user.click(within(hand).getAllByRole('button')[0]!)
    await screen.findByRole('dialog', {}, { timeout: 3000 })
    expect(screen.queryByRole('button', { name: 'Partie abbrechen' })).not.toBeInTheDocument()
  })

  it('takes a move back', async () => {
    setUpQuickGame()
    useSettings.getState().setGamePreferences('high-card', {
      opponents: 1,
      difficulty: 'beginner',
      options: { handSize: 3 },
    })
    const { user } = renderRoute('/play/high-card')
    const undo = await screen.findByRole('button', { name: 'Zug zurücknehmen' })
    expect(undo).toBeDisabled()

    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    await user.click(within(hand).getAllByRole('button')[0]!)
    expect(within(hand).getAllByRole('button')).toHaveLength(2)

    await user.click(undo)
    expect(within(hand).getAllByRole('button')).toHaveLength(3)
  })

  it('locks page scrolling while the table is open', async () => {
    setUpQuickGame()
    const { unmount } = renderRoute('/play/high-card')
    await screen.findByRole('group', { name: 'Deine Karten' })
    expect(document.documentElement).toHaveClass('table-open')
    unmount()
    expect(document.documentElement).not.toHaveClass('table-open')
  })

  it('shows a not-found page for games that cannot be played', async () => {
    renderRoute('/play/cribbage')
    expect(await screen.findByText('Dieses Spiel ist nicht spielbar.')).toBeInTheDocument()
  })
})
