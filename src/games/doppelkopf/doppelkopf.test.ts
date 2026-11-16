import { parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import { createDoppelkopfAgent } from './ai'
import {
  type Contract,
  DEFAULT_DOPPELKOPF_OPTIONS,
  type DoppelkopfAction,
  doppelkopfGame,
  type DoppelkopfState,
  playableCards,
  RULESETS,
  sortHand,
  target,
  trickWinner,
} from './index'

const rules = doppelkopfGame
const order = ['a', 'b', 'c', 'd']
const players: PlayerInfo[] = order.map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: i === 0 ? 'human' : 'ai',
}))
const cards = (codes: string) => parseCards(codes) as SuitedCard[]
const t = (codes: string) => cards(codes).map((card, i) => ({ player: order[i]!, card }))
const normal: Contract = { type: 'normal' }

function setup(options = {}): DoppelkopfState {
  return rules.setup({
    players,
    options: { ...DEFAULT_DOPPELKOPF_OPTIONS, ...options },
    seed: 7,
  })
}

/** d deals, a leads; a and c are Re. */
function playing(hands: Record<string, string>, extra: Partial<DoppelkopfState> = {}) {
  return {
    ...setup(),
    dealer: 'd',
    phase: 'playing',
    contract: normal,
    teams: { a: 're', b: 'kontra', c: 're', d: 'kontra' },
    revealed: [],
    announcements: { re: null, kontra: null },
    hands: Object.fromEntries(Object.entries(hands).map(([p, c]) => [p, cards(c)])),
    trick: [],
    tricks: [],
    turn: 'a',
    ...extra,
  } as DoppelkopfState
}

const apply = (state: DoppelkopfState, ...moves: [string, DoppelkopfAction][]) =>
  moves.reduce((s, [p, a]) => {
    const legal = rules.legalActions(s, p)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a)))
      throw new Error(`${p} ${JSON.stringify(a)} not legal (${s.phase}, turn ${s.turn})`)
    return rules.applyAction(s, p, a)
  }, state)
const play = (cardId: string): DoppelkopfAction => ({ type: 'play', cardId })

describe('cards', () => {
  it('deals 12 cards each with nines, 10 without', () => {
    expect(order.map((p) => setup().hands[p]!.length)).toEqual([12, 12, 12, 12])
    expect(order.map((p) => setup({ nines: false }).hands[p]!.length)).toEqual([10, 10, 10, 10])
  })

  it('orders trumps: Dulle, queens, jacks, then diamonds', () => {
    const sorted = sortHand(cards('9D AD JD QC 10H KD 10D JC QD'), normal).map((c) => c.id)
    expect(sorted).toEqual(['10H', 'QC', 'QD', 'JC', 'JD', 'AD', '10D', 'KD', '9D'])
  })

  it('lets the first of two equal cards win', () => {
    expect(trickWinner(t('QC QC:1 9D 10D'), normal)).toBe('a')
    expect(trickWinner(t('AS AS:1 10S KS'), normal)).toBe('a')
    expect(trickWinner(t('AS 9D 10S KS'), normal)).toBe('b')
  })

  it('treats the heart 10 as trump when hearts are led', () => {
    const s = playing({ a: 'AH', b: '10H 9C', c: 'KC', d: 'KD' }, { trick: t('AH'), turn: 'b' })
    // b has no plain hearts: the Dulle does not follow hearts.
    expect(playableCards(s, 'b')).toHaveLength(2)
  })

  it('changes the trumps in solos', () => {
    const queens: Contract = { type: 'solo', kind: 'queens', player: 'a' }
    expect(trickWinner(t('10H QD 9H AH'), queens)).toBe('b')
    const fleischlos: Contract = { type: 'solo', kind: 'fleischlos', player: 'a' }
    expect(trickWinner(t('JS QS 9S KS'), fleischlos)).toBe('d')
    const spades: Contract = { type: 'solo', kind: 'spades', player: 'a' }
    expect(trickWinner(t('AD 9S QD 10H'), spades)).toBe('d')
  })
})

