/**
 * Doppelkopf for four players with 48 cards (or 40 without nines). Re (the holders of the club
 * queens) plays against Kontra; solos, announcements and extra points follow the common DDV
 * rules in a simplified form. Pure and deterministic; see `DoppelkopfRules.tsx`.
 */
import {
  type CardId,
  createDeck,
  defineGame,
  type GameResult,
  nextPlayer,
  type PlayerId,
  type Rank,
  Rng,
  type RngState,
  type Suit,
  type SuitedCard,
} from '@/engine'

export interface DoppelkopfOptions {
  /** 48 cards with nines (12 each) or 40 without (10 each). */
  readonly nines: boolean
  readonly soli: boolean
  /** Fuchs, Doppelkopf and Karlchen. */
  readonly extras: boolean
  readonly games: 4 | 8 | 12
}

export const DEFAULT_DOPPELKOPF_OPTIONS: DoppelkopfOptions = {
  nines: true,
  soli: true,
  extras: true,
  games: 8,
}

export type SoloKind = 'queens' | 'jacks' | 'fleischlos' | Suit

export type Contract =
  | { readonly type: 'normal' }
  /** One player holds both club queens and plays alone without telling ("stille Hochzeit"). */
  | { readonly type: 'silent'; readonly player: PlayerId }
  | { readonly type: 'solo'; readonly kind: SoloKind; readonly player: PlayerId }

export type Party = 're' | 'kontra'

/** 0 = Re/Kontra, 1 = keine 90, 2 = keine 60, 3 = keine 30, 4 = schwarz. */
export type AnnouncementLevel = 0 | 1 | 2 | 3 | 4

export type DoppelkopfAction =
  | { readonly type: 'healthy' }
  | { readonly type: 'solo'; readonly kind: SoloKind }
  | { readonly type: 'announce'; readonly level: AnnouncementLevel }
  | { readonly type: 'play'; readonly cardId: CardId }

export interface TrickCard {
  readonly player: PlayerId
  readonly card: SuitedCard
}

export interface Trick {
  readonly cards: readonly TrickCard[]
  readonly winner: PlayerId
}

export interface ExtraPoint {
  readonly party: Party
  readonly kind: 'fuchs' | 'doppelkopf' | 'karlchen'
}

export interface DoppelkopfResult {
  readonly number: number
  readonly contract: Contract
  readonly teams: Readonly<Record<PlayerId, Party>>
  readonly points: Readonly<Record<Party, number>>
  readonly winner: Party | null
  /** Itemised game points of the winning party (before extras). */
  readonly items: readonly string[]
  readonly extras: readonly ExtraPoint[]
  readonly delta: Readonly<Record<PlayerId, number>>
}

export type DoppelkopfEvent =
  | { readonly type: 'healthy'; readonly player: PlayerId }
  | { readonly type: 'solo'; readonly player: PlayerId; readonly kind: SoloKind }
  | {
      readonly type: 'announced'
      readonly player: PlayerId
      readonly party: Party
      readonly level: AnnouncementLevel
    }
  | { readonly type: 'played'; readonly player: PlayerId; readonly card: SuitedCard }
  | { readonly type: 'trick'; readonly winner: PlayerId; readonly points: number }
  | { readonly type: 'game'; readonly result: DoppelkopfResult }

export interface DoppelkopfState {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hands: Readonly<Record<PlayerId, readonly SuitedCard[]>>
  readonly phase: 'reservation' | 'playing' | 'over'
  readonly contract: Contract
  readonly teams: Readonly<Record<PlayerId, Party>>
  /** Players whose party everybody knows (announced, or played a club queen). */
  readonly revealed: readonly PlayerId[]
  readonly announcements: Readonly<Record<Party, AnnouncementLevel | null>>
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly tricks: readonly Trick[]
  readonly gameNumber: number
  readonly scores: Readonly<Record<PlayerId, number>>
  readonly results: readonly DoppelkopfResult[]
  readonly events: readonly DoppelkopfEvent[]
  readonly options: DoppelkopfOptions
  readonly rng: RngState
}

