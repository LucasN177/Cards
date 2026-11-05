import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createSchafkopfAgent } from './ai'
import {
  callableSuits,
  DEFAULT_SCHAFKOPF_OPTIONS,
  laufende,
  playableCards,
  type SchafkopfAction,
  schafkopfGame,
  type SchafkopfGame,
  type SchafkopfState,
  sortHand,
  trickWinner,
} from './index'

const rules = schafkopfGame
const order = ['a', 'b', 'c', 'd']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const t = (codes: string) => cards(codes).map((card, i) => ({ player: order[i]!, card }))
const sauEichel: SchafkopfGame = { type: 'sau', suit: 'clubs' }

function setup(options = {}): SchafkopfState {
  return rules.setup({ players, options: { ...DEFAULT_SCHAFKOPF_OPTIONS, ...options }, seed: 3 })
}

/** d deals, a leads. a plays a Sauspiel on the Eichel-Sau, c holds it. */
function playing(hands: Record<string, string>, extra: Partial<SchafkopfState> = {}) {
  const h = Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)]))
  return {
    ...setup(),
    dealer: 'd',
    phase: 'playing',
    player: 'a',
    game: sauEichel,
    partner: 'c',
    partnerKnown: false,
    hands: h,
    dealt: h,
    trick: [],
    tricks: [],
    turn: 'a',
    ...extra,
  } as SchafkopfState
}

