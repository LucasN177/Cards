import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createPresidentAgent } from './ai'
import {
  canPlay,
  DEFAULT_PRESIDENT_OPTIONS,
  type PresidentAction,
  presidentGame,
  type PresidentState,
  titleOf,
} from './index'

const rules = presidentGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 'abcdefg'[i]!,
    name: 'ABCDEFG'[i]!,
    kind: i === 0 ? 'human' : 'ai',
  }))

function table(hands: Record<string, string>, turn = 'a'): PresidentState {
  const ids = Object.keys(hands)
  const state = rules.setup({
    players: players(ids.length),
    options: DEFAULT_PRESIDENT_OPTIONS,
    seed: 1,
  })
  return {
    ...state,
    hands: Object.fromEntries(ids.map((p) => [p, cards(hands[p]!)])),
    turn,
  }
}

const apply = (state: PresidentState, ...moves: [string, PresidentAction][]) =>
  moves.reduce((s, [p, a]) => {
    const error = rules.validateAction!(s, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(s, p, a)
  }, state)
const play = (codes: string): PresidentAction => ({ type: 'play', cardIds: codes.split(' ') })
const pass: PresidentAction = { type: 'pass' }

describe('playing cards', () => {
  it('needs the same number of cards and a higher rank; 2 is highest', () => {
    expect(canPlay(cards('5H'), null)).toBe(true)
    expect(canPlay(cards('5H 5S'), null)).toBe(true)
    expect(canPlay(cards('5H 6S'), null)).toBe(false)
    expect(canPlay(cards('6H'), cards('5S'))).toBe(true)
    expect(canPlay(cards('5H'), cards('5S'))).toBe(false)
    expect(canPlay(cards('6H'), cards('5S 5C'))).toBe(false)
    expect(canPlay(cards('2H'), cards('AS'))).toBe(true)
    expect(canPlay(cards('AH'), cards('2S'))).toBe(false)
  })

  it('names the titles by finishing place', () => {
    expect([0, 1, 2, 3, 4].map((i) => titleOf(i, 5))).toEqual([
      'Präsident',
      'Vize',
      'Bürger',
      'Vize-Bettler',
      'Bettler',
    ])
    expect([0, 1, 2].map((i) => titleOf(i, 3))).toEqual(['Präsident', 'Bürger', 'Bettler'])
  })

  it('does not allow passing when leading', () => {
    const s = table({ a: '5H 9S', b: '6H 7S', c: '8H 10S' })
    expect(rules.legalActions(s, 'a').some((x) => x.type === 'pass')).toBe(false)
    expect(rules.validateAction!(s, 'a', pass)).not.toBeNull()
  })

  it('gives the trick to the last player when all others passed; passed players sit out', () => {
    let s = table({ a: '5H 9S KD', b: '6H 7S 8D', c: '8H 10S JD' })
    s = apply(s, ['a', play('5H')], ['b', pass], ['c', play('8H')])
    // b passed and is skipped; a may still play.
    expect(s.turn).toBe('a')
    s = apply(s, ['a', play('9S')], ['c', pass])
    expect(s.trick).toEqual([])
    expect(s.turn).toBe('a')
    expect(s.events.some((e) => e.type === 'trickWon' && e.player === 'a')).toBe(true)
  })

  it('ends the round when only one player has cards and gives points by place', () => {
    let s = table({ a: '5H', b: '6H 7S', c: '8H 10S' })
    s = apply(s, ['a', play('5H')])
    expect(s.finished).toEqual(['a'])
    s = apply(s, ['b', play('6H')], ['c', play('8H')], ['b', pass])
    // c won the trick and leads.
    s = apply(s, ['c', play('10S')])
    expect(s.round).toBe(2)
    expect(s.rounds[0]!.order).toEqual(['a', 'c', 'b'])
    expect(s.scores).toEqual({ a: 2, b: 0, c: 1 })
  })
})

describe('the exchange', () => {
  it('moves the Bettler’s best cards to the President, who gives two back', () => {
    let s = table({ a: '5H', b: '6H 7S', c: '8H 10S' })
    s = apply(s, ['a', play('5H')], ['b', play('6H')], ['c', play('8H')], ['b', pass])
    s = apply(s, ['c', play('10S')])
    // a is President, b the Bettler.
    expect(s.phase).toBe('exchange')
    expect(s.turn).toBe('a')
    expect(s.received['a']).toHaveLength(2)
    const bettlerBest = s.received['a']!
    for (const card of bettlerBest) expect(s.hands['a']).toContainEqual(card)
    const give = s.hands['a']!.slice(0, 2).map((c) => c.id)
    s = apply(s, ['a', { type: 'give', cardIds: give }])
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe('b')
    expect(s.hands['b']!.map((c) => c.id)).toEqual(expect.arrayContaining(give))
    expect(s.hands['a']).toHaveLength(18)
    expect(s.hands['b']).toHaveLength(17)
  })
})

describe('simulation', () => {
  it('plays full games with 3 to 7 players and all AI levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 40; seed++) {
      const ps = players(3 + (seed % 5)).map((p) => ({ ...p, kind: 'ai' as const }))
      const { session, result } = await simulateGame(presidentGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createPresidentAgent(levels[i % 3]!)])),
        options: { rounds: 3, exchange: seed % 2 === 0 },
        seed,
      })
      expect(session.state.rounds).toHaveLength(3)
      const total = Object.values(result.scores).reduce((a, b) => a + b, 0)
      const n = ps.length
      expect(total).toBe((3 * n * (n - 1)) / 2)
    }
  })
})