export interface DoppelkopfView {
  readonly order: readonly PlayerId[]
  readonly dealer: PlayerId
  readonly hand: readonly SuitedCard[]
  readonly handSizes: Readonly<Record<PlayerId, number>>
  readonly phase: DoppelkopfState['phase']
  /** Solos are public; a silent wedding looks like a normal game to the others. */
  readonly contract: Contract
  readonly myParty: Party
  /** Parties everybody knows by now. */
  readonly knownParties: Readonly<Record<PlayerId, Party | undefined>>
  readonly announcements: DoppelkopfState['announcements']
  readonly turn: PlayerId
  readonly trick: readonly TrickCard[]
  readonly lastTrick: Trick | null
  readonly tricksWon: Readonly<Record<PlayerId, number>>
  /** Card points of your own party so far. */
  readonly myPoints: number
  readonly played: readonly SuitedCard[]
  readonly gameNumber: number
  readonly scores: DoppelkopfState['scores']
  readonly results: readonly DoppelkopfResult[]
  readonly events: readonly DoppelkopfEvent[]
  readonly options: DoppelkopfOptions
}

// --- Cards -------------------------------------------------------------------------------------

const VALUES: Readonly<Partial<Record<Rank, number>>> = { A: 11, '10': 10, K: 4, Q: 3, J: 2 }
export const cardPoints = (c: SuitedCard) => VALUES[c.rank] ?? 0
export const sumPoints = (cards: readonly SuitedCard[]) =>
  cards.reduce((s, c) => s + cardPoints(c), 0)

const PICTURE_SUITS: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds']
const isDulle = (c: SuitedCard) => c.rank === '10' && c.suit === 'hearts'
export const isClubQueen = (c: SuitedCard) => c.rank === 'Q' && c.suit === 'clubs'

/** The trump suit of a game: diamonds normally, the chosen suit in a suit solo, none otherwise. */
function trumpSuit(contract: Contract): Suit | null {
  if (contract.type !== 'solo') return 'diamonds'
  const k = contract.kind
  return k === 'queens' || k === 'jacks' || k === 'fleischlos' ? null : k
}

/** Trump strength (higher is better) or −1 for a plain card. */
export function trumpRank(c: SuitedCard, contract: Contract): number {
  const kind = contract.type === 'solo' ? contract.kind : null
  if (kind === 'fleischlos') return -1
  if (kind === 'queens') return c.rank === 'Q' ? 10 + (3 - PICTURE_SUITS.indexOf(c.suit)) : -1
  if (kind === 'jacks') return c.rank === 'J' ? 10 + (3 - PICTURE_SUITS.indexOf(c.suit)) : -1
  if (isDulle(c)) return 100
  if (c.rank === 'Q') return 90 + (3 - PICTURE_SUITS.indexOf(c.suit))
  if (c.rank === 'J') return 80 + (3 - PICTURE_SUITS.indexOf(c.suit))
  const suit = trumpSuit(contract)
  if (c.suit === suit) return 50 + ['9', 'K', '10', 'A'].indexOf(c.rank)
  return -1
}

/** Plain cards in order of strength (low to high) for a game. */
function plainOrder(contract: Contract): readonly Rank[] {
  const kind = contract.type === 'solo' ? contract.kind : null
  if (kind === 'fleischlos') return ['9', 'J', 'Q', 'K', '10', 'A']
  if (kind === 'queens') return ['9', 'J', 'K', '10', 'A']
  if (kind === 'jacks') return ['9', 'Q', 'K', '10', 'A']
  return ['9', 'K', '10', 'A']
}

export const isTrump = (c: SuitedCard, contract: Contract) => trumpRank(c, contract) >= 0
export const suitOf = (c: SuitedCard, contract: Contract): Suit | 'trump' =>
  isTrump(c, contract) ? 'trump' : c.suit

function power(c: SuitedCard, contract: Contract, led: Suit | 'trump'): number {
  const t = trumpRank(c, contract)
  if (t >= 0) return 1000 + t
  return c.suit === led ? plainOrder(contract).indexOf(c.rank) : -1
}

