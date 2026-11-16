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

export type Ruleset = 'ddv' | 'haus' | 'einsteiger' | 'eigene'

export interface DoppelkopfOptions {
  /** A preset of the switches below ("eigene": changed by hand). */
  readonly ruleset: Ruleset
  /** 48 cards with nines (12 each) or 40 without (10 each). */
  readonly nines: boolean
  readonly soli: boolean
  /** Fuchs, Doppelkopf and Karlchen. */
  readonly extras: boolean
  readonly games: 4 | 8 | 12
  /** Both club queens may announce a wedding: the first trick won by another player decides the partner. */
  readonly wedding: boolean
  /** The second heart ten beats the first (except in the last trick). */
  readonly secondDulle: boolean
  /** Both diamond aces in one hand are the highest trumps ("Schweinchen"). */
  readonly pigs: boolean
  /** 120:120 or a lost announcement starts a round of four doubled games. */
  readonly bock: boolean
}

type RuleSwitches = Pick<
  DoppelkopfOptions,
  'nines' | 'soli' | 'extras' | 'wedding' | 'secondDulle' | 'pigs' | 'bock'
>

/** The switches of each rule set. */
export const RULESETS: Readonly<Record<Exclude<Ruleset, 'eigene'>, RuleSwitches>> = {
  ddv: {
    nines: true,
    soli: true,
    extras: true,
    wedding: true,
    secondDulle: false,
    pigs: false,
    bock: false,
  },
  haus: {
    nines: true,
    soli: true,
    extras: true,
    wedding: true,
    secondDulle: true,
    pigs: true,
    bock: true,
  },
  einsteiger: {
    nines: true,
    soli: false,
    extras: false,
    wedding: false,
    secondDulle: false,
    pigs: false,
    bock: false,
  },
}

export const DEFAULT_DOPPELKOPF_OPTIONS: DoppelkopfOptions = {
  ruleset: 'ddv',
  ...RULESETS.ddv,
  games: 8,
}

export type SoloKind = 'queens' | 'jacks' | 'fleischlos' | Suit

export type Contract = (
  | { readonly type: 'normal' }
  /** One player holds both club queens and plays alone without telling ("stille Hochzeit"). */
  | { readonly type: 'silent'; readonly player: PlayerId }
  /**
   * Announced wedding: the first of the first three tricks won by another player makes that
   * player the partner (`clarified`: tricks played until then). Nobody: the bride plays alone.
   */
  | {
      readonly type: 'wedding'
      readonly player: PlayerId
      readonly partner: PlayerId | null
      readonly clarified: number | null
    }
  | { readonly type: 'solo'; readonly kind: SoloKind; readonly player: PlayerId }
) & {
  /** Schweinchen: whoever holds both diamond aces; they are the highest trumps. */
  readonly pigs?: PlayerId
}

export type Party = 're' | 'kontra'

/** 0 = Re/Kontra, 1 = keine 90, 2 = keine 60, 3 = keine 30, 4 = schwarz. */
export type AnnouncementLevel = 0 | 1 | 2 | 3 | 4

export type DoppelkopfAction =
  | { readonly type: 'healthy' }
  | { readonly type: 'wedding' }
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
  /** A bock game (doubled). */
  readonly bock: boolean
  /** This game started a bock round. */
  readonly bockStarted: boolean
}

export type DoppelkopfEvent =
  | { readonly type: 'healthy'; readonly player: PlayerId }
  | { readonly type: 'solo'; readonly player: PlayerId; readonly kind: SoloKind }
  | { readonly type: 'wedding'; readonly player: PlayerId }
  /** The wedding is decided: `partner` joins the bride (null: she plays alone). */
  | { readonly type: 'partner'; readonly bride: PlayerId; readonly partner: PlayerId | null }
  | { readonly type: 'pigs'; readonly player: PlayerId }
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
  /** A wedding announced in the reservation (a later solo still beats it). */
  readonly pendingWedding: PlayerId | null
  /** Bock games still to come (the current one included). */
  readonly bock: number
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
  /** Bock games still to come (the current one included). */
  readonly bock: number
  /** I hold both club queens and may announce a wedding. */
  readonly canWed: boolean
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
export const isFox = (c: SuitedCard) => c.rank === 'A' && c.suit === 'diamonds'

