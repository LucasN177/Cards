import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createSpadesAgent, estimateTricks } from './ai'
import {
  DEFAULT_SPADES_OPTIONS,
  playableCards,
  scoreTeam,
  type SpadesAction,
  spadesGame,
  type SpadesState,
  teamOf,
  trickWinner,
} from './index'

const rules = spadesGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const players: PlayerInfo[] = ['n', 'e', 's', 'w'].map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))

function setup(options = {}): SpadesState {
  return rules.setup({ players, options: { ...DEFAULT_SPADES_OPTIONS, ...options }, seed: 3 })
}

/** A state in the playing phase with the given hands; n leads. */
function playing(hands: Record<string, string>, extra: Partial<SpadesState> = {}): SpadesState {
  return {
    ...setup(),
    phase: 'playing',
    hands: Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)])),
    bids: { n: 1, e: 1, s: 1, w: 1 },
    turn: 'n',
    ...extra,
  }
}

const apply = (state: SpadesState, ...moves: [string, SpadesAction][]) =>
  moves.reduce((s, [p, a]) => rules.applyAction(s, p, a), state)
const play = (cardId: string): SpadesAction => ({ type: 'play', cardId })

describe('partnerships and tricks', () => {
  it('pairs seats 1+3 and 2+4', () => {
    expect(['n', 'e', 's', 'w'].map((p) => teamOf(['n', 'e', 's', 'w'], p))).toEqual([0, 1, 0, 1])
  })

  it('lets the highest spade win, otherwise the highest card of the led suit', () => {
    const t = (codes: string) =>
      cards(codes).map((card, i) => ({ player: ['n', 'e', 's', 'w'][i]!, card }))
    expect(trickWinner(t('KH AH 2S QH'))).toBe('s')
    expect(trickWinner(t('KH AH 2C QH'))).toBe('e')
    expect(trickWinner(t('KH 3S 2S QH'))).toBe('e')
  })

  it('does not let spades be led before they are broken', () => {
    const s = playing({ n: 'AS 3H', e: '2C', s: '2D', w: '3C' })
    expect(playableCards(s, 'n').map((c) => c.id)).toEqual(['3H'])
    expect(playableCards({ ...s, spadesBroken: true }, 'n')).toHaveLength(2)
    expect(playableCards({ ...s, hands: { ...s.hands, n: cards('AS KS') } }, 'n')).toHaveLength(2)
  })

  it('breaks spades when one is discarded', () => {
    const s = apply(
      playing({ n: '3H 4H', e: '2S 5C', s: '5H 6H', w: '7H 8H' }),
      ['n', play('3H')],
      ['e', play('2S')],
      ['s', play('5H')],
      ['w', play('7H')],
    )
    expect(s.spadesBroken).toBe(true)
    expect(s.tricks['e']).toBe(1)
    expect(s.turn).toBe('e')
  })
})

describe('bidding', () => {
  it('collects a bid from each player, then the player left of the dealer leads', () => {
    let s = setup()
    const first = s.turn
    for (let i = 0; i < 4; i++) s = apply(s, [s.turn, { type: 'bid', tricks: 3 }])
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe(first)
  })

  it('offers nil only with that option', () => {
    expect(rules.legalActions(setup(), setup().turn)[0]).toEqual({ type: 'bid', tricks: 0 })
    const noNil = setup({ nil: false })
    expect(rules.legalActions(noNil, noNil.turn)[0]).toEqual({ type: 'bid', tricks: 1 })
  })
})

describe('scoring', () => {
  const opts = DEFAULT_SPADES_OPTIONS
  it('gives 10 per bid trick and 1 per overtrick, minus 10 per trick when set', () => {
    expect(scoreTeam([3, 2], [3, 3], 0, opts).result).toMatchObject({ points: 51, bags: 1 })
    expect(scoreTeam([4, 3], [2, 3], 0, opts).result.points).toBe(-70)
  })

  it('scores nil with ±100 apart from the partner’s contract', () => {
    expect(scoreTeam([0, 4], [0, 4], 0, opts).result.points).toBe(140)
    const failed = scoreTeam([0, 4], [2, 4], 0, opts)
    expect(failed.result.points).toBe(-100 + 40)
    expect(failed.bags).toBe(2)
  })

  it('takes 100 points for every 10 bags', () => {
    const scored = scoreTeam([3, 3], [5, 4], 7, opts)
    expect(scored.result).toMatchObject({ points: 63 - 100, bagPenalty: true })
    expect(scored.bags).toBe(0)
    expect(scoreTeam([3, 3], [5, 4], 7, { ...opts, bags: false }).bags).toBe(10)
  })
})

describe('AI', () => {
  it('estimates strong and weak hands sensibly', () => {
    expect(estimateTricks(cards('AS KS QS JS 10S AH AD AC 2H 3H 4D 5D 6C'))).toBeGreaterThan(6)
    expect(estimateTricks(cards('2S 3H 4H 5H 6D 7D 8D 2C 3C 4C 5C 6H 9D'))).toBeLessThan(1.5)
  })

  it('plays whole games with all levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert', 'intermediate'] as const
    for (let seed = 0; seed < 30; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session, result } = await simulateGame(spadesGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createSpadesAgent(levels[i]!)])),
        options: { targetScore: seed % 3 === 0 ? 0 : 250, nil: seed % 2 === 0, bags: true },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      for (const r of s.handResults) expect(r.teams[0].tricks + r.teams[1].tricks).toBe(13)
      expect(result.winners.length).toBeGreaterThan(0)
    }
  })
})