/** Highest card wins; of two equal cards the first one played. */
export function trickWinner(trick: readonly TrickCard[], contract: Contract): PlayerId {
  const led = suitOf(trick[0]!.card, contract)
  return trick.reduce((best, t) =>
    power(t.card, contract, led) > power(best.card, contract, led) ? t : best,
  ).player
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 }

/** Trumps first (strongest first), then the plain suits. */
export function sortHand(cards: readonly SuitedCard[], contract: Contract) {
  const key = (c: SuitedCard) => {
    const t = trumpRank(c, contract)
    if (t >= 0) return -t
    return SUIT_ORDER[c.suit] * 10 - plainOrder(contract).indexOf(c.rank)
  }
  return [...cards].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id))
}

export function playableCards(state: DoppelkopfState, player: PlayerId): SuitedCard[] {
  if (state.phase !== 'playing' || state.turn !== player) return []
  const hand = state.hands[player]!
  if (state.trick.length === 0) return [...hand]
  const led = suitOf(state.trick[0]!.card, state.contract)
  const follow = hand.filter((c) => suitOf(c, state.contract) === led)
  return follow.length > 0 ? follow : [...hand]
}

export const handSize = (options: DoppelkopfOptions) => (options.nines ? 12 : 10)

/** Cards a player must still hold to make an announcement of `level`. */
export const announceDeadline = (level: AnnouncementLevel, options: DoppelkopfOptions) =>
  handSize(options) - 1 - level

export const soloName = (kind: SoloKind) =>
  ({
    queens: 'Damensolo',
    jacks: 'Bubensolo',
    fleischlos: 'Fleischloser',
    clubs: 'Kreuz-Solo',
    spades: 'Pik-Solo',
    hearts: 'Herz-Solo',
    diamonds: 'Karo-Solo',
  })[kind]

export const LEVEL_NAME: Readonly<Record<AnnouncementLevel, string>> = {
  0: '',
  1: 'keine 90',
  2: 'keine 60',
  3: 'keine 30',
  4: 'schwarz',
}

// --- Flow --------------------------------------------------------------------------------------

function startGame(state: DoppelkopfState, number: number, dealer: PlayerId): DoppelkopfState {
  const rng = new Rng(state.rng)
  const ranks: Rank[] = state.options.nines
    ? ['9', '10', 'J', 'Q', 'K', 'A']
    : ['10', 'J', 'Q', 'K', 'A']
  const deck = rng.shuffle(createDeck({ ranks, copies: 2 })) as SuitedCard[]
  const size = handSize(state.options)
  const normal: Contract = { type: 'normal' }
  const hands = Object.fromEntries(
    state.order.map((p, i) => [p, sortHand(deck.slice(i * size, (i + 1) * size), normal)]),
  )
  const first = nextPlayer(state.order, dealer)
  return {
    ...state,
    dealer,
    hands,
    phase: state.options.soli ? 'reservation' : 'playing',
    contract: normal,
    teams: {},
    revealed: [],
    announcements: { re: null, kontra: null },
    turn: first,
    trick: [],
    tricks: [],
    gameNumber: number,
    rng: rng.state,
    ...(state.options.soli ? {} : setupNormal(state.order, hands)),
  }
}

/** Parties of a normal game; both club queens in one hand make a silent wedding. */
function setupNormal(order: readonly PlayerId[], hands: Record<PlayerId, readonly SuitedCard[]>) {
  const counts = order.map((p) => hands[p]!.filter(isClubQueen).length)
  const silent = counts.indexOf(2)
  if (silent >= 0) {
    const player = order[silent]!
    return {
      contract: { type: 'silent', player } as Contract,
      teams: Object.fromEntries(order.map((p) => [p, p === player ? 're' : 'kontra'])) as Record<
        PlayerId,
        Party
      >,
    }
  }
  return {
    contract: { type: 'normal' } as Contract,
    teams: Object.fromEntries(
      order.map((p) => [p, hands[p]!.some(isClubQueen) ? 're' : 'kontra']),
    ) as Record<PlayerId, Party>,
  }
}

