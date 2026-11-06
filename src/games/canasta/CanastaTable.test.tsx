import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Card, GameSession, parseCards } from '@/engine'
import CanastaTable from './CanastaTable'
import { canastaGame, type CanastaState } from './index'

const cards = (codes: string) => parseCards(codes) as Card[]

/** Two players; it is our turn to meld (we have drawn already). */
function sessionWith(hand: string) {
  const game = {
    ...canastaGame,
    setup: (args: Parameters<typeof canastaGame.setup>[0]) => {
      const s = canastaGame.setup(args)
      return {
        ...s,
        hands: { a: cards(hand), b: cards('4S 5S 6S 7S 8S 9S 10S JS QS KS 4D 5D 6D 7D 8D') },
        discard: cards('9C'),
        melds: [[], []],
        redThrees: [[], []],
        phase: 'play',
        turn: 'a',
      } as CanastaState
    },
  }
  return new GameSession(game, {
    players: [
      { id: 'a', name: 'Ich', kind: 'human' },
      { id: 'b', name: 'Bot', kind: 'ai' },
    ],
    seed: 1,
  })
}

describe('Canasta table', () => {
  it('stages groups, explains what is missing and lays them out', async () => {
    const user = userEvent.setup()
    const session = sessionWith('AC AD AH KC KD 2C 7H 8H')
    render(<CanastaTable session={session as never} humanId="a" />)
    const hand = screen.getByRole('group', { name: 'Deine Karten' })
    const pick = async (name: string) =>
      user.click(within(hand).getAllByRole('button', { name: new RegExp(`^${name}`) })[0]!)

    await pick('Kreuz Ass')
    await pick('Karo Ass')
    await pick('Herz Ass')
    await user.click(screen.getByRole('button', { name: 'Asse vormerken' }))
    // Three aces are 60 points: enough for the first meld.
    expect(screen.getByRole('button', { name: 'Auslegen (60)' })).toBeEnabled()

    await pick('Kreuz König')
    await pick('Karo König')
    await user.click(screen.getByRole('button', { name: 'Könige vormerken' }))
    // Two kings alone are no meld: the hint says why.
    expect(screen.getByRole('button', { name: 'Auslegen (80)' })).toBeDisabled()
    expect(screen.getByText(/mindestens drei Karten/)).toBeInTheDocument()

    await pick('Kreuz 2')
    await user.click(screen.getByRole('button', { name: 'Zu Könige vormerken' }))
    await user.click(screen.getByRole('button', { name: 'Auslegen (100)' }))
    expect(session.state.melds[0]!.map((m) => m.rank)).toEqual(['A', 'K'])
    expect(screen.getByRole('region', { name: 'Meldungen: Du' })).toHaveTextContent('3')
  })
})
