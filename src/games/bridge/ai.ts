import {
  type AiAgent,
  createDeck,
  type Difficulty,
  type PlayerId,
  type Suit,
  type SuitedCard,
} from '@/engine'
import {
  type AuctionCall,
  type Bid,
  bidRank,
  type BridgeAction,
  type BridgeView,
  type Call,
  highValue,
  lastBid,
  legalCalls,
  partnerOf,
  sideOf,
  type Strain,
  trickWinner,
} from './bridge'

const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
const MAJORS: readonly Suit[] = ['spades', 'hearts']
const FULL_DECK = createDeck('standard52') as SuitedCard[]

// --- Hand evaluation ---------------------------------------------------------------------------

const HCP: Readonly<Record<string, number>> = { A: 4, K: 3, Q: 2, J: 1 }
export const hcp = (hand: readonly SuitedCard[]) => hand.reduce((s, c) => s + (HCP[c.rank] ?? 0), 0)

export const lengths = (hand: readonly SuitedCard[]) =>
  Object.fromEntries(SUITS.map((s) => [s, hand.filter((c) => c.suit === s).length])) as Record<
    Suit,
    number
  >

export function isBalanced(hand: readonly SuitedCard[]) {
  const l = Object.values(lengths(hand)).sort((a, b) => a - b)
  return l[0]! >= 2 && l[1]! >= 3
}

/** High-card points plus a point for every card beyond four in a suit. */
export const totalPoints = (hand: readonly SuitedCard[]) =>
  hcp(hand) + Object.values(lengths(hand)).reduce((s, n) => s + Math.max(0, n - 4), 0)

interface PartnerInfo {
  readonly points: number
  readonly lengths: Partial<Record<Suit, number>>
  readonly balanced: boolean
}

/** What partner's calls have shown, in the spirit of a simple standard system. */
export function partnerInfo(
  auction: readonly AuctionCall[],
  me: PlayerId,
  order: readonly PlayerId[],
): PartnerInfo {
  const partner = partnerOf(order, me)
  const mySide = sideOf(order, me)
  const lens: Partial<Record<Suit, number>> = {}
  let points: number | null = null
  let balanced = false
  for (let i = 0; i < auction.length; i++) {
    const { player, call } = auction[i]!
    if (player !== partner) continue
    const before = auction.slice(0, i)
    const anyBefore = before.some((c) => c.call.type === 'bid')
    const opponentsOpened = before.some(
      (c) => c.call.type === 'bid' && sideOf(order, c.player) !== mySide,
    )
    const iBid = before.some((c) => c.call.type === 'bid' && c.player === me)
    if (call.type === 'pass') {
      if (points === null && !anyBefore) points = 6 // could not open
      continue
    }
    if (call.type !== 'bid') continue
    const isFirst = points === null || points === 6
    if (call.strain === 'notrump') {
      balanced = true
      if (isFirst)
        points = !anyBefore
          ? call.level === 1
            ? 16
            : 20
          : opponentsOpened && !iBid
            ? 16
            : call.level === 1
              ? 8
              : call.level === 2
                ? 11
                : 13
      else points = (points ?? 10) + 2
      continue
    }
    const myEarlier = before.find(
      (c) => c.player === me && c.call.type === 'bid' && c.call.strain === call.strain,
    )
    if (myEarlier) {
      // A raise of our suit shows support.
      lens[call.strain] = Math.max(lens[call.strain] ?? 0, 3)
      if (isFirst) points = call.level >= 4 ? 12 : 8
      else points = (points ?? 10) + 2
      continue
    }
    // A first suit shows five cards (four in a minor), bidding it again six.
    const minor = call.strain === 'clubs' || call.strain === 'diamonds'
    lens[call.strain] = lens[call.strain] ? 6 : minor ? 4 : 5
    if (isFirst) points = !anyBefore ? 13 : opponentsOpened && !iBid ? 11 : call.level >= 2 ? 11 : 8
    else points = (points ?? 10) + 1
  }
  return { points: points ?? 7, lengths: lens, balanced }
}

