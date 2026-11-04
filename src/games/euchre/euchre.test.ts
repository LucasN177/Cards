import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createEuchreAgent, handStrength } from './ai'
import {
  DEFAULT_EUCHRE_OPTIONS,
  effectiveSuit,
  type EuchreAction,
  euchreGame,
  type EuchreState,
  playableCards,
  trickWinner,
} from './index'

const rules = euchreGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const card = (code: string) => cards(code)[0]!
const order = ['n', 'e', 's', 'w']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))

/** n deals; e is first to bid. */
function bidding(hands: Record<string, string>, upcard = 'JH', options = {}): EuchreState {
  const state = rules.setup({
    players,
    options: { ...DEFAULT_EUCHRE_OPTIONS, ...options },
    seed: 1,
  })
  return {
    ...state,
    hands: Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)])),
    upcard: card(upcard),
    dealer: 'n',
    turn: 'e',
    phase: 'bid1',
  }
}

const apply = (state: EuchreState, ...moves: [string, EuchreAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal in ${s.phase} (turn ${s.turn})`)
    return rules.applyAction(s, p, a)
  }, state)
const pass: EuchreAction = { type: 'pass' }
const play = (cardId: string): EuchreAction => ({ type: 'play', cardId })

const HANDS = {
  n: '9C 10C QC KC AC',
  e: 'JS 9H 10H QH KH',
  s: '9D 10D QD KD AD',
  w: 'JC 9S 10S QS KS',
}

describe('bowers', () => {
  it('makes the jack of the same colour a trump', () => {
    expect(effectiveSuit(card('JD'), 'hearts')).toBe('hearts')
    expect(effectiveSuit(card('JC'), 'hearts')).toBe('clubs')
  })

  it('ranks right bower over left bower over the trump ace', () => {
    const t = (codes: string) => cards(codes).map((c, i) => ({ player: order[i]!, card: c }))
    expect(trickWinner(t('AH JD JH KH'), 'hearts')).toBe('s')
    expect(trickWinner(t('AH JD 9H KH'), 'hearts')).toBe('e')
    // A side suit led: any trump wins, otherwise the highest of that suit.
    expect(trickWinner(t('KS AS 9H 10S'), 'hearts')).toBe('s')
    expect(trickWinner(t('KS AS QC 10S'), 'hearts')).toBe('e')
  })

  it('makes the left bower follow trump, not its printed suit', () => {
    let s = bidding(HANDS)
    s = apply(s, ['e', { type: 'order' }], ['n', { type: 'discard', cardId: '9C' }])
    // e leads; hearts are trump. w holds JC (not a bower with hearts).
    s = apply(s, ['e', play('9H')])
    expect(playableCards(s, 's').map((c) => c.id)).toHaveLength(5)
  })
})

describe('bidding', () => {
  it('lets the dealer pick up the ordered card and discard', () => {
    const s = apply(bidding(HANDS), ['e', { type: 'order' }])
    expect(s.trump).toBe('hearts')
    expect(s.phase).toBe('discard')
    expect(s.hands['n']).toHaveLength(6)
    const after = apply(s, ['n', { type: 'discard', cardId: '9C' }])
    expect(after.hands['n']).toHaveLength(5)
    expect(after.phase).toBe('playing')
    expect(after.turn).toBe('e')
  })

  it('goes to a second round where the turned suit is not allowed', () => {
    const s = apply(bidding(HANDS), ['e', pass], ['s', pass], ['w', pass], ['n', pass])
    expect(s.phase).toBe('bid2')
    const calls = rules.legalActions(s, 'e').filter((a) => a.type === 'call')
    expect(calls.some((a) => a.type === 'call' && a.suit === 'hearts')).toBe(false)
  })

  it('sticks the dealer, or redeals without that option', () => {
    const allPass = (s: EuchreState) =>
      apply(
        s,
        ['e', pass],
        ['s', pass],
        ['w', pass],
        ['n', pass],
        ['e', pass],
        ['s', pass],
        ['w', pass],
      )
    const stuck = allPass(bidding(HANDS))
    expect(rules.legalActions(stuck, 'n').some((a) => a.type === 'pass')).toBe(false)
    const redeal = apply(allPass(bidding(HANDS, 'JH', { stickTheDealer: false })), ['n', pass])
    expect(redeal.phase).toBe('bid1')
    expect(redeal.dealer).toBe('e')
  })

  it('skips the partner of a lone maker', () => {
    let s = apply(bidding(HANDS), ['e', { type: 'order', alone: true }])
    // w sits out; the dealer n still picks up.
    expect(s.sittingOut).toBe('w')
    s = apply(s, ['n', { type: 'discard', cardId: '9C' }])
    s = apply(s, ['e', play('JS')], ['s', play('9D')])
    expect(s.turn).toBe('n')
    s = apply(s, ['n', play('10C')])
    expect(s.trick).toEqual([])
  })
})

describe('scoring', () => {
  /** Plays the hand out with the first legal card. */
  function playOut(s: EuchreState) {
    let state = s
    while (state.phase === 'playing' && state.handResults.length === s.handResults.length) {
      const [action] = rules.legalActions(state, state.turn)
      state = rules.applyAction(state, state.turn, action!)
    }
    return state
  }

  it('scores 1 for three tricks, 2 for all five, 2 for the defenders on a euchre', () => {
    // e has all high hearts: with hearts trump the makers (e/w) take every trick.
    const strong = bidding(
      {
        n: '9C 10C QC KC AC',
        e: 'JH JD AH KH QH',
        s: '9D 10D QD KD AD',
        w: '9S 10S QS KS AS',
      },
      '9H',
    )
    let s = apply(strong, ['e', { type: 'order' }], ['n', { type: 'discard', cardId: '9C' }])
    s = playOut(s)
    expect(s.handResults[0]).toMatchObject({ makers: 1, march: true, points: [0, 2] })
  })

  it('scores 4 for a lone march', () => {
    const strong = bidding(
      {
        n: '9C 10C QC KC AC',
        e: 'JH JD AH KH QH',
        s: '9D 10D QD KD AD',
        w: '9S 10S QS KS AS',
      },
      '9H',
    )
    let s = apply(
      strong,
      ['e', { type: 'order', alone: true }],
      ['n', { type: 'discard', cardId: '9C' }],
    )
    s = playOut(s)
    expect(s.handResults[0]).toMatchObject({ alone: true, points: [0, 4] })
  })

  it('gives the defenders 2 when the makers take fewer than three', () => {
    const weak = bidding(
      {
        n: 'JH JD AH KH QH',
        e: '9C 10C QC KC AC',
        s: '9S 10S QS KS AS',
        w: '9D 10D QD KD AD',
      },
      '9H',
    )
    let s = apply(weak, ['e', { type: 'order' }], ['n', { type: 'discard', cardId: '9H' }])
    s = playOut(s)
    expect(s.handResults[0]).toMatchObject({ makers: 1, euchred: true, points: [2, 0] })
  })
})

describe('AI', () => {
  it('rates bowers and trumps highly', () => {
    expect(handStrength(cards('JH JD AH KH QH'), 'hearts')).toBeGreaterThan(9)
    expect(handStrength(cards('9C 10S QD 9S 10D'), 'hearts')).toBeLessThan(2)
  })

  it('plays whole games with all levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert', 'intermediate'] as const
    for (let seed = 0; seed < 30; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(euchreGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createEuchreAgent(levels[i]!)])),
        options: { target: 10, stickTheDealer: seed % 2 === 0, goAlone: true },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(10)
      for (const r of s.handResults) expect(r.tricks[0] + r.tricks[1]).toBe(5)
    }
  })
})

describe('following suit with the left bower', () => {
  it('does not count the left bower as its printed suit', () => {
    // Hearts trump; diamonds led. s holds JD (left bower) and a club: JD does not follow diamonds.
    const s: EuchreState = {
      ...bidding(HANDS),
      phase: 'playing',
      trump: 'hearts',
      hands: { n: cards('9C'), e: cards('9H'), s: cards('JD 9C'), w: cards('9S') },
      trick: [{ player: 'e', card: card('AD') }],
      turn: 's',
    }
    expect(playableCards(s, 's')).toHaveLength(2)
    // Hearts led: the left bower must follow.
    const heartsLed = { ...s, trick: [{ player: 'e', card: card('AH') }] }
    expect(playableCards(heartsLed, 's').map((c) => c.id)).toEqual(['JD'])
  })
})
