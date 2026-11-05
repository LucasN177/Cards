import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { useMatch } from '@/stores/matchStore'
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
    renderRoute('/play/schafkopf')
    expect(await screen.findByText('Dieses Spiel ist nicht spielbar.')).toBeInTheDocument()
  })
})