/** The trump suit of a game: diamonds normally, the chosen suit in a suit solo, none otherwise. */
export function trumpSuit(contract: Contract): Suit | null {
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
  if (contract.pigs && isFox(c)) return 110
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

/**
 * Highest card wins; of two equal cards the first one played – with `secondDulle` the second
 * heart ten beats the first (callers pass false for the last trick, see `secondDulleNow`).
 */
export function trickWinner(
  trick: readonly TrickCard[],
  contract: Contract,
  secondDulle = false,
): PlayerId {
  const led = suitOf(trick[0]!.card, contract)
  return trick.reduce((best, t) => {
    const p = power(t.card, contract, led)
    const b = power(best.card, contract, led)
    if (p > b) return t
    const dullen = isDulle(t.card) && isDulle(best.card) && trumpRank(t.card, contract) >= 0
    return secondDulle && p === b && dullen ? t : best
  }).player
}

/** Whether the second Dulle beats the first in this trick (never in the last one). */
export const secondDulleNow = (options: DoppelkopfOptions, cardsInHand: number) =>
  Boolean(options.secondDulle) && cardsInHand > 1

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

export const RULESET_NAME: Readonly<Record<Ruleset, string>> = {
  ddv: 'Turnier (DDV)',
  haus: 'Hausregeln',
  einsteiger: 'Einsteiger',
  eigene: 'Eigene Regeln',
}

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
  const dealt: DoppelkopfState = {
    ...state,
    dealer,
    hands,
    phase: 'reservation',
    contract: normal,
    teams: {},
    revealed: [],
    announcements: { re: null, kontra: null },
    turn: first,
    trick: [],
    tricks: [],
    gameNumber: number,
    pendingWedding: null,
    rng: rng.state,
  }
  if (state.options.soli) return dealt
  // Without solos only a possible wedding needs asking – and only its holder.
  const bride = state.options.wedding ? weddingHolder(dealt) : null
  if (bride) return { ...dealt, turn: bride }
  return startPlay(dealt, null)
}

/** The player holding both club queens, if any. */
const weddingHolder = (state: DoppelkopfState) =>
  state.order.find((p) => state.hands[p]!.filter(isClubQueen).length === 2) ?? null

