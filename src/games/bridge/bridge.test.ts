import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createBridgeAgent, hcp, targetContract, partnerInfo } from './ai'
import {
  actingPlayer,
  type BridgeAction,
  bridgeGame,
  type BridgeState,
  contractScore,
  DEFAULT_BRIDGE_OPTIONS,
  legalCalls,
  trickWinner,
  vulnerability,
} from './index'

const rules = bridgeGame
// South, West, North, East.
const order = ['s', 'w', 'n', 'e']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]

function setup(): BridgeState {
  const s = rules.setup({ players, options: DEFAULT_BRIDGE_OPTIONS, seed: 9 })
  return { ...s, dealer: 's', turn: 's' }
}

const apply = (state: BridgeState, ...moves: [string, BridgeAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal (${s.phase}, turn ${s.turn})`)
    return rules.applyAction(s, p, a)
  }, state)
const bid = (
  level: number,
  strain: 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'notrump',
): Extract<BridgeAction, { type: 'bid' }> => ({
  type: 'bid',
  level,
  strain,
})
const pass: BridgeAction = { type: 'pass' }

describe('auction', () => {
  it('only allows higher bids; double the opponents, redouble a double', () => {
    let s = apply(setup(), ['s', bid(1, 'hearts')])
    const calls = legalCalls(s, 'w')
    expect(calls).not.toContainEqual(bid(1, 'diamonds'))
    expect(calls).toContainEqual(bid(1, 'spades'))
    expect(calls).toContainEqual({ type: 'double' })
    s = apply(s, ['w', { type: 'double' }])
    expect(legalCalls(s, 'n')).toContainEqual({ type: 'redouble' })
    expect(legalCalls(s, 'e')).not.toContainEqual({ type: 'double' })
  })

  it('ends after three passes; the first of the side to name the strain declares', () => {
    const s = apply(
      setup(),
      ['s', bid(1, 'hearts')],
      ['w', pass],
      ['n', bid(3, 'hearts')],
      ['e', pass],
      ['s', bid(4, 'hearts')],
      ['w', pass],
      ['n', pass],
      ['e', pass],
    )
    expect(s.phase).toBe('playing')
    expect(s.contract).toEqual({ level: 4, strain: 'hearts', declarer: 's', doubled: 0 })
    // West leads; when North (dummy) is on turn, South plays for them.
    expect(s.turn).toBe('w')
    expect(actingPlayer({ ...s, turn: 'n' })).toBe('s')
  })

  it('redeals when all four pass', () => {
    const s = apply(setup(), ['s', pass], ['w', pass], ['n', pass], ['e', pass])
    expect(s.results[0]).toMatchObject({ contract: null })
    expect(s.dealNumber).toBe(2)
  })
})

describe('tricks', () => {
  it('lets trumps win, otherwise the highest card of the led suit', () => {
    const t = (codes: string) => cards(codes).map((card, i) => ({ player: order[i]!, card }))
    expect(trickWinner(t('AS 2H KS QS'), 'hearts')).toBe('w')
    expect(trickWinner(t('10S AD KS QS'), 'notrump')).toBe('n')
  })
})

describe('scoring', () => {
  const c = (
    level: number,
    strain: 'clubs' | 'hearts' | 'notrump' | 'spades',
    doubled: 0 | 1 | 2 = 0,
  ) => ({
    level,
    strain,
    declarer: 's',
    doubled,
  })
  it('scores part-scores, games and slams', () => {
    expect(contractScore(c(2, 'hearts'), 8, false)).toBe(110)
    expect(contractScore(c(3, 'notrump'), 9, false)).toBe(400)
    expect(contractScore(c(3, 'notrump'), 10, true)).toBe(630)
    expect(contractScore(c(4, 'spades'), 10, true)).toBe(620)
    expect(contractScore(c(6, 'spades'), 12, false)).toBe(980)
    expect(contractScore(c(7, 'notrump'), 13, true)).toBe(2220)
    expect(contractScore(c(5, 'clubs'), 11, false)).toBe(400)
  })

  it('scores doubled contracts and undertricks', () => {
    expect(contractScore(c(2, 'hearts', 1), 8, false)).toBe(470)
    expect(contractScore(c(4, 'spades'), 8, false)).toBe(-100)
    expect(contractScore(c(4, 'spades'), 8, true)).toBe(-200)
    expect(contractScore(c(4, 'spades', 1), 7, false)).toBe(-500)
    expect(contractScore(c(4, 'spades', 1), 7, true)).toBe(-800)
    expect(contractScore(c(4, 'spades', 2), 9, false)).toBe(-200)
  })

  it('follows the Chicago vulnerability', () => {
    expect(vulnerability(order, 1, 's')).toEqual({ ns: false, ew: false })
    expect(vulnerability(order, 2, 'w')).toEqual({ ns: false, ew: true })
    expect(vulnerability(order, 3, 'n')).toEqual({ ns: true, ew: false })
    expect(vulnerability(order, 4, 'e')).toEqual({ ns: true, ew: true })
  })
})

describe('AI', () => {
  it('counts points and finds a major fit game', () => {
    const hand = cards('AS KS QS 9S 3S KH 5H 4H AD 7D 2C 3C 4C')
    expect(hcp(hand)).toBe(16)
    const info = partnerInfo(
      [
        { player: 'n', call: bid(1, 'spades') },
        { player: 'e', call: pass },
      ],
      's',
      order,
    )
    expect(targetContract(hand, info)).toEqual({ level: 4, strain: 'spades' })
  })

  it('plays whole matches with all levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert', 'intermediate'] as const
    let contracts = 0
    for (let seed = 0; seed < 12; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(bridgeGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createBridgeAgent(levels[i]!)])),
        options: { deals: 4 },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      for (const r of s.results) if (r.contract) contracts++
    }
    expect(contracts).toBeGreaterThan(30)
  })
})
