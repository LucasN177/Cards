import { type Card, parseCards, type PlayerInfo, Rng, simulateGame } from '@/engine'
import { createRommeAgent } from './ai'
import {
  analyzeMeld,
  bestMelds,
  bestMeldsWithJokers,
  DEFAULT_ROMME_OPTIONS,
  layOff,
  type Meld,
  meldValue,
  type RommeAction,
  rommeGame,
  type RommeState,
} from './index'

const rules = rommeGame
const order = ['a', 'b', 'c']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const cards = (codes: string) => parseCards(codes) as Card[]
const ids = (codes: string) => codes.split(' ')

function playing(hands: Record<string, string>, extra: Partial<RommeState> = {}): RommeState {
  const s = rules.setup({ players, options: DEFAULT_ROMME_OPTIONS, seed: 4 })
  return {
    ...s,
    hands: Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)])),
    stock: cards('2C 3C 4C 5C 6C'),
    discard: cards('9D'),
    melds: [],
    hasMelded: { a: false, b: false, c: false },
    meldedBeforeTurn: false,
    phase: 'play',
    turn: 'a',
    ...extra,
  }
}

const apply = (state: RommeState, ...moves: [string, RommeAction][]) =>
  moves.reduce((s, [p, a]) => {
    const error = rules.validateAction!(s, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error}`)
    return rules.applyAction(s, p, a)
  }, state)

describe('melds', () => {
  it('recognises sets and runs, with jokers', () => {
    expect(analyzeMeld(cards('7H 7S 7C'))?.kind).toBe('set')
    expect(analyzeMeld(cards('7H 7H:1 7C'))).toBeNull()
    expect(analyzeMeld(cards('5H 6H 7H 8H'))?.kind).toBe('run')
    expect(analyzeMeld(cards('5H 7H JKR'))?.values).toEqual([5, 6, 7])
    expect(analyzeMeld(cards('AH 2H 3H'))?.values).toEqual([1, 2, 3])
    expect(analyzeMeld(cards('QH KH AH'))?.values).toEqual([12, 13, 14])
    expect(analyzeMeld(cards('KH AH 2H'))).toBeNull()
    expect(analyzeMeld(cards('5H 6S 7H'))).toBeNull()
  })

  it('counts points: A 11 (1 in A-2-3), 10–K 10, jokers as the card they replace', () => {
    expect(meldValue(analyzeMeld(cards('10H JH QH'))!)).toBe(30)
    expect(meldValue(analyzeMeld(cards('AH 2H 3H'))!)).toBe(6)
    expect(meldValue(analyzeMeld(cards('KS KH JKB'))!)).toBe(30)
  })

  it('lays off at either end of a run and fills up sets', () => {
    const run = { ...analyzeMeld(cards('5H 6H 7H'))!, id: 'm1' } as Meld
    expect(layOff(run, cards('8H'))?.values).toEqual([5, 6, 7, 8])
    expect(layOff(run, cards('4H'))?.values).toEqual([4, 5, 6, 7])
    expect(layOff(run, cards('9H'))).toBeNull()
    const set = { ...analyzeMeld(cards('7H 7S 7C'))!, id: 'm2' } as Meld
    expect(layOff(set, cards('7D'))).not.toBeNull()
    expect(layOff(set, cards('7H:1'))).toBeNull()
  })

  it('finds the best melds in a hand', () => {
    const melds = bestMelds(cards('7H 7S 7C 9D 10D JD 2C 5S'))
    expect(
      melds
        .flat()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['10D', '7C', '7H', '7S', '9D', 'JD'].sort())
  })

  it('pools jokers for the expert: every joker counts, also as the fourth card of a set', () => {
    const hand = cards('KC KS 5H 6H JKR JKB')
    // The plain search can only ever use one joker.
    expect(bestMelds(hand).flat()).toHaveLength(3)
    const melds = bestMeldsWithJokers(hand)
    expect(
      melds
        .flat()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['5H', '6H', 'JKB', 'JKR', 'KC', 'KS'])
    expect(melds.every((m) => analyzeMeld(m))).toBe(true)
    const four = bestMeldsWithJokers(cards('QC QS QH JKR'))
    expect(four.map((m) => m.length)).toEqual([4])
    expect(meldValue(analyzeMeld(four[0]!)!)).toBe(40)
  })
})

describe('turns', () => {
  it('needs 40 points for the first lay-out', () => {
    const s = playing({ a: '7H 7S 7C KD QD JD 2C', b: '3S', c: '4S' })
    expect(rules.validateAction!(s, 'a', { type: 'meld', melds: [ids('7H 7S 7C')] })).toMatch(/40/)
    const melded = apply(s, ['a', { type: 'meld', melds: [ids('7H 7S 7C'), ids('JD QD KD')] }])
    expect(melded.melds).toHaveLength(2)
    expect(melded.hasMelded['a']).toBe(true)
    // Afterwards a single small meld or lay-off is fine.
    expect(
      rules.validateAction!(melded, 'a', { type: 'layOff', meldId: 'm2', cardIds: ['2C'] }),
    ).not.toBeNull()
  })

  it('allows lay-offs only after laying out', () => {
    const table = { ...analyzeMeld(cards('5H 6H 7H'))!, id: 'm1' } as Meld
    const s = playing({ a: '8H 2C', b: '3S', c: '4S' }, { melds: [table], nextMeldId: 2 })
    expect(
      rules.validateAction!(s, 'a', { type: 'layOff', meldId: 'm1', cardIds: ['8H'] }),
    ).toMatch(/ersten Auslegen/)
    const after = apply({ ...s, hasMelded: { a: true, b: false, c: false } }, [
      'a',
      { type: 'layOff', meldId: 'm1', cardIds: ['8H'] },
    ])
    expect(after.melds[0]!.cards).toHaveLength(4)
  })

  it('forbids throwing back the card just taken from the discard pile', () => {
    let s = playing({ a: '2C 5S', b: '3S', c: '4S' }, { phase: 'draw' })
    s = apply(s, ['a', { type: 'drawDiscard' }])
    expect(rules.validateAction!(s, 'a', { type: 'discard', cardId: '9D' })).not.toBeNull()
    s = apply(s, ['a', { type: 'discard', cardId: '5S' }])
    expect(s.turn).toBe('b')
    expect(s.phase).toBe('draw')
  })

  it('remembers openly who took which card from the discard pile', () => {
    let s = playing({ a: '2C 5S', b: '3S', c: '4S' }, { phase: 'draw' })
    s = apply(s, ['a', { type: 'drawDiscard' }], ['a', { type: 'discard', cardId: '5S' }])
    const view = rules.playerView(s, 'b')
    expect(view.pickups['a']!.map((c) => c.id)).toEqual(['9D'])
    expect(view.discardPile.map((c) => c.id)).toEqual(['5S'])
  })

  it('ends the round when a player is out; Hand-Rommé doubles the others', () => {
    const s = playing({ a: '7H 7S 7C KD QD JD 2C', b: '3S AH', c: 'JKR' })
    const out = apply(
      s,
      ['a', { type: 'meld', melds: [ids('7H 7S 7C'), ids('JD QD KD')] }],
      ['a', { type: 'discard', cardId: '2C' }],
    )
    expect(out.results[0]).toMatchObject({
      winner: 'a',
      handRomme: true,
      penalties: { a: 0, b: 28, c: 40 },
    })
  })
})

describe('AI', () => {
  const decide = async (state: RommeState, level: 'intermediate' | 'expert') =>
    await createRommeAgent(level).chooseAction({
      playerId: state.turn,
      view: rules.playerView(state, state.turn),
      legalActions: rules.legalActions(state, state.turn),
      rng: Rng.fromSeed(1),
    })

  it('the expert takes a joker from the discard pile', async () => {
    // Nothing in a's hand belongs together yet, but a joker turns any pair into a meld later.
    const s = playing(
      { a: '2C 9S KH 5D 7H JC 4S AD', b: '3S 4D 5C 6C 7C', c: '4S 5H 6H 7D 8D' },
      { phase: 'draw', discard: cards('JKR') },
    )
    expect(await decide(s, 'intermediate')).toEqual({ type: 'drawStock' })
    expect(await decide(s, 'expert')).toEqual({ type: 'drawDiscard' })
  })

  it('throws away a joker that can no longer be used (otherwise the round could never end)', async () => {
    // Only full sets on the table: a joker cannot be laid off, and two cards make no meld.
    const full = { ...analyzeMeld(cards('AC AS AD AH'))!, id: 'm1' } as Meld
    const s = playing(
      { a: '4H JKR', b: '3S 4D', c: '4S 5C' },
      { melds: [full], nextMeldId: 2, hasMelded: { a: true, b: true, c: true } },
    )
    for (const level of ['intermediate', 'expert'] as const)
      expect(await decide(s, level)).toEqual({ type: 'discard', cardId: 'JKR' })
  })

  it('the expert does not feed the next player a card for the table', async () => {
    // 8H fits the run on the table, and b (next) has laid out; 9C is just as useless to a.
    const table = { ...analyzeMeld(cards('5H 6H 7H'))!, id: 'm1' } as Meld
    const s = playing(
      { a: '8H 9C 2S', b: '3S 4D', c: '4S' },
      { melds: [table], nextMeldId: 2, hasMelded: { a: false, b: true, c: false } },
    )
    expect(await decide(s, 'expert')).not.toEqual({ type: 'discard', cardId: '8H' })
  })

  it('the expert counts cards: a pair whose completing cards are gone is worth nothing', async () => {
    // a holds 7C 7S (both 7H and both 7D lie in the discard pile) and 9H 9D (still live).
    const s = playing(
      { a: '7C 7S 9H 9D', b: '4S 5D 6C 8C 9C', c: '5S 6D 7C:1 8D 2D' },
      {
        discard: cards('7H 7H:1 7D 7D:1'),
        melds: [{ ...analyzeMeld(cards('KC KS KD'))!, id: 'm1' } as Meld],
        nextMeldId: 2,
        hasMelded: { a: true, b: true, c: true },
      },
    )
    // Without counting, a nine goes (higher penalty, both pairs look just as good).
    expect(await decide(s, 'intermediate')).toEqual({ type: 'discard', cardId: '9H' })
    const action = await decide(s, 'expert')
    expect(['7C', '7S']).toContain((action as { cardId: string }).cardId)
  })

  it('levels: the beginner takes clearly more penalty points, the expert clearly fewer', async () => {
    const three: PlayerInfo[] = ['x', 'y', 'z'].map((id) => ({ id, name: id, kind: 'ai' }))
    const average = async (level: 'beginner' | 'intermediate' | 'expert') => {
      let total = 0
      for (let seed = 0; seed < ROUNDS; seed++) {
        const { session } = await simulateGame(rommeGame, {
          players: three,
          agents: {
            x: createRommeAgent(level),
            y: createRommeAgent('intermediate'),
            z: createRommeAgent('intermediate'),
          },
          options: { ...DEFAULT_ROMME_OPTIONS, rounds: 1 },
          seed: 1_090_000 + seed,
          maxMoves: 5000,
        })
        total += session.state.scores['x']!
      }
      return total / ROUNDS
    }
    const ROUNDS = 300
    const intermediate = await average('intermediate')
    expect(await average('beginner')).toBeGreaterThan(intermediate + 4)
    // Measured over 5000 rounds: intermediate 17.3, expert 14.9 penalty points per round.
    expect(await average('expert')).toBeLessThan(intermediate - 1.5)
  }, 180_000)

  it('plays whole games', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    for (let seed = 0; seed < 12; seed++) {
      const n = 2 + (seed % 5)
      const ps: PlayerInfo[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        kind: 'ai',
      }))
      const { session } = await simulateGame(rommeGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createRommeAgent(levels[i % 3]!)])),
        options: { ...DEFAULT_ROMME_OPTIONS, rounds: 1 },
        seed,
        maxMoves: 5000,
      })
      expect(session.state.phase).toBe('over')
      expect(session.state.results).toHaveLength(1)
      // All 110 cards are still there.
      const s = session.state
      const total =
        Object.values(s.hands).reduce((a, h) => a + h.length, 0) +
        s.stock.length +
        s.discard.length +
        s.melds.reduce((a, m) => a + m.cards.length, 0)
      expect(total).toBe(110)
    }
  })
})
