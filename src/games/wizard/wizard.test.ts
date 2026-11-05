import { type Card, parseCard, parseCards, type PlayerInfo, simulateGame } from '@/engine'
import { createWizardAgent, estimateTricks } from './ai'
import {
  allowedBids,
  createWizardDeck,
  DEFAULT_WIZARD_OPTIONS,
  leadSuit,
  playableCards,
  roundsFor,
  type WizardAction,
  wizardGame,
  type WizardState,
  trickWinner,
} from './index'

const rules = wizardGame
const order = ['a', 'b', 'c']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const t = (codes: string) => parseCards(codes).map((card, i) => ({ player: order[i % 3]!, card }))

function setup(options = {}): WizardState {
  return rules.setup({ players, options: { ...DEFAULT_WIZARD_OPTIONS, ...options }, seed: 2 })
}

/** Playing phase with given hands; a leads, hearts are trump. */
function playing(hands: Record<string, string>, extra: Partial<WizardState> = {}): WizardState {
  const h: Record<string, Card[]> = Object.fromEntries(
    Object.entries(hands).map(([p, c]) => [p, parseCards(c)]),
  )
  return {
    ...setup(),
    hands: h,
    round: h['a']!.length,
    phase: 'playing',
    trump: 'hearts',
    turn: 'a',
    bids: { a: 1, b: 0, c: 0 },
    tricks: { a: 0, b: 0, c: 0 },
    ...extra,
  }
}

const apply = (state: WizardState, ...moves: [string, WizardAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal in ${s.phase}`)
    return rules.applyAction(s, p, a)
  }, state)
const play = (cardId: string): WizardAction => ({ type: 'play', cardId })

describe('deck and rounds', () => {
  it('has 60 cards: 52 plus four wizards and four jesters', () => {
    const deck = createWizardDeck()
    expect(deck).toHaveLength(60)
    expect(new Set(deck.map((c) => c.id)).size).toBe(60)
    expect(parseCard('Z1')).toMatchObject({ kind: 'joker', face: 'wizard' })
  })

  it('plays 60 ÷ players rounds, half or five', () => {
    expect([3, 4, 5, 6].map((n) => roundsFor(n, 'full'))).toEqual([20, 15, 12, 10])
    expect(roundsFor(4, 'half')).toBe(8)
    expect(roundsFor(3, 'five')).toBe(5)
  })

  it('deals one card in round one and turns up a trump card', () => {
    const s = setup()
    expect(order.map((p) => s.hands[p]!.length)).toEqual([1, 1, 1])
    expect(s.trumpCard).not.toBeNull()
  })
})

describe('tricks', () => {
  it('lets the first wizard win, else the highest trump, else the led suit', () => {
    expect(trickWinner(t('AS Z1 Z2'), 'hearts')).toBe('b')
    expect(trickWinner(t('AS 2H KS'), 'hearts')).toBe('b')
    expect(trickWinner(t('10S AS KC'), 'hearts')).toBe('b')
    expect(trickWinner(t('10S AS KC'), null)).toBe('b')
  })

  it('gives an all-jester trick to the first jester; a jester lead lets the next card set the suit', () => {
    expect(trickWinner(t('N1 N2 N3'), 'hearts')).toBe('a')
    expect(leadSuit(t('N1 5D'))).toBe('diamonds')
    expect(trickWinner(t('N1 5D KD'), 'hearts')).toBe('c')
    expect(leadSuit(t('Z1 5D'))).toBeNull()
  })

  it('requires following suit, but wizards and jesters are always allowed', () => {
    const s = playing({ a: '5S', b: '9S 2D Z1 N1', c: '3C' }, { trick: t('5S'), turn: 'b' })
    expect(
      playableCards(s, 'b')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['9S', 'N1', 'Z1'].sort())
    const free = playing({ a: 'Z1', b: '9S 2D', c: '3C' }, { trick: t('Z2'), turn: 'b' })
    expect(playableCards(free, 'b')).toHaveLength(2)
  })
})

describe('bidding and scoring', () => {
  it('collects a bid from everybody, then the player left of the dealer leads', () => {
    let s = setup()
    if (s.phase === 'chooseTrump') s = apply(s, [s.turn, { type: 'chooseTrump', suit: 'hearts' }])
    const first = s.turn
    for (let i = 0; i < 3; i++) s = apply(s, [s.turn, { type: 'bid', tricks: 0 }])
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe(first)
  })

  it('stops the dealer from making the bids add up with that option', () => {
    const s = { ...setup({ unevenBids: true }), round: 3, bids: { a: 1, b: 1, c: null } }
    expect(allowedBids({ ...s, dealer: 'c' }, 'c')).toEqual([0, 2, 3])
    expect(allowedBids({ ...s, dealer: 'a' }, 'c')).toEqual([0, 1, 2, 3])
  })

  it('scores 20 + 10 per trick for an exact bid and −10 per trick off', () => {
    const s = apply(
      playing({ a: 'AH', b: '2S', c: '3C' }, { bids: { a: 1, b: 0, c: 1 }, round: 1 }),
      ['a', play('AH')],
      ['b', play('2S')],
      ['c', play('3C')],
    )
    expect(s.roundResults[0]!.points).toEqual({ a: 30, b: 20, c: -10 })
    expect(s.round).toBe(2)
  })
})

describe('AI', () => {
  it('counts wizards and high trumps as tricks', () => {
    expect(estimateTricks(parseCards('Z1 Z2 AH KH'), 'hearts', 4)).toBeGreaterThan(3)
    expect(estimateTricks(parseCards('N1 2C 3D 4S'), 'hearts', 4)).toBeLessThan(0.5)
  })

  it('plays whole games with all levels and 3 to 6 players', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 12; seed++) {
      const n = 3 + (seed % 4)
      const ps: PlayerInfo[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        kind: 'ai',
      }))
      const { session } = await simulateGame(wizardGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createWizardAgent(levels[i % 3]!)])),
        options: { rounds: seed % 2 ? 'half' : 'full', unevenBids: seed % 3 === 0 },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      expect(s.roundResults).toHaveLength(s.totalRounds)
      s.roundResults.forEach((r, i) =>
        expect(Object.values(r.tricks).reduce((a, b) => a + b, 0)).toBe(i + 1),
      )
    }
  })
})
