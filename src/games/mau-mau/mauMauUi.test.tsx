import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { useMatch } from '@/stores/matchStore'
import { useSettings } from '@/stores/settingsStore'
import { renderRoute } from '@/test/renderRoute'
import { describeEvents, describeTurn } from './describe'
import { DEFAULT_MAU_MAU_OPTIONS, type MauMauView } from './mauMau'
import { parseCards } from '@/engine'

// Unmount first: a mounted table would immediately start a new game after clear().
afterEach(() => {
  cleanup()
  useMatch.getState().clear()
})

describe('Mau-Mau setup', () => {
  it('offers the rule variants and starts a game with them', async () => {
    const { user, router } = renderRoute('/games/mau-mau')
    expect(screen.getByRole('heading', { name: 'Mau-Mau' })).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: '9 – Richtungswechsel' }))
    await user.click(screen.getByRole('radio', { name: '7' }))
    await user.click(screen.getByRole('button', { name: /Spiel starten/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/play/mau-mau'))
    expect(useSettings.getState().games['mau-mau']?.options).toMatchObject({
      nineReverses: true,
      handSize: 7,
    })
    expect(useMatch.getState().match?.session.options).toMatchObject({
      nineReverses: true,
      handSize: 7,
    })
  })

  it('links to the rules', async () => {
    const { user, router } = renderRoute('/games/mau-mau')
    await user.click(screen.getByRole('link', { name: /Spielregeln lesen/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/mau-mau/rules'))
    expect(await screen.findByRole('heading', { name: 'Sonderkarten' })).toBeInTheDocument()
    expect(screen.getAllByText(/Standard: aus/)).toHaveLength(2)
  })
})

describe('Mau-Mau table', () => {
  it('shows the rules with the active variants and pauses the opponents', async () => {
    useSettings.getState().setGamePreferences('mau-mau', {
      opponents: 2,
      difficulty: 'beginner',
      options: { nineReverses: true },
    })
    const { user } = renderRoute('/play/mau-mau')
    await user.click(await screen.findByRole('button', { name: 'Spielregeln' }))

    const sheet = await screen.findByRole('dialog', { name: 'Regeln: Mau-Mau' })
    const variants = await within(sheet).findByRole('heading', {
      name: 'Varianten in diesem Spiel',
    })
    expect(variants).toBeInTheDocument()
    const session = useMatch.getState().match!.session
    const version = session.version
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(session.version).toBe(version)

    await user.click(within(sheet).getByRole('button', { name: 'Regeln schließen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('status texts', () => {
  const names = {
    humanId: 'you',
    nameOf: (id: string) => (id === 'ai-1' ? 'Anna' : id),
    style: 'french' as const,
  }

  it('describes moves in German', () => {
    const [jack] = parseCards('JC')
    expect(
      describeEvents(
        [
          { type: 'played', player: 'ai-1', card: jack!, wish: 'hearts' },
          { type: 'drew', player: 'you', count: 2, penalty: true },
          { type: 'skipped', player: 'you' },
        ],
        names,
      ),
    ).toBe('Anna spielt Kreuz Bube und wünscht sich Herz · Du ziehst 2 Karten · Du musst aussetzen')
    expect(
      describeEvents([{ type: 'played', player: 'you', card: jack!, wish: 'spades' }], names),
    ).toBe('Du spielst Kreuz Bube und wünschst dir Pik')
  })

  it('tells the player what to do', () => {
    const view = {
      winner: null,
      turn: 'you',
      pendingDraw: 4,
      drawnCardId: null,
      options: DEFAULT_MAU_MAU_OPTIONS,
    } as unknown as MauMauView
    expect(describeTurn(view, true, names.nameOf)).toBe('Lege eine 7 oder ziehe 4 Karten')
    expect(describeTurn({ ...view, pendingDraw: 0 }, true, names.nameOf)).toBe('Du bist dran')
    expect(describeTurn({ ...view, turn: 'ai-1' }, false, names.nameOf)).toBe('Anna ist am Zug …')
  })
})