describe('parties and reservations', () => {
  it('puts the club queen holders on Re; both queens in one hand is a silent wedding', () => {
    let s = setup()
    for (let i = 0; i < 4; i++) s = apply(s, [s.turn, { type: 'healthy' }])
    expect(s.phase).toBe('playing')
    const re = order.filter((p) => s.teams[p] === 're')
    expect(re.length === 2 || s.contract.type === 'silent').toBe(true)

    const wedding = setup()
    const hands = { ...wedding.hands, a: cards('QC QC:1 9D 10D AS KS 9S AH KH 9H JC JS') }
    let w: DoppelkopfState = {
      ...wedding,
      hands,
      turn: order[(order.indexOf(wedding.dealer) + 1) % 4]!,
    }
    for (let i = 0; i < 4; i++) w = apply(w, [w.turn, { type: 'healthy' }])
    expect(w.contract).toEqual({ type: 'silent', player: 'a' })
    expect(rules.playerView(w, 'b').contract).toEqual({ type: 'normal' })
  })

  it('makes a soloist play alone and lead', () => {
    const s = setup()
    const first = s.turn
    const solo = apply(s, [first, { type: 'solo', kind: 'queens' }])
    expect(solo.contract).toEqual({ type: 'solo', kind: 'queens', player: first })
    expect(solo.turn).toBe(first)
    expect(order.filter((p) => solo.teams[p] === 're')).toEqual([first])
  })
})

describe('announcements and targets', () => {
  it('needs 121 for Re and 120 for Kontra; absagen change the targets', () => {
    expect(target('re', { re: null, kontra: null })).toBe(121)
    expect(target('kontra', { re: null, kontra: null })).toBe(120)
    expect(target('kontra', { re: null, kontra: 0 })).toBe(121)
    expect(target('re', { re: 1, kontra: null })).toBe(151)
    expect(target('kontra', { re: 1, kontra: null })).toBe(90)
    expect(target('kontra', { re: 4, kontra: null })).toBe('oneTrick')
  })

  it('allows announcing only while holding enough cards', () => {
    const s = playing({
      a:
        cards('QC')
          .map((c) => c.id)
          .join(' ') + ' 9D 10D AS KS 9S AH KH 9H JC JS',
      b: '9C',
      c: '9C:1',
      d: 'KC',
    })
    expect(rules.legalActions(s, 'a')).toContainEqual({ type: 'announce', level: 0 })
    const late = { ...s, hands: { ...s.hands, a: cards('QC 9D') } }
    expect(rules.legalActions(late, 'a').some((x) => x.type === 'announce')).toBe(false)
  })
})