const apply = (state: SchafkopfState, ...moves: [string, SchafkopfAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal (${s.phase}, turn ${s.turn})`)
    return rules.applyAction(s, p, a)
  }, state)
const play = (cardId: string): SchafkopfAction => ({ type: 'play', cardId })

describe('cards', () => {
  it('orders the trumps: Ober, Unter, then hearts', () => {
    const sorted = sortHand(cards('7H AH JD QC QD JC 10H'), sauEichel).map((c) => c.id)
    expect(sorted).toEqual(['QC', 'QD', 'JC', 'JD', 'AH', '10H', '7H'])
  })

  it('lets the highest trump or the highest card of the led suit win', () => {
    expect(trickWinner(t('AS 7H 10S KS'), sauEichel)).toBe('b')
    expect(trickWinner(t('AS JD QD 10S'), sauEichel)).toBe('c')
    expect(trickWinner(t('10S KS 9S AC'), sauEichel)).toBe('a')
    // Wenz: only Unter are trump, the Ober is a plain card.
    expect(trickWinner(t('AS QS JD 10S'), { type: 'wenz' })).toBe('c')
    // Gras solo: spades are trump.
    expect(trickWinner(t('AH 7S KH 10H'), { type: 'solo', suit: 'spades' })).toBe('b')
  })

  it('counts the Laufende with and without', () => {
    expect(laufende(cards('QC QS QH 7H'), sauEichel)).toBe(3)
    expect(laufende(cards('QH QD 7H'), sauEichel)).toBe(2)
    expect(laufende(cards('JC JS AS'), { type: 'wenz' })).toBe(2)
  })
})

describe('the called ace', () => {
  it('can only be called without holding it and with a card of its suit', () => {
    expect(callableSuits(cards('7C 8S AS 9D QC'))).toEqual(['clubs', 'diamonds'])
    expect(callableSuits(cards('QC JC 7H'))).toEqual([])
  })

  it('must be played when its suit is led and may not be thrown away', () => {
    const s = playing({ a: '7C 8H', b: '9S 7S', c: 'AC 9C KS', d: '8S 9H' })
    const led = apply(s, ['a', play('7C')], ['b', play('9S')])
    expect(playableCards(led, 'c').map((c) => c.id)).toEqual(['AC'])
    const other = {
      ...playing({ a: '8S', b: '9S', c: 'AC 9H', d: '7S' }),
      trick: t('8S 9S'),
      turn: 'c',
    }
    // c cannot follow spades but must keep the called ace.
    expect(playableCards(other, 'c').map((c) => c.id)).toEqual(['9H'])
  })

  it('has to be led itself when leading its suit – unless running away with four cards', () => {
    const s = playing({ a: '7H', b: '9S', c: 'AC 9C KS', d: '8S' }, { turn: 'c' })
    expect(
      playableCards(s, 'c')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['AC', 'KS'])
    const runAway = playing({ a: '7H', b: '9S', c: 'AC 9C 10C KC', d: '8S' }, { turn: 'c' })
    expect(playableCards(runAway, 'c')).toHaveLength(4)
  })

  it('reveals the partner when the ace is played', () => {
    const s = apply(
      playing({ a: '7C 8H', b: '9S 7S', c: 'AC 9C', d: '8S 9H' }),
      ['a', play('7C')],
      ['b', play('9S')],
      ['c', play('AC')],
    )
    expect(rules.playerView(s, 'b').partner).toBe('c')
    expect(
      rules.playerView(playing({ a: '7C', b: '9S', c: 'AC', d: '8S' }), 'b').partner,
    ).toBeNull()
  })
})

describe('bidding', () => {
  it('lets a higher game beat a lower one; all passing throws the cards in', () => {
    let s = setup()
    const first = s.turn
    s = apply(s, [first, { type: 'pass' }])
    const second = s.turn
    const solo: SchafkopfGame = { type: 'solo', suit: 'hearts' }
    s = apply(s, [second, { type: 'announce', game: solo }])
    // Nobody can announce a Sauspiel or Wenz over a solo.
    expect(rules.legalActions(s, s.turn)).toEqual([{ type: 'pass' }])
    while (s.phase === 'bidding') s = apply(s, [s.turn, { type: 'pass' }])
    expect(s).toMatchObject({ phase: 'playing', player: second, game: solo })

    let thrown = setup()
    for (let i = 0; i < 4; i++) thrown = apply(thrown, [thrown.turn, { type: 'pass' }])
    expect(thrown.results[0]).toMatchObject({ player: null, value: 0 })
    expect(thrown.gameNumber).toBe(2)
  })
})

describe('scoring', () => {
  /** The last trick; earlier tricks give the points. */
  function finish(extra: Partial<SchafkopfState>, last = 'AS 7S 10S KS') {
    const [a, b, c, d] = last.split(' ')
    return apply(
      playing({ a: a!, b: b!, c: c!, d: d! }, extra),
      ['a', play(a!)],
      ['b', play(b!)],
      ['c', play(c!)],
      ['d', play(d!)],
    )
  }
  const trick = (winner: string, codes: string) => ({
    cards: cards(codes).map((card) => ({ player: winner, card })),
    winner,
  })

  it('pays a Sauspiel: 10 each, plus Schneider and Laufende', () => {
    // a + c: 25 (last trick) + 46 = 71 → won, no Schneider. Holding only the Gras-Ober means
    // "ohne 1" – too few Laufende to count.
    const dealt = { a: cards('QS AS'), b: cards('QC 7S'), c: cards('10S'), d: cards('KS') }
    const s = finish({
      dealt,
      tricks: [trick('c', 'AH 10H AD 10D KD'), trick('b', 'AC 10C 9C KC')],
    })
    expect(s.results[0]).toMatchObject({ won: true, points: 71, schneider: false, value: 10 })
    expect(s.results[0]!.delta).toEqual({ a: 10, b: -10, c: 10, d: -10 })
  })

  it('pays a lost solo three times by the soloist', () => {
    const s = finish({
      game: { type: 'solo', suit: 'hearts' },
      partner: null,
      tricks: [trick('b', 'AH 10H AD 10D KD AC 10C')],
    })
    const r = s.results[0]!
    expect(r.won).toBe(false)
    expect(r.delta['a']).toBe(-3 * r.value)
    expect(r.delta['b']).toBe(r.value)
  })
})

describe('AI', () => {
  it('plays whole games with all levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert', 'intermediate'] as const
    let played = 0
    for (let seed = 0; seed < 25; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(schafkopfGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createSchafkopfAgent(levels[i]!)])),
        options: { games: 4, wenz: seed % 2 === 0 },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      for (const r of s.results) {
        expect(Object.values(r.delta).reduce((a, b) => a + b, 0)).toBe(0)
        if (r.game) played++
      }
    }
    expect(played).toBeGreaterThan(40)
  })
})
