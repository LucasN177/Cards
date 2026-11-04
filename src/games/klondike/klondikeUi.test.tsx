import { screen, waitFor, within } from '@testing-library/react'
import { listMatches } from '@/features/stats/statsDb'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { renderRoute } from '@/test/renderRoute'
import type { KlondikeState } from './klondike'
import { klondikeLayout } from './layout'

const state = () => useMatch.getState().match!.session.state as KlondikeState

describe('Klondike setup', () => {
  it('has no opponents but lets you choose how many cards to draw', async () => {
    const { user, router } = renderRoute('/games/klondike')
    expect(screen.queryByRole('radiogroup', { name: /Gegner/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Schwierigkeit')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Drei' }))
    await user.click(screen.getByRole('button', { name: /Spiel starten/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/play/klondike'))
    expect(state().options.drawCount).toBe(3)
    expect(useSettings.getState().games['klondike']?.options).toMatchObject({ drawCount: 3 })
  })
})

describe('Klondike table', () => {
  it('turns cards from the stock and recycles the waste', async () => {
    const { user } = renderRoute('/play/klondike')
    const stock = await screen.findByRole('button', { name: /Stapel: 24 Karten/ })
    await user.click(stock)
    expect(
      within(screen.getByRole('group', { name: 'Ablage' })).getAllByRole('button'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Stapel: 23 Karten/ })).toBeInTheDocument()
    expect(screen.getByText(/Züge: 1/)).toBeInTheDocument()
  })

  it('moves a tapped card to the best place', async () => {
    const { user } = renderRoute('/play/klondike')
    await screen.findByRole('group', { name: 'Reihe 1' })
    const session = useMatch.getState().match!.session
    // Find a tableau card that has a legal move and tap it.
    const movable = state().tableau.findIndex((_, pile) =>
      session
        .legalActions('you')
        .some(
          (a) =>
            (a as { type: string; from?: { zone: string; pile?: number } }).type === 'move' &&
            (a as { from: { zone: string; pile?: number } }).from.zone === 'tableau' &&
            (a as { from: { pile: number } }).from.pile === pile,
        ),
    )
    if (movable === -1) return // this deal has no opening move; covered by the rule tests
    const before = session.history.length
    const pile = screen.getByRole('group', { name: `Reihe ${movable + 1}` })
    await user.click(within(pile).getAllByRole('button').at(-1)!)
    expect(session.history.length).toBe(before + 1)
  })

  it('counts giving up as a loss in the statistics', async () => {
    const { user } = renderRoute('/play/klondike')
    await user.click(await screen.findByRole('button', { name: 'Aufgeben' }))
    await user.click(screen.getByRole('button', { name: 'Ja' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Verloren')
    expect(dialog).toHaveTextContent('Abgelegte Karten')
    await waitFor(async () => expect(await listMatches()).toHaveLength(1))
    expect((await listMatches())[0]).toMatchObject({
      gameId: 'klondike',
      outcome: 'loss',
      opponents: 0,
    })
  })
})

describe('Klondike layout', () => {
  it('fits seven piles on a portrait phone', () => {
    const { landscape, cardWidth } = klondikeLayout(351, 740)
    expect(landscape).toBe(false)
    expect(cardWidth * 7 + 6 * 6).toBeLessThanOrEqual(351)
  })

  it('moves stock and foundations to the sides on a landscape phone', () => {
    const { landscape, cardHeight } = klondikeLayout(820, 340)
    expect(landscape).toBe(true)
    expect(cardHeight * 4 + 3 * 6 + 44).toBeLessThanOrEqual(340)
  })
})

describe('Klondike dead end', () => {
  it('offers to give up when no useful move is left', async () => {
    const { parseCards } = await import('@/engine')
    const { render } = await import('@testing-library/react')
    const userEvent = (await import('@testing-library/user-event')).default
    const { klondikeGame } = await import('./klondike')
    const KlondikeTable = (await import('./KlondikeTable')).default

    const cards = (codes: string) => parseCards(codes) as never[]
    let current: KlondikeState = {
      player: 'you',
      tableau: [
        { cards: cards('9C 4H'), hidden: 1 },
        { cards: cards('7C'), hidden: 0 },
        ...Array.from({ length: 5 }, () => ({ cards: [], hidden: 0 })),
      ],
      stock: cards('10D 2S'),
      waste: [],
      foundations: { clubs: [], spades: [], hearts: [], diamonds: [] },
      options: { drawCount: 1 },
      moves: 12,
      recycles: 1,
      resigned: false,
    }
    const listeners = new Set<() => void>()
    let version = 0
    const session = {
      get version() {
        return version
      },
      get isOver() {
        return klondikeGame.isTerminal(current)
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      view: () => klondikeGame.playerView(current, 'you'),
      legalActions: () => klondikeGame.legalActions(current, 'you'),
      dispatch: (_player: string, action: Parameters<typeof klondikeGame.applyAction>[2]) => {
        current = klondikeGame.applyAction(current, 'you', action)
        version++
        for (const listener of listeners) listener()
      },
    }

    render(<KlondikeTable session={session as never} humanId="you" />)
    const hint = screen.getByRole('status')
    expect(hint).toHaveTextContent('Keine sinnvollen Züge mehr')
    expect(screen.getAllByRole('button', { name: 'Aufgeben' })).toHaveLength(1)

    await userEvent.click(within(hint).getByRole('button', { name: 'Aufgeben' }))
    expect(current.resigned).toBe(true)
  })
})

describe('Klondike hint button', () => {
  it('highlights the suggested card or the stock', async () => {
    const { user } = renderRoute('/play/klondike')
    const button = await screen.findByRole('button', { name: /Tipp/ })
    await user.click(button)
    const highlighted = document.querySelectorAll('.animate-pulse')
    expect(highlighted.length).toBeGreaterThan(0)
  })
})

describe('Mau-Mau setup rounds', () => {
  it('offers the match length only for games that support series', async () => {
    const first = renderRoute('/games/mau-mau')
    expect(await screen.findByRole('radio', { name: '5 Runden' })).toBeInTheDocument()
    first.unmount()
    renderRoute('/games/klondike')
    expect(await screen.findByRole('button', { name: /Spiel starten/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '5 Runden' })).not.toBeInTheDocument()
  })
})