function startPlay(state: DoppelkopfState, contract: Contract | null): DoppelkopfState {
  const first = nextPlayer(state.order, state.dealer)
  if (contract?.type === 'solo') {
    const hands = Object.fromEntries(
      state.order.map((p) => [p, sortHand(state.hands[p]!, contract)]),
    )
    return {
      ...state,
      hands,
      contract,
      teams: Object.fromEntries(
        state.order.map((p) => [p, p === contract.player ? 're' : 'kontra']),
      ),
      revealed: [...state.order],
      phase: 'playing',
      // The soloist leads.
      turn: contract.player,
    }
  }
  return { ...state, ...setupNormal(state.order, state.hands), phase: 'playing', turn: first }
}

function nextGame(state: DoppelkopfState, result: DoppelkopfResult): DoppelkopfState {
  const scores = Object.fromEntries(
    state.order.map((p) => [p, state.scores[p]! + (result.delta[p] ?? 0)]),
  )
  const finished: DoppelkopfState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'game', result }],
  }
  if (state.gameNumber >= state.options.games) return { ...finished, phase: 'over' }
  const next = startGame(finished, state.gameNumber + 1, nextPlayer(state.order, state.dealer))
  return { ...next, events: finished.events }
}

const COUNTER: readonly number[] = [0, 90, 60, 30]

/** Card points a party needs: its own announcements raise it, the other's lower it. */
export function target(
  party: Party,
  announcements: Readonly<Record<Party, AnnouncementLevel | null>>,
): number | 'all' | 'oneTrick' {
  const own = announcements[party]
  const other = announcements[party === 're' ? 'kontra' : 're']
  if (own !== null && own >= 1) return own === 4 ? 'all' : 241 - COUNTER[own]!
  if (other !== null && other >= 1) return other === 4 ? 'oneTrick' : COUNTER[other]!
  if (party === 're') return 121
  // Kontra wins with 120 – unless only Kontra announced, then it needs 121.
  return own === 0 && announcements.re === null ? 121 : 120
}

function scoreGame(state: DoppelkopfState): DoppelkopfState {
  const c = state.contract
  const parties: Party[] = ['re', 'kontra']
  const won = (party: Party) =>
    state.tricks
      .filter((t) => state.teams[t.winner] === party)
      .flatMap((t) => t.cards.map((x) => x.card))
  const points = { re: sumPoints(won('re')), kontra: sumPoints(won('kontra')) }
  const tricksOf = (party: Party) =>
    state.tricks.filter((t) => state.teams[t.winner] === party).length
  const reaches = (party: Party) => {
    const t = target(party, state.announcements)
    if (t === 'all') return tricksOf(party) === state.tricks.length
    if (t === 'oneTrick') return tricksOf(party) > 0
    return points[party] >= t
  }
  const winner: Party | null = reaches('re') ? 're' : reaches('kontra') ? 'kontra' : null
  const items: string[] = []
  let value = 0
  if (winner) {
    const loser: Party = winner === 're' ? 'kontra' : 're'
    value += 1
    items.push('Gewonnen')
    if (winner === 'kontra' && c.type === 'normal') {
      value += 1
      items.push('Gegen die Alten')
    }
    for (const [limit, label] of [
      [90, 'keine 90'],
      [60, 'keine 60'],
      [30, 'keine 30'],
    ] as const) {
      if (points[loser] < limit) {
        value += 1
        items.push(label)
      }
    }
    if (tricksOf(loser) === 0) {
      value += 1
      items.push('schwarz')
    }
    for (const party of parties) {
      const level = state.announcements[party]
      if (level === null) continue
      value += 2
      items.push(`${party === 're' ? 'Re' : 'Kontra'} angesagt`)
      for (let l = 1; l <= level; l++) {
        value += 1
        items.push(`${LEVEL_NAME[l as AnnouncementLevel]} abgesagt`)
      }
    }
  }
  // Extra points only in normal games.
  const extras: ExtraPoint[] = []
  if (state.options.extras && c.type === 'normal') {
    state.tricks.forEach((t, i) => {
      const party = state.teams[t.winner]!
      for (const { player, card } of t.cards) {
        if (card.rank === 'A' && card.suit === 'diamonds' && state.teams[player] !== party)
          extras.push({ party, kind: 'fuchs' })
      }
      if (sumPoints(t.cards.map((x) => x.card)) >= 40) extras.push({ party, kind: 'doppelkopf' })
      const last = i === state.tricks.length - 1
      const winning = t.cards.find((x) => x.player === t.winner)!.card
      if (last && winning.rank === 'J' && winning.suit === 'clubs')
        extras.push({ party, kind: 'karlchen' })
    })
  }
  const extraNet =
    extras.filter((e) => e.party === 're').length -
    extras.filter((e) => e.party === 'kontra').length
  const reScore = (winner === 're' ? value : winner === 'kontra' ? -value : 0) + extraNet
  const alone = c.type !== 'normal'
  const delta: Record<PlayerId, number> = {}
  for (const p of state.order) {
    if (state.teams[p] === 're') delta[p] = alone ? 3 * reScore : reScore
    else delta[p] = -reScore
  }
  return nextGame(state, {
    number: state.gameNumber,
    contract: c,
    teams: state.teams,
    points,
    winner,
    items,
    extras,
    delta,
  })
}