/** Schweinchen: with the option, in games with diamond trumps, whoever holds both diamond aces. */
function withPigs(state: DoppelkopfState, contract: Contract): Contract {
  if (!state.options.pigs || trumpSuit(contract) !== 'diamonds') return contract
  if (contract.type === 'solo' && contract.kind !== 'diamonds') return contract
  const holder = state.order.find((p) => state.hands[p]!.filter(isFox).length === 2)
  return holder ? { ...contract, pigs: holder } : contract
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

function startPlay(state: DoppelkopfState, chosen: Contract | null): DoppelkopfState {
  const first = nextPlayer(state.order, state.dealer)
  let next: DoppelkopfState
  if (chosen?.type === 'solo') {
    next = {
      ...state,
      contract: chosen,
      teams: Object.fromEntries(state.order.map((p) => [p, p === chosen.player ? 're' : 'kontra'])),
      revealed: [...state.order],
      phase: 'playing',
      // The soloist leads.
      turn: chosen.player,
    }
  } else if (chosen?.type === 'wedding') {
    next = {
      ...state,
      contract: chosen,
      // Provisional until the partner is found.
      teams: Object.fromEntries(state.order.map((p) => [p, p === chosen.player ? 're' : 'kontra'])),
      revealed: [chosen.player],
      phase: 'playing',
      turn: first,
    }
  } else {
    next = { ...state, ...setupNormal(state.order, state.hands), phase: 'playing', turn: first }
  }
  const contract = withPigs(next, next.contract)
  const hands = Object.fromEntries(state.order.map((p) => [p, sortHand(state.hands[p]!, contract)]))
  const events: DoppelkopfEvent[] = contract.pigs
    ? [...next.events, { type: 'pigs', player: contract.pigs }]
    : [...next.events]
  return { ...next, contract, hands, events }
}

/** After a trick in an open wedding: the first trick won by another player finds the partner. */
function clarifyWedding(state: DoppelkopfState, winner: PlayerId): DoppelkopfState {
  const c = state.contract
  if (c.type !== 'wedding' || c.clarified !== null) return state
  const played = state.tricks.length
  if (winner !== c.player) {
    return {
      ...state,
      contract: { ...c, partner: winner, clarified: played },
      teams: { ...state.teams, [winner]: 're' },
      revealed: [...state.order],
      events: [...state.events, { type: 'partner', bride: c.player, partner: winner }],
    }
  }
  if (played < 3) return state
  // Three tricks alone: the bride plays alone against the other three.
  return {
    ...state,
    contract: { ...c, clarified: played },
    revealed: [...state.order],
    events: [...state.events, { type: 'partner', bride: c.player, partner: null }],
  }
}

function nextGame(state: DoppelkopfState, result: DoppelkopfResult): DoppelkopfState {
  const scores = Object.fromEntries(
    state.order.map((p) => [p, state.scores[p]! + (result.delta[p] ?? 0)]),
  )
  let finished: DoppelkopfState = {
    ...state,
    scores,
    results: [...state.results, result],
    events: [...state.events, { type: 'game', result }],
  }
  if (state.gameNumber >= state.options.games) return { ...finished, phase: 'over' }
  // Bock: this game used one, a trigger adds a round of four.
  const bock = Math.max(0, (state.bock ?? 0) - (result.bock ? 1 : 0)) + (result.bockStarted ? 4 : 0)
  finished = { ...finished, bock }
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
  // A wedding with a partner counts like a normal game; alone, like a solo.
  const normalLike = c.type === 'normal' || (c.type === 'wedding' && c.partner !== null)
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
    if (winner === 'kontra' && normalLike) {
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
  // Extra points only in normal games (Schweinchen cannot be caught as a fox).
  const extras: ExtraPoint[] = []
  if (state.options.extras && normalLike) {
    state.tricks.forEach((t, i) => {
      const party = state.teams[t.winner]!
      for (const { player, card } of t.cards) {
        if (isFox(card) && !c.pigs && state.teams[player] !== party)
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
  const bock = state.options.bock && (state.bock ?? 0) > 0
  if (bock && winner) items.push('Bock: doppelt')
  const reScore =
    ((winner === 're' ? value : winner === 'kontra' ? -value : 0) + extraNet) * (bock ? 2 : 1)
  const alone = !normalLike
  const delta: Record<PlayerId, number> = {}
  for (const p of state.order) {
    if (state.teams[p] === 're') delta[p] = alone ? 3 * reScore : reScore
    else delta[p] = -reScore
  }
  // A new bock round: 120:120, or a party lost after announcing.
  const lostAnnouncement = parties.some((p) => state.announcements[p] !== null && winner !== p)
  const bockStarted =
    state.options.bock && ((points.re === 120 && points.kontra === 120) || lostAnnouncement)
  return nextGame(state, {
    number: state.gameNumber,
    contract: c,
    teams: state.teams,
    points,
    winner,
    items,
    extras,
    delta,
    bock,
    bockStarted,
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
  // In a wedding the deadlines start once the partner is known.
  const c = state.contract
  if (c.type === 'wedding' && c.clarified === null) return null
  const shift = c.type === 'wedding' ? c.clarified! : 0
  return state.hands[player]!.length >= announceDeadline(level, state.options) - shift
    ? level
    : null
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
      key: 'ruleset',
      label: 'Regelwerk',
      description:
        'Stellt die Regeln unten auf einmal ein. Änderst du einen Schalter, gelten eigene Regeln.',
      choices: [
        { value: 'ddv', label: 'Turnier (DDV)' },
        { value: 'haus', label: 'Hausregeln' },
        { value: 'einsteiger', label: 'Einsteiger' },
        { value: 'eigene', label: 'Eigene' },
      ],
      presets: RULESETS,
    },
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
    {
      type: 'boolean',
      key: 'wedding',
      label: 'Hochzeit',
      description:
        'Wer beide Kreuz-Damen hat, darf Hochzeit ansagen: Wer zuerst einen der ersten drei Stiche gewinnt, wird Partner. Sonst spielt sie allein.',
    },
    {
      type: 'boolean',
      key: 'secondDulle',
      label: 'Zweite Dulle sticht die erste',
      description:
        'Fallen beide Herz-Zehnen in einen Stich, gewinnt die zweite – außer im letzten Stich.',
    },
    {
      type: 'boolean',
      key: 'pigs',
      label: 'Schweinchen',
      description:
        'Hat jemand beide Karo-Asse, sind sie die höchsten Trümpfe (auch im Karo-Solo). Sie zählen nicht als Fuchs.',
    },
    {
      type: 'boolean',
      key: 'bock',
      label: 'Bockrunden',
      description:
        'Nach 120:120 oder einer verlorenen Ansage zählen die nächsten vier Spiele doppelt.',
    },
  ],

  setup({ players, options, seed }) {
    const order = players.map((p) => p.id)
    const rng = Rng.fromSeed(seed)
    const dealer = order[rng.int(4)]!
    const base = {
      order,
      scores: Object.fromEntries(order.map((p) => [p, 0])),
      bock: 0,
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
      const wed = state.options.wedding && state.hands[player]!.filter(isClubQueen).length === 2
      return [
        { type: 'healthy' },
        ...(wed ? [{ type: 'wedding' as const }] : []),
        ...(state.options.soli ? SOLOS.map((kind) => ({ type: 'solo' as const, kind })) : []),
      ]
    }
    const level = canAnnounce(state, player)
    return [
      ...playableCards(state, player).map((c) => ({ type: 'play' as const, cardId: c.id })),
      ...(level !== null ? [{ type: 'announce' as const, level }] : []),
    ]
  },

  applyAction(state, player, action) {
    switch (action.type) {
      case 'healthy':
      case 'wedding': {
        const events: DoppelkopfEvent[] = [{ type: action.type, player }]
        const pending = action.type === 'wedding' ? player : state.pendingWedding
        const next = nextPlayer(state.order, player)
        // Everybody has spoken once it is the first player's turn again (without solos only the
        // holder of the club queens is asked).
        const done = !state.options.soli || next === nextPlayer(state.order, state.dealer)
        if (!done) return { ...state, pendingWedding: pending, turn: next, events }
        const contract: Contract | null = pending
          ? { type: 'wedding', player: pending, partner: null, clarified: null }
          : null
        return startPlay({ ...state, pendingWedding: pending, events }, contract)
      }
      case 'solo':
        return startPlay(
          { ...state, events: [{ type: 'solo', player, kind: action.kind }] },
          { type: 'solo', kind: action.kind, player },
        )
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
        const winner = trickWinner(
          trick,
          state.contract,
          secondDulleNow(state.options, hand.length),
        )
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
        const clarified = clarifyWedding(next, winner)
        return hands[player]!.length === 0 ? scoreGame(clarified) : clarified
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
    // An undecided wedding: only the bride is known.
    if (c.type === 'wedding' && c.clarified === null)
      for (const p of state.order) if (p !== c.player) delete knownParties[p]
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
      bock: state.options.bock ? state.bock : 0,
      canWed:
        state.phase === 'reservation' &&
        Boolean(state.options.wedding) &&
        (state.hands[player] ?? []).filter(isClubQueen).length === 2,
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
          : action.type,
})
