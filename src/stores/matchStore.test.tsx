import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readSave } from '@/features/persistence/savedGames'
import { GameOverDialog } from '@/features/table/GameOverDialog'
import { mauMauGame } from '@/games/mau-mau'
import { isMatchFinished, seriesResults, useMatch } from './matchStore'
import { useSettings } from './settingsStore'

const prefs = { opponents: 1, difficulty: 'beginner' as const, rounds: 3 }

/** Plays the current round to the end by letting a random-ish human always pick the first move. */
async function finishRound() {
  const session = useMatch.getState().match!.session
  while (!session.isOver) {
    if (session.isAiTurn) await session.playAiTurn()
    else session.dispatch('you', session.legalActions('you')[0]!)
  }
}

describe('series of rounds', () => {
  it('plays the configured number of rounds and adds up the results', async () => {
    const first = useMatch.getState().start(mauMauGame, prefs)
    expect(first.series).toEqual({ rounds: 3, completed: [] })

    await finishRound()
    expect(isMatchFinished(useMatch.getState().match!)).toBe(false)
    const second = useMatch.getState().nextRound()!
    expect(second.id).not.toBe(first.id)
    expect(second.series.completed).toHaveLength(1)

    await finishRound()
    useMatch.getState().nextRound()
    await finishRound()
    const last = useMatch.getState().match!
    expect(seriesResults(last)).toHaveLength(3)
    expect(isMatchFinished(last)).toBe(true)
    expect(useMatch.getState().nextRound()).toBeNull()
  })

  it('ignores rounds for games without series support', async () => {
    const { klondikeGame } = await import('@/games/klondike/klondike')
    const match = useMatch.getState().start(klondikeGame, { ...prefs, opponents: 0 })
    expect(match.series.rounds).toBe(1)
  })

  it('keeps the series when the app is closed between two rounds', async () => {
    useMatch.getState().start(mauMauGame, prefs)
    await finishRound()
    const { persistMatch } = await import('./matchStore')
    persistMatch(useMatch.getState().match!)
    const stored = readSave('mau-mau')
    expect(stored?.saved).toBeUndefined()
    expect(stored?.series).toMatchObject({ rounds: 3 })
    expect(stored?.series?.completed).toHaveLength(1)

    useMatch.getState().clear()
    const resumed = useMatch.getState().resume(mauMauGame)!
    expect(resumed.resumed).toBe(true)
    expect(resumed.series.completed).toHaveLength(1)
    expect(resumed.session.isOver).toBe(false)
  })

  it('does not keep anything when saving is switched off', () => {
    useSettings.getState().update({ saveGames: false })
    useMatch.getState().start(mauMauGame, prefs)
    expect(readSave('mau-mau')).toBeNull()
  })
})

describe('result dialog for a series', () => {
  const players = [
    { id: 'you', name: 'Du', kind: 'human' as const },
    { id: 'ai-1', name: 'Anna', kind: 'ai' as const },
  ]
  const round = (you: number, anna: number) => ({
    scores: { you, 'ai-1': anna },
    winners: [you === 0 ? 'you' : 'ai-1'],
    scoreLabel: 'Strafpunkte',
    lowerScoreIsBetter: true,
  })

  it('shows the standings and offers the next round', async () => {
    const onNextRound = vi.fn()
    render(
      <GameOverDialog
        result={round(0, 14)}
        players={players}
        humanId="you"
        series={{ rounds: 3, results: [round(20, 0), round(0, 14)] }}
        onRestart={() => {}}
        onNextRound={onNextRound}
        onExit={() => {}}
      />,
    )
    expect(screen.getByRole('heading')).toHaveTextContent('Runde 2: Gewonnen!')
    expect(screen.getByText('Zwischenstand nach Runde 2 von 3')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Ergebnis' })
    expect(table).toHaveTextContent(/1\. Anna\s*14\s*14/)
    expect(table).toHaveTextContent(/2\. Du\s*0\s*20/)
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Runde' }))
    expect(onNextRound).toHaveBeenCalled()
  })

  it('names the match winner after the last round', () => {
    render(
      <GameOverDialog
        result={round(0, 9)}
        players={players}
        humanId="you"
        series={{ rounds: 2, results: [round(0, 12), round(0, 9)] }}
        onRestart={() => {}}
        onExit={() => {}}
      />,
    )
    expect(screen.getByRole('heading')).toHaveTextContent('Match gewonnen!')
    expect(screen.getByText('Endstand nach 2 Runden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neues Match' })).toBeInTheDocument()
  })
})
