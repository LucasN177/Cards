import { createRandomAgent } from '@/ai'
import { highCardGame, type HighCardAction, type HighCardView } from '../testing/highCardGame'
import { simulateGame } from './simulate'
import type { PlayerInfo } from './types'

const bots: PlayerInfo[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, kind: 'ai' }))
const agents = Object.fromEntries(
  bots.map((p) => [p.id, createRandomAgent<HighCardView, HighCardAction>()]),
)

describe('simulateGame', () => {
  it('plays many random games without breaking the rules', async () => {
    for (let seed = 0; seed < 300; seed++) {
      const { result, moves } = await simulateGame(highCardGame, {
        players: bots,
        agents,
        seed,
        options: { handSize: 8 },
      })
      expect(moves).toBe(32)
      expect(Object.values(result.scores).reduce((a, b) => a + b)).toBe(8)
    }
  })

  it('is reproducible for a seed', async () => {
    const run = async () =>
      (await simulateGame(highCardGame, { players: bots, agents, seed: 77 })).session.toSaved()
    expect(await run()).toEqual(await run())
  })

  it('requires an agent for every player', async () => {
    await expect(
      simulateGame(highCardGame, {
        players: [...bots.slice(0, 1), { id: 'h', name: 'h', kind: 'human' }],
        agents,
      }),
    ).rejects.toThrow(/AI agent for every player/)
  })
})
