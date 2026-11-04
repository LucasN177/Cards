import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createDurakAgent } from './ai'
import {
  beats,
  DEFAULT_DURAK_OPTIONS,
  type DurakAction,
  durakGame,
  type DurakOptions,
  type DurakState,
} from './index'

const rules = durakGame
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const card = (code: string) => cards(code)[0]!
const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 'abcdef'[i]!,
    name: 'ABCDEF'[i]!,
    kind: i === 0 ? 'human' : 'ai',
  }))

/** a attacks b; trump is hearts. */
function table(
  hands: Record<string, string>,
  stock = '',
  options: Partial<DurakOptions> = {},
): DurakState {
  const ids = Object.keys(hands)
  const state = rules.setup({
    players: players(ids.length),
    options: { ...DEFAULT_DURAK_OPTIONS, ...options },
    seed: 1,
  })
  const h = Object.fromEntries(ids.map((p) => [p, cards(hands[p]!)]))
  return {
    ...state,
    hands: h,
    stock: cards(stock),
    trumpCard: card('6H'),
    table: [],
    attacker: 'a',
    defender: 'b',
    turn: 'a',
    phase: 'attack',
    done: [],
    limit: Math.min(6, h['b']!.length),
    firstBout: false,
    finished: [],
  }
}

const apply = (state: DurakState, ...moves: [string, DurakAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal`)
    return rules.applyAction(s, p, a)
  }, state)
const attack = (id: string): DurakAction => ({ type: 'attack', cardId: id })
const defend = (id: string): DurakAction => ({ type: 'defend', cardId: id })

describe('beating cards', () => {
  it('needs a higher card of the same suit or a trump', () => {
    expect(beats(card('9S'), card('7S'), 'hearts')).toBe(true)
    expect(beats(card('7S'), card('9S'), 'hearts')).toBe(false)
    expect(beats(card('AC'), card('7S'), 'hearts')).toBe(false)
    expect(beats(card('6H'), card('AS'), 'hearts')).toBe(true)
    expect(beats(card('7H'), card('8H'), 'hearts')).toBe(false)
  })
})

describe('a bout', () => {
  it('lets attackers add cards of ranks on the table, then discards when all is beaten', () => {
    let s = table({ a: '7S 7C 9D', b: '8S 10C KD', c: '9S JD QD' }, '6C 6D 8D 8C 9C 10D')
    s = apply(s, ['a', attack('7S')], ['b', defend('8S')])
    expect(s.turn).toBe('a')
    // Only 7s and 8s may be added now.
    expect(rules.legalActions(s, 'a')).toEqual([attack('7C'), { type: 'done' }])
    s = apply(s, ['a', attack('7C')], ['b', defend('10C')], ['a', { type: 'done' }])
    // c may add as well but has nothing fitting.
    expect(s.turn).toBe('c')
    s = apply(s, ['c', { type: 'done' }])
    expect(s.discarded).toBe(4)
    expect(s.table).toEqual([])
    // Everybody refills to six (attacker first), the defender attacks next.
    expect(s.hands['a']).toHaveLength(6)
    expect(s.attacker).toBe('b')
    expect(s.defender).toBe('c')
  })

  it('makes the defender take all cards and skips their attack', () => {
    let s = table({ a: '7S 9D', b: '8C 10C', c: '9S JD' })
    s = apply(s, ['a', attack('7S')], ['b', { type: 'take' }])
    expect(s.hands['b']!.map((c) => c.id)).toContain('7S')
    expect(s.attacker).toBe('c')
    expect(s.defender).toBe('a')
  })

  it('caps the attack at the defender’s hand size', () => {
    let s = table({ a: '7S 7C 7D', b: '8S', c: '9S JD' })
    expect(s.limit).toBe(1)
    s = apply(s, ['a', attack('7S')], ['b', defend('8S')])
    // b has no cards left: the bout is over at once.
    expect(s.discarded).toBe(2)
  })
})

describe('the end', () => {
  it('makes the last player with cards the Durak', () => {
    let s = table({ a: '7S', b: '8S 9C' })
    s = apply(s, ['a', attack('7S')], ['b', defend('8S')])
    expect(s.phase).toBe('over')
    expect(s.durak).toBe('b')
    expect(rules.result(s)).toMatchObject({ winners: ['a'], ranking: ['a', 'b'] })
  })

  it('has no Durak when the last two run out together', () => {
    let s = table({ a: '7S', b: '8S' })
    s = apply(s, ['a', attack('7S')], ['b', defend('8S')])
    expect(s.durak).toBeNull()
    expect(rules.result(s).winners).toEqual(['a', 'b'])
  })
})

describe('simulation', () => {
  it('plays full games with 2 to 6 players and all AI levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 60; seed++) {
      const ps = players(2 + (seed % 5)).map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(durakGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createDurakAgent(levels[i % 3]!)])),
        options: { throwIn: seed % 2 ? 'all' : 'attacker', firstAttackFive: true },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      const total = Object.values(s.hands).reduce((n, h) => n + h.length, 0)
      expect(total + s.discarded + s.stock.length).toBe(36)
    }
  })
})