/** Game needs 26 combined points here (one more than the textbook 25, to suit the AI's play). */
const GAME = 26

const levelFor = (strain: Strain, combined: number, balancedish: boolean): number => {
  if (combined >= 37) return 7
  if (combined >= 34) return 6
  if (strain === 'notrump') return combined >= GAME ? 3 : combined >= 23 ? 2 : 1
  if (strain === 'hearts' || strain === 'spades')
    return combined >= GAME ? 4 : combined >= 23 ? 3 : combined >= 20 ? 2 : 1
  // Minors: game needs more; with game values a balanced hand prefers 3NT (handled by caller).
  if (combined >= 29) return 5
  if (combined >= GAME) return balancedish ? 3 : 4
  return combined >= 23 ? 3 : combined >= 20 ? 2 : 1
}

/** The contract our side should aim for. */
export function targetContract(hand: readonly SuitedCard[], info: PartnerInfo): Bid | null {
  const mine = lengths(hand)
  const total = (s: Suit) => mine[s] + (info.lengths[s] ?? 0)
  const fitMajor = MAJORS.filter((s) => total(s) >= 8).sort((a, b) => total(b) - total(a))[0]
  const anyFit = SUITS.some((s) => total(s) >= 8)
  // Length points only count with a trump fit; in notrump only high cards matter.
  const combined = (anyFit ? totalPoints(hand) : hcp(hand)) + info.points
  const balanced = isBalanced(hand)
  let strain: Strain
  if (fitMajor) strain = fitMajor
  else if (combined >= GAME && (balanced || info.balanced)) strain = 'notrump'
  else {
    const fitMinor = (['diamonds', 'clubs'] as const).filter((s) => total(s) >= 8)[0]
    if (fitMinor) strain = fitMinor
    else if (balanced || info.balanced) strain = 'notrump'
    else
      strain = SUITS.filter((s) => mine[s] >= 5).sort((a, b) => mine[b] - mine[a])[0] ?? 'notrump'
  }
  if (combined < 18) return null
  if (
    (strain === 'clubs' || strain === 'diamonds') &&
    combined >= GAME &&
    combined < 29 &&
    balanced
  )
    strain = 'notrump'
  return { level: levelFor(strain, combined, balanced), strain }
}

function openingBid(hand: readonly SuitedCard[]): Bid | null {
  const points = hcp(hand)
  const l = lengths(hand)
  if (isBalanced(hand) && points >= 15 && points <= 17) return { level: 1, strain: 'notrump' }
  if (isBalanced(hand) && points >= 20 && points <= 21) return { level: 2, strain: 'notrump' }
  if (points < 12 && !(points >= 11 && Math.max(...Object.values(l)) >= 6)) return null
  const major = MAJORS.filter((s) => l[s] >= 5).sort((a, b) => l[b] - l[a])[0]
  if (major) return { level: 1, strain: major }
  return { level: 1, strain: l.diamonds >= 4 && l.diamonds >= l.clubs ? 'diamonds' : 'clubs' }
}

function cheapestLevel(strain: Strain, auction: readonly AuctionCall[]) {
  const last = lastBid(auction)
  for (let level = 1; level <= 7; level++)
    if (!last || bidRank({ level, strain }) > bidRank(last.bid)) return level
  return 8
}

