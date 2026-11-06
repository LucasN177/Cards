import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Card, GameSession, parseCards } from '@/engine'
import { rommeGame, type RommeState } from './index'
import RommeTable from './RommeTable'

const cards = (codes: string) => parseCards(codes) as Card[]

/** A session whose first state is a hand we choose: it is our turn to play. */
function sessionWith(hand: string) {
  const game = {
    ...rommeGame,
    setup: (args: Parameters<typeof rommeGame.setup>[0]) => {
      const s = rommeGame.setup(args)
      return {
        ...s,
        hands: { a: cards(hand), b: cards('2S 3S 4S 5S 6S 8S 9S 10S JS QS KS AS 2D') },
        discard: cards('9C'),
        phase: 'play',
        turn: 'a',
      } as RommeState
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

describe('Rommé table', () => {
  it('stages groups, lays them out together and discards', async () => {
    const user = userEvent.setup()
    const session = sessionWith('7H 7S 7C JD QD KD 2C')
    render(<RommeTable session={session as never} humanId="a" />)
    const hand = screen.getByRole('group', { name: 'Deine Karten' })
    const pick = async (name: string) =>
      user.click(within(hand).getByRole('button', { name: new RegExp(`^${name}`) }))

    await pick('Herz 7')
    await pick('Pik 7')
    await pick('Kreuz 7')
    await user.click(screen.getByRole('button', { name: 'Satz vormerken (21)' }))
    // 21 points are not enough for the first lay-out.
    expect(screen.getByRole('button', { name: 'Auslegen (21)' })).toBeDisabled()

    await pick('Karo Bube')
    await pick('Karo Dame')
    await pick('Karo König')
    await user.click(screen.getByRole('button', { name: 'Folge vormerken (30)' }))
    await user.click(screen.getByRole('button', { name: 'Auslegen (51)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(session.state.hasMelded['a']).toBe(true)

    await pick('Kreuz 2')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Kreuz 2 ablegen' }))
    })
    // The last card is gone: the round is over.
    expect(session.state.results[0]).toMatchObject({ winner: 'a' })
  })
})
