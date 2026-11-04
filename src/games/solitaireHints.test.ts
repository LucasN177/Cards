import type { GameDefinition, PlayerInfo } from '@/engine'
import { freeCellGame } from './freecell/freecell'
import { klondikeGame } from './klondike/klondike'
import { spiderGame } from './spider/spider'

/**
 * Following only the hint button must never run in circles: every hint has to lead to a position
 * that was not seen before (until the game is won or no hint is left).
 */
const me: PlayerInfo = { id: 'me', name: 'Ich', kind: 'human' }

interface HintView {
  readonly hint: unknown
}

function followHints<S extends object, A, O extends object, V extends HintView>(
  game: GameDefinition<S, A, O, V>,
  options: O,
  seed: number,
  maxSteps = 800,
) {
  let state = game.setup({ players: [me], options, seed })
  const seen = new Set<string>()
  // Counters change with every move; the position itself is what must not repeat.
  const position = (s: S) => {
    const {
      moves: _moves,
      recycles: _recycles,
      ...rest
    } = s as S & { moves?: number; recycles?: number }
    return JSON.stringify(rest)
  }
  for (let step = 0; step < maxSteps; step++) {
    const key = position(state)
    if (seen.has(key)) return { repeated: true, steps: step }
    seen.add(key)
    const hint = game.playerView(state, 'me').hint as A | null
    if (!hint || game.isTerminal(state)) return { repeated: false, steps: step }
    state = game.applyAction(state, 'me', hint)
  }
  return { repeated: false, steps: maxSteps }
}

describe('solitaire hints never loop', () => {
  it.each([1, 3] as const)('Klondike (draw %i)', { timeout: 60_000 }, (drawCount) => {
    for (let seed = 0; seed < 20; seed++) {
      expect(followHints(klondikeGame, { drawCount }, seed), `seed ${seed}`).toMatchObject({
        repeated: false,
      })
    }
  })

  it('FreeCell', { timeout: 60_000 }, () => {
    for (let seed = 0; seed < 25; seed++) {
      expect(
        followHints(freeCellGame, { autoFoundation: true }, seed),
        `seed ${seed}`,
      ).toMatchObject({ repeated: false })
    }
  })

  it.each([1, 2, 4] as const)('Spider (%i suits)', { timeout: 60_000 }, (suits) => {
    for (let seed = 0; seed < 10; seed++) {
      expect(followHints(spiderGame, { suits }, seed), `seed ${seed}`).toMatchObject({
        repeated: false,
      })
    }
  })
})
