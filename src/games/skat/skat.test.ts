import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createSkatAgent, strength } from './ai'
import {
  DEFAULT_SKAT_OPTIONS,
  matadors,
  minimumValue,
  playableCards,
  type SkatAction,
  skatGame,
  type SkatGame,
  type SkatState,
  trickWinner,
} from './index'

const rules = skatGame
const order = ['a', 'b', 'c']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const t = (codes: string) => cards(codes).map((card, i) => ({ player: order[i]!, card }))
const clubs: SkatGame = { type: 'suit', suit: 'clubs' }
const spades: SkatGame = { type: 'suit', suit: 'spades' }

/** c deals: a is Vorhand, b Mittelhand, c Hinterhand. */
function dealt(options = {}): SkatState {
  const s = rules.setup({ players, options: { ...DEFAULT_SKAT_OPTIONS, ...options }, seed: 5 })
  return {
    ...s,
    dealer: 'c',
    bidding: { stage: 1, bidder: 'b', listener: 'a', value: 0, waiting: 'bidder' },
    turn: 'b',
  }
}

const apply = (state: SkatState, ...moves: [string, SkatAction][]) =>
  moves.reduce((s, [p, a]) => {
    const error = rules.validateAction!(s, p, a)
    if (error) throw new Error(`${p} ${JSON.stringify(a)}: ${error} (${s.phase}, turn ${s.turn})`)
    return rules.applyAction(s, p, a)
  }, state)

describe('bidding', () => {
  it('lets Mittelhand bid Vorhand, then Hinterhand bid the winner', () => {
    let s = apply(dealt(), ['b', { type: 'bid', value: 18 }], ['a', { type: 'hold' }])
    expect(s.turn).toBe('b')
    s = apply(s, ['b', { type: 'pass' }])
    expect(s.bidding).toMatchObject({ stage: 2, bidder: 'c', listener: 'a', value: 18 })
    s = apply(s, ['c', { type: 'bid', value: 20 }], ['a', { type: 'pass' }])
    expect(s).toMatchObject({ phase: 'skat', declarer: 'c', bid: 20 })
  })

  it('lets Vorhand play for 18 when both others pass, or passes the game in', () => {
    let s = apply(dealt(), ['b', { type: 'pass' }], ['c', { type: 'pass' }])
    expect(s.bidding.stage).toBe(3)
    const played = apply(s, ['a', { type: 'bid', value: 18 }])
    expect(played).toMatchObject({ declarer: 'a', bid: 18 })
    s = apply(s, ['a', { type: 'pass' }])
    expect(s.results[0]).toMatchObject({ declarer: null, value: 0 })
    expect(s.gameNumber).toBe(2)
  })
})

describe('cards', () => {
  it('ranks the jacks above all other trumps; 10 is between king and ace', () => {
    expect(trickWinner(t('AC JS JC'), clubs)).toBe('c')
    expect(trickWinner(t('AC 10C KC'), clubs)).toBe('a')
    expect(trickWinner(t('KC 10C QC'), clubs)).toBe('b')
    expect(trickWinner(t('AH 7C KH'), clubs)).toBe('b')
    // Grand: only jacks are trump.
    expect(trickWinner(t('AC JD 10C'), { type: 'grand' })).toBe('b')
    // Null: natural order, the jack is a plain card between 10 and queen.
    expect(trickWinner(t('10H JH 9H'), { type: 'null' })).toBe('b')
  })

  it('treats jacks as trumps when following suit', () => {
    const s: SkatState = {
      ...dealt(),
      phase: 'playing',
      game: spades,
      declarer: 'a',
      hands: { a: cards('7S'), b: cards('JH AC'), c: cards('8D') },
      trick: t('AS'),
      turn: 'b',
    }
    expect(playableCards(s, 'b').map((c) => c.id)).toEqual(['JH'])
  })

  it('counts matadors with and without', () => {
    expect(matadors(cards('JC JS AC 7H'), clubs)).toBe(2)
    expect(matadors(cards('JH AC 10C KH'), clubs)).toBe(2) // ohne 2
    expect(matadors(cards('JC JS JH JD AC 10C KC'), clubs)).toBe(7)
    expect(matadors(cards('JC JS JH JD AC'), { type: 'grand' })).toBe(4)
    expect(minimumValue(cards('JC JS 7H'), clubs, false)).toBe(36)
    expect(minimumValue(cards('JC JS 7H'), clubs, true, { schneider: true })).toBe(72)
  })
})

