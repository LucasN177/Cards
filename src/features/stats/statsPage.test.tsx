import { screen, within } from '@testing-library/react'
import { useSettings } from '@/stores/settingsStore'
import { renderRoute } from '@/test/renderRoute'
import { makeRecord } from '@/test/fixtures'
import { addMatch, listMatches } from './statsDb'

describe('statistics page', () => {
  it('shows an empty state before the first game', async () => {
    renderRoute('/stats')
    expect(await screen.findByText('Noch keine Partien gespielt')).toBeInTheDocument()
  })

  it('summarizes recorded games', async () => {
    await addMatch(makeRecord({ outcome: 'win' }))
    await addMatch(
      makeRecord({ outcome: 'loss', placement: 2, humanScore: 12, difficulty: 'expert' }),
    )
    renderRoute('/stats')

    const tiles = await screen.findByText('Siegquote')
    expect(tiles.closest('div')).toHaveTextContent('50 %')
    expect(screen.getByRole('heading', { name: 'Mau-Mau' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Nach Stärke der Gegner' })).toHaveTextContent(
      /Experte\s*1\s*0\s*0 %/,
    )
    expect(screen.getByRole('table', { name: 'Spieldetails' })).toHaveTextContent(
      /Gespielte Karten\s*10\s*5/,
    )
    const history = screen.getByRole('list', { name: 'Spielverlauf' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
    expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('Niederlage')
  })

  it('points to the settings when recording is off', async () => {
    useSettings.getState().update({ recordStats: false })
    renderRoute('/stats')
    expect(await screen.findByText('Aufzeichnung ist ausgeschaltet')).toBeInTheDocument()
  })
})

describe('settings: data & progress', () => {
  it('deletes the statistics only after confirming', async () => {
    await addMatch(makeRecord())
    const { user } = renderRoute('/settings')
    await user.click(await screen.findByRole('button', { name: 'Statistik löschen' }))
    expect(await listMatches()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Ja, Statistik löschen' }))
    expect(await screen.findByText('Statistik gelöscht.')).toBeInTheDocument()
    expect(await listMatches()).toEqual([])
  })

  it('removes saved games when saving is switched off', async () => {
    localStorage.setItem('cards:save:mau-mau', '{}')
    const { user } = renderRoute('/settings')
    await user.click(await screen.findByRole('switch', { name: 'Laufende Partien speichern' }))
    expect(useSettings.getState().saveGames).toBe(false)
    expect(localStorage.getItem('cards:save:mau-mau')).toBeNull()
  })
})
