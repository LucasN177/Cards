import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameSession, parseCards, type SuitedCard } from '@/engine'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { playSound } from '@/features/sound/sound'
import HeartsTable from './HeartsTable'
import { DEFAULT_HEARTS_OPTIONS, heartsGame, type HeartsState } from './index'

vi.mock('@/features/sound/sound', () => ({ playSound: vi.fn(), unlockAudio: vi.fn() }))

const cards = (codes: string) => parseCards(codes) as SuitedCard[]

/** Our turn to lead the second trick with the queen of spades in hand. */
function sessionWith(hand: string) {
  const game = {
    ...heartsGame,
    setup: (args: Parameters<typeof heartsGame.setup>[0]) => {
      const s = heartsGame.setup(args)
      return {
        ...s,
        hands: { a: cards(hand), b: cards('2D 3D'), c: cards('4D 5D'), d: cards('6D 7D') },
        phase: 'playing',
        turn: 'a',
        trick: [],
        tricksPlayed: 1,
      } as HeartsState
    },
  }
  return new GameSession(game, {
    players: ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      name: id,
      kind: id === 'a' ? ('human' as const) : ('ai' as const),
    })),
    options: { ...DEFAULT_HEARTS_OPTIONS, passing: false },
    seed: 1,
  })
}

describe('Hearts table: the black pig', () => {
  it('sits on the queen of spades and runs grunting across when she is played', async () => {
    const user = userEvent.setup()
    const session = sessionWith('QS 9C')
    render(<HeartsTable session={session as never} humanId="a" />)
    const hand = screen.getByRole('group', { name: 'Deine Karten' })
    const queen = within(hand).getByRole('button', { name: /^Pik Dame/ })
    expect(within(queen).getByRole('img', { name: 'Schwarzes Schwein' })).toBeInTheDocument()
    expect(within(hand).getAllByRole('img', { name: 'Schwarzes Schwein' })).toHaveLength(1)

    // Tap twice to play (mouse: once is enough; both work).
    await act(async () => {
      await user.click(queen)
      if (session.history.length === 0) await user.click(queen)
    })
    expect(session.history.at(-1)?.action).toEqual({ type: 'play', cardId: 'QS' })
    expect(
      screen.getByRole('img', { name: /schwarzes Schwein läuft grunzend/ }),
    ).toBeInTheDocument()
    expect(playSound).toHaveBeenCalledWith('grunt')
  })

  it('does not run for other cards, and no other game shows the pig', async () => {
    const user = userEvent.setup()
    const session = sessionWith('QS 9C')
    render(<HeartsTable session={session as never} humanId="a" />)
    const nine = within(screen.getByRole('group', { name: 'Deine Karten' })).getByRole('button', {
      name: /^Kreuz 9/,
    })
    await act(async () => {
      await user.click(nine)
      if (session.history.length === 0) await user.click(nine)
    })
    expect(screen.queryByRole('img', { name: /läuft grunzend/ })).not.toBeInTheDocument()
    expect(playSound).not.toHaveBeenCalledWith('grunt')

    // Outside Hearts the queen of spades is a plain card.
    render(<PlayingCard card={cards('QS')[0]!} />)
    const plain = screen.getAllByRole('img', { name: 'Pik Dame' }).at(-1)!
    expect(within(plain).queryByRole('img', { name: 'Schwarzes Schwein' })).not.toBeInTheDocument()
  })
})
