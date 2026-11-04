import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { listMatches } from '@/features/stats/statsDb'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { useStats } from '@/stores/statsStore'
import { renderRoute } from '@/test/renderRoute'
import { listSaves, readSave, writeSave } from './savedGames'

function highCard(handSize: number) {
  useSettings.getState().update({ gameSpeed: 'fast', animations: false })
  useSettings.getState().setGamePreferences('high-card', {
    opponents: 1,
    difficulty: 'beginner',
    options: { handSize },
  })
}

/** Simulates closing and reopening the app: unmount and forget the in-memory game. */
function reopenApp() {
  cleanup()
  useMatch.getState().clear()
}

async function playFirstCard() {
  const hand = await screen.findByRole('group', { name: 'Deine Karten' })
  const before = within(hand).getAllByRole('button').length
  within(hand).getAllByRole('button')[0]!.click()
  await waitFor(() => expect(within(hand).queryAllByRole('button')).toHaveLength(before - 1))
}

describe('saving running games', () => {
  it('continues a game after the app was closed', async () => {
    highCard(3)
    renderRoute('/play/high-card')
    await playFirstCard()
    expect(readSave('high-card')?.saved?.actions.length).toBeGreaterThan(0)

    reopenApp()
    renderRoute('/play/high-card')
    expect(await screen.findByText('Gespeicherte Partie fortgesetzt')).toBeInTheDocument()
    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    expect(within(hand).getAllByRole('button')).toHaveLength(2)
  })

  it('offers to continue on the setup page', async () => {
    highCard(3)
    renderRoute('/play/high-card')
    await playFirstCard()
    reopenApp()

    const { user, router } = renderRoute('/games/high-card')
    expect(screen.getByRole('button', { name: /Neues Spiel/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Partie fortsetzen/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/play/high-card'))
    expect(await screen.findByText('Gespeicherte Partie fortgesetzt')).toBeInTheDocument()
  })

  it('saves nothing when the player switched it off', async () => {
    highCard(3)
    useSettings.getState().update({ saveGames: false })
    renderRoute('/play/high-card')
    await playFirstCard()
    expect(listSaves()).toEqual([])
  })

  it('starts a fresh game when a save cannot be replayed', async () => {
    highCard(3)
    writeSave({
      gameId: 'high-card',
      saved: {
        version: 1,
        gameId: 'high-card',
        seed: 1,
        options: { handSize: 3 },
        players: [
          { id: 'you', name: 'Du', kind: 'human' },
          { id: 'ai-1', name: 'Anna', kind: 'ai' },
        ],
        actions: [{ player: 'you', action: { type: 'play', cardId: 'not-a-card' } }],
      },
      preferences: { opponents: 1, difficulty: 'beginner' },
      startedAt: Date.now(),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderRoute('/play/high-card')
    const hand = await screen.findByRole('group', { name: 'Deine Karten' })
    expect(within(hand).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByText('Gespeicherte Partie fortgesetzt')).not.toBeInTheDocument()
  })
})

describe('recording finished games', () => {
  it('adds the result to the history and removes the save', async () => {
    highCard(1)
    renderRoute('/play/high-card')
    await playFirstCard()
    await screen.findByRole('dialog', {}, { timeout: 3000 })

    await waitFor(async () => expect(await listMatches()).toHaveLength(1))
    const [record] = await listMatches()
    expect(record).toMatchObject({
      gameId: 'high-card',
      humanId: 'you',
      opponents: 1,
      difficulty: 'beginner',
      moves: 2,
    })
    expect(['win', 'loss']).toContain(record!.outcome)
    expect(listSaves()).toEqual([])
  })

  it('records nothing when statistics are switched off', async () => {
    highCard(1)
    useSettings.getState().update({ recordStats: false })
    renderRoute('/play/high-card')
    await playFirstCard()
    await screen.findByRole('dialog', {}, { timeout: 3000 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await listMatches()).toEqual([])
    expect(useStats.getState().records).toBeNull()
  })
})