function chooseCall(view: BridgeView, me: PlayerId, difficulty: Difficulty, noise: number): Call {
  const hand = view.hand
  const order = view.order
  const auction = view.auction
  const mySide = sideOf(order, me)
  const last = lastBid(auction)
  const ourBids = auction.filter((c) => c.call.type === 'bid' && sideOf(order, c.player) === mySide)
  const theirBids = auction.filter(
    (c) => c.call.type === 'bid' && sideOf(order, c.player) !== mySide,
  )
  const legal = legalCalls(view, me)
  const can = (c: Call) => legal.some((l) => JSON.stringify(l) === JSON.stringify(c))
  const bid = (b: Bid): Call => ({ type: 'bid', level: b.level, strain: b.strain })
  const slack = difficulty === 'beginner' ? Math.round(noise * 4 - 2) : 0

  // Opening.
  if (ourBids.length === 0 && theirBids.length === 0) {
    const open = openingBid(hand)
    return open && can(bid(open)) ? bid(open) : { type: 'pass' }
  }
  // Overcall after the opponents opened.
  if (ourBids.length === 0) {
    const points = hcp(hand) + slack
    const l = lengths(hand)
    if (
      isBalanced(hand) &&
      points >= 15 &&
      points <= 18 &&
      can(bid({ level: 1, strain: 'notrump' }))
    )
      return bid({ level: 1, strain: 'notrump' })
    const suit = SUITS.filter((s) => l[s] >= 5).sort((a, b) => l[b] - l[a])[0]
    if (suit && points >= 8) {
      const level = cheapestLevel(suit, auction)
      if (level === 1 || (level === 2 && points >= 11)) return bid({ level, strain: suit })
    }
    return { type: 'pass' }
  }
  // Our side is in the auction: aim for the right contract.
  const info = partnerInfo(auction, me, order)
  const mine = totalPoints(hand) + slack
  const partnerBid = auction.some((c) => c.player === partnerOf(order, me) && c.call.type === 'bid')
  if (partnerBid && mine < 6 && !ourBids.some((c) => c.player === me)) return { type: 'pass' }
  const target = targetContract(hand, { ...info, points: info.points + slack })
  if (!target) return { type: 'pass' }
  const lastIsOurs = last && sideOf(order, last.player) === mySide
  if (lastIsOurs && bidRank(last.bid) >= bidRank(target)) return { type: 'pass' }
  const combined = mine + info.points
  // Penalty double when the opponents overreach.
  if (
    !lastIsOurs &&
    last &&
    difficulty !== 'beginner' &&
    last.bid.level >= 3 &&
    hcp(hand) >= 13 &&
    combined >= 25 &&
    bidRank(target) <= bidRank(last.bid) &&
    can({ type: 'double' })
  )
    return { type: 'double' }
  if (last && bidRank(target) <= bidRank(last.bid)) return { type: 'pass' }
  // Game and slam are bid directly; part-scores step by step.
  const isGameOrMore =
    (target.strain === 'notrump' && target.level >= 3) ||
    ((target.strain === 'hearts' || target.strain === 'spades') && target.level >= 4) ||
    target.level >= 5
  const level = isGameOrMore
    ? target.level
    : Math.min(target.level, cheapestLevel(target.strain, auction))
  const call = bid({
    level: Math.max(level, cheapestLevel(target.strain, auction)),
    strain: target.strain,
  })
  if (call.type === 'bid' && call.level > target.level) return { type: 'pass' }
  return can(call) ? call : { type: 'pass' }
}

// --- Card play ---------------------------------------------------------------------------------