describe('scoring', () => {
  /** One trick decides; earlier points are given via `tricks`. */
  function finish(extra: Partial<DoppelkopfState>, last = 'AS 9S KS 10S') {
    const [a, b, c, d] = last.split(' ')
    return apply(
      playing({ a: a!, b: b!, c: c!, d: d! }, extra),
      ['a', play(a!)],
      ['b', play(b!)],
      ['c', play(c!)],
      ['d', play(d!)],
    )
  }
  const pts = (player: string, codes: string) => ({
    cards: t(codes).map((x) => ({ ...x, player })),
    winner: player,
  })

  it('scores a normal win for Re: 1 plus the loser’s missing 90 and 60', () => {
    // a wins the last trick (11 + 0 + 4 + 10 = 25); Re gets 25 + 98 = 123, Kontra 36.
    const s = finish({
      tricks: [
        pts('c', 'AH AH:1 AC AC:1 10C 10C:1 KC KC:1 QS 10H 10H:1 QH'),
        pts('b', 'AD AD:1 10D KH'),
      ],
    })
    const r = s.results[0]!
    expect(r.points).toEqual({ re: 123, kontra: 36 })
    expect(r.items).toEqual(['Gewonnen', 'keine 90', 'keine 60'])
    expect(r.winner).toBe('re')
    // Plus one extra point: the earlier trick has 40 or more points ("Doppelkopf").
    expect(r.extras).toEqual([{ party: 're', kind: 'doppelkopf' }])
    expect(r.delta).toEqual({ a: 4, b: -4, c: 4, d: -4 })
  })

  it('gives Kontra an extra point for beating the Alten and counts Re announced', () => {
    const s = finish({
      announcements: { re: 0, kontra: null },
      tricks: [pts('b', 'AH AH:1 AC AC:1 10C 10C:1 KC KC:1 QS 10D 10D:1 KD 10H 10H:1 AD')],
    })
    const r = s.results[0]!
    expect(r.winner).toBe('kontra')
    expect(r.items).toEqual(expect.arrayContaining(['Gewonnen', 'Gegen die Alten', 'Re angesagt']))
  })

  it('multiplies by three for the soloist', () => {
    const s = finish({
      contract: { type: 'solo', kind: 'queens', player: 'a' },
      teams: { a: 're', b: 'kontra', c: 'kontra', d: 'kontra' },
      tricks: [pts('a', 'AH AH:1 AC AC:1 10C 10C:1 KC KC:1 10H 10H:1 AD')],
    })
    const r = s.results[0]!
    expect(r.winner).toBe('re')
    const value = r.items.length
    expect(r.delta['a']).toBe(3 * value)
    expect(r.delta['b']).toBe(-value)
  })

  it('awards a caught fox and a Karlchen in the last trick', () => {
    // Kontra's d played the fox, Re's a wins the trick with the club jack… in the last trick.
    const s = finish({}, 'JC 9S 9D AD')
    const kinds = s.results[0]!.extras.map((e) => `${e.party}:${e.kind}`)
    expect(kinds).toEqual(expect.arrayContaining(['re:fuchs', 're:karlchen']))
  })
})

describe('AI', () => {
  it('plays whole games with all levels, with and without nines', async () => {
    const levels = ['beginner', 'intermediate', 'expert', 'intermediate'] as const
    for (let seed = 0; seed < 16; seed++) {
      const ps = players.map((p) => ({ ...p, kind: 'ai' as const }))
      const { session } = await simulateGame(doppelkopfGame, {
        players: ps,
        agents: Object.fromEntries(ps.map((p, i) => [p.id, createDoppelkopfAgent(levels[i]!)])),
        options: { ...DEFAULT_DOPPELKOPF_OPTIONS, games: 4, nines: seed % 2 === 0 },
        seed,
      })
      const s = session.state
      expect(s.phase).toBe('over')
      for (const r of s.results) {
        expect(r.points.re + r.points.kontra).toBe(s.options.nines ? 240 : 240)
        expect(Object.values(r.delta).reduce((a, b) => a + b, 0)).toBe(0)
      }
    }
  })
})