// --- Game definition ---------------------------------------------------------------------------

const SOLOS: readonly SoloKind[] = [
  'queens',
  'jacks',
  'clubs',
  'spades',
  'hearts',
  'diamonds',
  'fleischlos',
]

function canAnnounce(state: DoppelkopfState, player: PlayerId): AnnouncementLevel | null {
  if (state.phase !== 'playing') return null
  const party = state.teams[player]!
  const current = state.announcements[party]
  const level = (current === null ? 0 : current + 1) as AnnouncementLevel
  if (level > 4) return null
  return state.hands[player]!.length >= announceDeadline(level, state.options) ? level : null
}

export const doppelkopfRules = defineGame<
  DoppelkopfState,
  DoppelkopfAction,
  DoppelkopfOptions,
  DoppelkopfView
>({
  id: 'doppelkopf',
  name: 'Doppelkopf',
  players: { min: 4, max: 4 },
  defaultOptions: DEFAULT_DOPPELKOPF_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'games',
      label: 'Spiele',
      choices: [
        { value: 4, label: '4 Spiele' },
        { value: 8, label: '8 Spiele' },
        { value: 12, label: '12 Spiele' },
      ],
    },
    {
      type: 'boolean',
      key: 'nines',
      label: 'Mit Neunen',
      description: '48 Karten (je 12). Ohne Neunen: 40 Karten (je 10).',
    },
    {
      type: 'boolean',
      key: 'soli',
      label: 'Soli',
      description: 'Vor dem Spiel darf jeder ein Solo ansagen (Damen, Buben, Farbe, Fleischlos).',
    },
    {
      type: 'boolean',
      key: 'extras',
      label: 'Sonderpunkte',
      description: 'Fuchs gefangen, Doppelkopf (Stich mit 40 Augen), Karlchen im letzten Stich.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(4)]!
    const base = {
      order,
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      results: [],
      events: [],
      options,
      rng: rng.state,
    } as unknown as DoppelkopfState
    return startGame(base, 1, dealer)
  },

  currentPlayer: (state) => (state.phase === 'over' ? null : state.turn),

  legalActions(state, player) {
    if (state.phase === 'over' || state.turn !== player) return []
    if (state.phase === 'reservation') {
      return [{ type: 'healthy' }, ...SOLOS.map((kind) => ({ type: 'solo' as const, kind }))]
    }
    const level = canAnnounce(state, player)
    return [
      ...playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id })),
      ...(level !== null ? [{ type: 'announce' as const, level }] : []),
    ]
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'healthy': {
        const next = nextPlayer(state.order, player)
        const events: DoppelkopfEvent[] = [{ type: 'healthy', player }]
        // Everybody is healthy once it is the first player's turn again.
        if (next === nextPlayer(state.order, state.dealer))
          return { ...startPlay(state, null), events }
        return { ...state, turn: next, events }
      }
      case 'solo':
        return {
          ...startPlay(state, { type: 'solo', kind: action.kind, player }),
          events: [{ type: 'solo', player, kind: action.kind }],
        }
      case 'announce': {
        const party = state.teams[player]!
        return {
          ...state,
          announcements: { ...state.announcements, [party]: action.level },
          revealed: state.revealed.includes(player) ? state.revealed : [...state.revealed, player],
          events: [{ type: 'announced', player, party, level: action.level }],
        }
      }
      case 'play': {
        const hand = state.hands[player]!
        const card = hand.find((c) => c.id === action.cardId)!
        const trick = [...state.trick, { player, card }]
        const hands = { ...state.hands, [player]: hand.filter((c) => c !== card) }
        const events: DoppelkopfEvent[] = [{ type: 'played', player, card }]
        // A club queen shows its player is Re (not in a silent wedding until the second one).
        const reveals =
          isClubQueen(card) && state.contract.type === 'normal' && !state.revealed.includes(player)
        const revealed = reveals ? [...state.revealed, player] : state.revealed
        if (trick.length < 4) {
          return { ...state, hands, trick, revealed, events, turn: nextPlayer(state.order, player) }
        }
        const winner = trickWinner(trick, state.contract)
        const next: DoppelkopfState = {
          ...state,
          hands,
          revealed,
          trick: [],
          tricks: [...state.tricks, { cards: trick, winner }],
          turn: winner,
          events: [
            ...events,
            { type: 'trick', winner, points: sumPoints(trick.map((t) => t.card)) },
          ],
        }
        return hands[player]!.length === 0 ? scoreGame(next) : next
      }
    }
  },

  playerView(state, player) {
    const c = state.contract
    // Others see a silent wedding as a normal game.
    const publicContract: Contract =
      c.type === 'silent' && c.player !== player ? { type: 'normal' } : c
    const knownParties: Record<PlayerId, Party | undefined> = {}
    for (const p of state.revealed) knownParties[p] = state.teams[p]
    // Two known Re players in a normal game: the other two are Kontra.
    const knownRe = state.revealed.filter((p) => state.teams[p] === 're')
    if (c.type === 'normal' && knownRe.length === 2)
      for (const p of state.order) knownParties[p] = state.teams[p]
    if (state.phase === 'playing' || state.phase === 'over')
      knownParties[player] = state.teams[player]
    const myParty =
      state.teams[player] ?? (state.hands[player]?.some(isClubQueen) ? 're' : 'kontra')
    const tricksWon = Object.fromEntries(
      state.order.map((p) => [p, state.tricks.filter((t) => t.winner === p).length]),
    )
    const myPoints = state.tricks
      .filter((t) => (state.teams[t.winner] ?? 'kontra') === myParty)
      .reduce((s, t) => s + sumPoints(t.cards.map((x) => x.card)), 0)
    return {
      order: state.order,
      dealer: state.dealer,
      hand: state.hands[player] ?? [],
      handSizes: Object.fromEntries(state.order.map((p) => [p, state.hands[p]?.length ?? 0])),
      phase: state.phase,
      contract: publicContract,
      myParty,
      knownParties,
      announcements: state.announcements,
      turn: state.turn,
      trick: state.trick,
      lastTrick: state.tricks.at(-1) ?? null,
      tricksWon,
      myPoints,
      played: state.tricks
        .flatMap((t) => t.cards.map((x) => x.card))
        .concat(state.trick.map((t) => t.card)),
      gameNumber: state.gameNumber,
      scores: state.scores,
      results: state.results,
      events: state.events,
      options: state.options,
    }
  },

  isTerminal: (state) => state.phase === 'over',

  result(state): GameResult {
    const ranking = [...state.order].sort((a, b) => state.scores[b]! - state.scores[a]!)
    const best = state.scores[ranking[0]!]!
    return {
      scores: state.scores,
      winners: state.order.filter((p) => state.scores[p] === best),
      ranking,
      scoreLabel: 'Punkte',
    }
  },

  describeAction: (action) =>
    action.type === 'play'
      ? `play ${action.cardId}`
      : action.type === 'solo'
        ? `solo ${action.kind}`
        : action.type === 'announce'
          ? `announce ${action.level}`
          : 'healthy',
})