function choosePlay(
  view: BridgeView,
  me: PlayerId,
  legalIds: Set<string>,
  difficulty: Difficulty,
): SuitedCard {
  const seat = view.turn
  const own = seat === me ? view.hand : (view.dummyHand ?? [])
  const cards = own.filter((c) => legalIds.has(c.id))
  const contract = view.contract!
  const trump = contract.strain === 'notrump' ? null : contract.strain
  const partner = partnerOf(view.order, seat)
  // Cards that cannot beat us: already played, our own, or in our partner's visible hand
  // (declarer and dummy see each other; defenders do not see their partner).
  const dummy = partnerOf(view.order, contract.declarer)
  const partnerVisible =
    seat === contract.declarer ? (view.dummyHand ?? []) : seat === dummy ? view.hand : []
  const safe = new Set([...view.played, ...own, ...partnerVisible].map((c) => c.id))
  /** The highest card of its suit that is still out. */
  const isMaster = (c: SuitedCard) =>
    FULL_DECK.filter((x) => x.suit === c.suit && highValue(x) > highValue(c)).every((x) =>
      safe.has(x.id),
    )
  const low = (list: SuitedCard[]) => [...list].sort((a, b) => highValue(a) - highValue(b))[0]!
  const high = (list: SuitedCard[]) => [...list].sort((a, b) => highValue(b) - highValue(a))[0]!
  const bySuit = (s: Suit) => cards.filter((c) => c.suit === s)

  if (view.trick.length === 0) {
    const declaring =
      seat === contract.declarer || seat === partnerOf(view.order, contract.declarer)
    if (declaring && trump) {
      const trumpsOut =
        13 -
        view.played.filter((c) => c.suit === trump).length -
        [...view.hand, ...(view.dummyHand ?? [])].filter((c) => c.suit === trump).length
      const myTrumps = bySuit(trump)
      if (trumpsOut > 0 && myTrumps.length > 0) return high(myTrumps)
    }
    const masters = cards.filter(
      (c) => isMaster(c) && (difficulty !== 'beginner' || c.rank === 'A'),
    )
    if (masters.length > 0) return masters.find((c) => c.suit !== trump) ?? masters[0]!
    if (view.played.length === 0 && !declaring) {
      // Opening lead: top of a sequence, otherwise low from the longest suit.
      for (const s of SUITS) {
        const ss = bySuit(s)
        const hasAK = ss.some((c) => c.rank === 'A') && ss.some((c) => c.rank === 'K')
        const hasKQ = ss.some((c) => c.rank === 'K') && ss.some((c) => c.rank === 'Q')
        if (s !== trump && (hasAK || hasKQ)) return high(ss)
      }
    }
    const longest = SUITS.filter((s) => s !== trump && bySuit(s).length > 0).sort(
      (a, b) => bySuit(b).length - bySuit(a).length,
    )[0]
    return low(longest ? bySuit(longest) : cards)
  }

  const strain = contract.strain
  const winnerNow = trickWinner(view.trick, strain)
  const partnerWinning = winnerNow === partner
  const lastToPlay = view.trick.length === 3
  const wins = (c: SuitedCard) =>
    trickWinner([...view.trick, { player: seat, card: c }], strain) === seat
  const winners = cards.filter(wins)
  const discardLow = () => {
    const plain = cards.filter((c) => c.suit !== trump)
    return low(plain.length > 0 ? plain : cards)
  }
  if (partnerWinning) {
    const partnerCard = view.trick.find((t) => t.player === partner)!.card
    if (lastToPlay || isMaster(partnerCard) || winners.length === 0) return discardLow()
  }
  if (winners.length > 0) {
    // Second hand plays low unless the trick can be taken with a certain winner.
    const led = view.trick[0]!.card.suit
    const ruffing = trump !== null && led !== trump && !cards.some((c) => c.suit === led)
    if (view.trick.length === 1 && difficulty !== 'beginner' && !ruffing) {
      const sure = winners.filter(isMaster)
      if (sure.length === 0) return discardLow()
      return low(sure)
    }
    return low(winners)
  }
  return discardLow()
}

export function createBridgeAgent(difficulty: Difficulty): AiAgent<BridgeView, BridgeAction> {
  return {
    name: `Bridge (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const me =
        view.contract &&
        view.turn === partnerOf(view.order, view.contract.declarer) &&
        view.phase === 'playing'
          ? view.contract.declarer
          : view.turn
      if (view.phase === 'auction') return chooseCall(view, me, difficulty, rng.next())
      const ids = new Set(legalActions.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
      if (difficulty === 'beginner' && rng.next() < 0.3) {
        const own = view.turn === me ? view.hand : (view.dummyHand ?? [])
        return { type: 'play', cardId: rng.pick(own.filter((c) => ids.has(c.id))).id }
      }
      return { type: 'play', cardId: choosePlay(view, me, ids, difficulty).id }
    },
  }
}