describe('rule sets and variants', () => {
  it('has the DDV rules by default and presets for house and beginner rules', () => {
    expect(DEFAULT_DOPPELKOPF_OPTIONS).toMatchObject({ ruleset: 'ddv', ...RULESETS.ddv })
    expect(RULESETS.haus).toMatchObject({ secondDulle: true, pigs: true, bock: true })
    expect(RULESETS.einsteiger).toMatchObject({ soli: false, extras: false, wedding: false })
  })

  it('second Dulle beats the first – except in the last trick', () => {
    expect(trickWinner(t('10H KC 10H:1 9D'), normal)).toBe('a')
    expect(trickWinner(t('10H KC 10H:1 9D'), normal, true)).toBe('c')
    const s = playing(
      { a: '10H 9S', b: 'KC 9S:1', c: '10H:1 KS', d: '9D KS:1' },
      { options: { ...DEFAULT_DOPPELKOPF_OPTIONS, secondDulle: true } },
    )
    const first = apply(
      s,
      ['a', play('10H')],
      ['b', play('KC')],
      ['c', play('10H:1')],
      ['d', play('9D')],
    )
    expect(first.tricks[0]!.winner).toBe('c')
    const last = playing(
      { a: '10H', b: 'KC', c: '10H:1', d: '9D' },
      { options: { ...DEFAULT_DOPPELKOPF_OPTIONS, secondDulle: true } },
    )
    const end = apply(
      last,
      ['a', play('10H')],
      ['b', play('KC')],
      ['c', play('10H:1')],
      ['d', play('9D')],
    )
    expect(end.results.at(-1)!.points.re).toBeGreaterThan(0)
  })

  it('Schweinchen: both diamond aces in one hand are the highest trumps', () => {
    const pigs: Contract = { type: 'normal', pigs: 'a' }
    expect(trickWinner(t('AD 10H QC AD:1'), pigs)).toBe('a')
    expect(sortHand(cards('10H AD QC'), pigs).map((c) => c.id)).toEqual(['AD', '10H', 'QC'])
  })

  /** a holds both club queens; everybody else is healthy. */
  function wedding(options = {}) {
    const s = setup({ soli: true, wedding: true, ...options })
    const deal: Record<string, string> = {
      a: 'QC QC:1 AS KS 9S 9H KH AC 9C KC 10C JS',
      b: 'AS:1 KS:1 9S:1 AH 9H:1 KH:1 AC:1 9C:1 10C:1 KC:1 JS:1 QS',
      c: '10H 10H:1 QS:1 QH QH:1 QD QD:1 JC JC:1 JH JH:1 JD',
      d: 'JD:1 AD AD:1 10D 10D:1 KD KD:1 9D 9D:1 10S 10S:1 AH:1',
    }
    return {
      ...s,
      dealer: 'd',
      turn: 'a',
      hands: Object.fromEntries(order.map((p) => [p, cards(deal[p]!)])),
    } as DoppelkopfState
  }

  it('wedding: the first trick won by another player makes the partner', () => {
    let s = apply(
      wedding(),
      ['a', { type: 'wedding' }],
      ['b', { type: 'healthy' }],
      ['c', { type: 'healthy' }],
      ['d', { type: 'healthy' }],
    )
    expect(s.contract).toMatchObject({ type: 'wedding', player: 'a', partner: null })
    // No announcements before the partner is known.
    expect(rules.legalActions(s, 'a').some((x) => x.type === 'announce')).toBe(false)
    // a leads a plain ace; c trumps it with a Dulle and becomes a's partner.
    s = apply(s, ['a', play('AS')], ['b', play('9S:1')], ['c', play('10H')], ['d', play('10S')])
    expect(s.contract).toMatchObject({ partner: 'c', clarified: 1 })
    expect(s.teams).toMatchObject({ a: 're', c: 're', b: 'kontra', d: 'kontra' })
  })

  it('wedding: a later solo beats it', () => {
    const s = apply(wedding(), ['a', { type: 'wedding' }], ['b', { type: 'solo', kind: 'jacks' }])
    expect(s.contract).toMatchObject({ type: 'solo', player: 'b' })
  })

  it('without solos only the bride is asked', () => {
    const s = setup({ soli: false, wedding: true })
    const bride = order.find(
      (p) => s.hands[p]!.filter((c) => c.rank === 'Q' && c.suit === 'clubs').length === 2,
    )
    if (bride) expect(s).toMatchObject({ phase: 'reservation', turn: bride })
    else expect(s.phase).toBe('playing')
  })

  it('bock: a lost announcement doubles the next four games', async () => {
    const { session } = await simulateGame(doppelkopfGame, {
      players: players.map((p) => ({ ...p, kind: 'ai' as const })),
      agents: Object.fromEntries(order.map((p) => [p, createDoppelkopfAgent('intermediate')])),
      options: { ...DEFAULT_DOPPELKOPF_OPTIONS, ...RULESETS.haus, ruleset: 'haus', games: 12 },
      seed: 3,
    })
    const results = (session.state as DoppelkopfState).results
    expect(results.some((r) => r.bock)).toBe(true)
    // Every bock game follows a game that started bock (within four games).
    results.forEach((r, i) => {
      if (r.bock) expect(results.slice(Math.max(0, i - 4), i).some((x) => x.bockStarted)).toBe(true)
      if (r.bock && r.winner) expect(r.items).toContain('Bock: doppelt')
    })
  })
})