describe('scoring', () => {
  /** The last trick of a clubs game; a is declarer with the given points taken before. */
  function lastTrick(extra: Partial<SkatState>, lastCards = 'AC 7H 8H'): SkatState {
    const s: SkatState = {
      ...dealt(),
      phase: 'playing',
      declarer: 'a',
      game: clubs,
      bid: 18,
      matadors: 1,
      handGame: false,
      announcement: { schneider: false, schwarz: false, ouvert: false },
      hands: Object.fromEntries(order.map((p, i) => [p, cards(lastCards.split(' ')[i]!)])),
      skat: cards('7S 8S'),
      won: { a: [], b: [], c: [] },
      tricksWon: { a: 5, b: 2, c: 2 },
      trick: [],
      turn: 'a',
      ...extra,
    }
    return apply(
      s,
      ['a', { type: 'play', cardId: lastCards.split(' ')[0]! }],
      ['b', { type: 'play', cardId: lastCards.split(' ')[1]! }],
      ['c', { type: 'play', cardId: lastCards.split(' ')[2]! }],
    )
  }

  it('wins with more than 60 points: base × (matadors + 1), plus 50 in Seeger-Fabian', () => {
    // 51 points before + 11 for the ace = 62.
    const s = lastTrick({ won: { a: cards('AS 10S AH 10H KS QS JD'), b: [], c: [] } })
    expect(s.results[0]).toMatchObject({ won: true, points: 62, value: 24, schneider: false })
    expect(s.results[0]!.delta).toEqual({ a: 74, b: 0, c: 0 })
  })

  it('adds Schneider at 90 points', () => {
    const s = lastTrick({
      won: { a: cards('AS 10S KS QS AH 10H KH QH AD 10D KD'), b: [], c: [] },
    })
    expect(s.results[0]).toMatchObject({ won: true, schneider: true, value: 36 })
  })

  it('loses below 61 with twice the value (minus 50; defenders get 40)', () => {
    const s = lastTrick({ won: { a: cards('AS 10S'), b: [], c: [] } })
    expect(s.results[0]).toMatchObject({ won: false, value: 24 })
    expect(s.results[0]!.delta).toEqual({ a: -98, b: 40, c: 40 })
  })

  it('loses when overbid, worth the next multiple of the base value', () => {
    const s = lastTrick({ bid: 30, won: { a: cards('AS 10S AH 10H KS QS JD'), b: [], c: [] } })
    expect(s.results[0]).toMatchObject({ won: false, overbid: true, value: 36 })
    const plain = lastTrick({
      bid: 30,
      won: { a: cards('AS 10S AH 10H KS QS JD'), b: [], c: [] },
      options: { ...DEFAULT_SKAT_OPTIONS, scoring: 'standard' },
    })
    expect(plain.results[0]!.delta).toEqual({ a: -72, b: 0, c: 0 })
  })

  it('ends Null at the declarer’s first trick', () => {
    let s: SkatState = {
      ...dealt(),
      phase: 'playing',
      declarer: 'a',
      game: { type: 'null' },
      bid: 23,
      handGame: false,
      announcement: { schneider: false, schwarz: false, ouvert: false },
      hands: { a: cards('AH 7C'), b: cards('7H 8C'), c: cards('8H 9C') },
      won: { a: [], b: [], c: [] },
      tricksWon: { a: 0, b: 0, c: 0 },
      trick: [],
      turn: 'a',
    }
    s = apply(
      s,
      ['a', { type: 'play', cardId: 'AH' }],
      ['b', { type: 'play', cardId: '7H' }],
      ['c', { type: 'play', cardId: '8H' }],
    )
    expect(s.results[0]).toMatchObject({ won: false, value: 23 })
  })
})

describe('Skat and declaring', () => {
  it('takes the Skat, puts two cards away and declares', () => {
    let s = apply(
      dealt(),
      ['b', { type: 'bid', value: 18 }],
      ['a', { type: 'pass' }],
      ['c', { type: 'pass' }],
    )
    expect(s.declarer).toBe('b')
    s = apply(s, ['b', { type: 'takeSkat' }])
    expect(s.hands['b']).toHaveLength(12)
    const away = s.hands['b']!.slice(0, 2).map((c) => c.id)
    s = apply(s, ['b', { type: 'discard', cardIds: away }])
    expect(s.skat.map((c) => c.id)).toEqual(away)
    expect(
      rules.validateAction!(s, 'b', { type: 'declare', game: clubs, schneider: true }),
    ).not.toBeNull()
    s = apply(s, ['b', { type: 'declare', game: { type: 'grand' }, ouvert: false }])
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe('a')
  })

  it('allows Schneider and Schwarz announcements only in Hand games', () => {
    const s = apply(
      dealt(),
      ['b', { type: 'bid', value: 18 }],
      ['a', { type: 'pass' }],
      ['c', { type: 'pass' }],
    )
    const hand = apply(s, ['b', { type: 'declare', game: clubs, schneider: true, schwarz: true }])
    expect(hand).toMatchObject({ handGame: true, announcement: { schneider: true, schwarz: true } })
  })
})

describe('AI', () => {
  it('rates a strong clubs hand well and a weak one badly', () => {
    expect(strength(cards('JC JS JH AC 10C KC 9C AH 10H AD'), clubs)).toBeGreaterThan(8)
    expect(strength(cards('7H 8H 9S 8D 7D QS KH 9D 8S 7S'), clubs)).toBeLessThan(3)
  })

  it('plays whole matches with all levels', async () => {
    const levels = ['beginner', 'intermediate', 'expert'] as const
    let declared = 0
    for (let seed = 0; seed < 30; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(skatGame, {
        players: ps,
        agents: Object.fromEntries(
          ps.map((p, i) => [p.id, createSkatAgent(levels[(i + seed) % 3]!)]),
        ),
        options: { games: 3, scoring: seed % 2 ? 'standard' : 'seegerFabian' },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      expect(s.results).toHaveLength(3)
      for (const r of s.results) {
        if (!r.declarer) continue
        declared++
        if (r.game?.type !== 'null' && !r.overbid) expect(r.points).toBeLessThanOrEqual(120)
      }
    }
    // The AI should actually play most games instead of passing them all in.
    expect(declared).toBeGreaterThan(45)
  })
})
