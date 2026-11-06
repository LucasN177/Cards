import {
  type AiAgent,
  type Card,
  createDeck,
  type Difficulty,
  nextPlayer,
  type PlayerId,
  jokerCard,
  type Rng,
} from '@/engine'
import {
  analyzeMeld,
  bestMelds,
  bestMeldsWithJokers,
  handPenalty,
  layOff,
  type Meld,
  meldValue,
  rankNumber,
} from './melds'
import type { RommeAction, RommeView } from './romme'

type Suited = Extract<Card, { kind: 'suited' }>

const coveredBy = (melds: readonly (readonly Card[])[]) => new Set(melds.flat().map((c) => c.id))

/** The ace also sits below the two (A-2-3). */
const distance = (a: Suited, b: Suited) => {
  const x = rankNumber(a.rank)
  const y = rankNumber(b.rank)
  const low = (n: number) => (n === 14 ? 1 : n)
  return Math.min(Math.abs(x - y), Math.abs(low(x) - low(y)))
}

/** Whether two plain cards could end up in one meld: same rank, or same suit and close. */
function related(a: Card, b: Card) {
  if (a.kind !== 'suited' || b.kind !== 'suited') return false
  if (a.rank === b.rank) return a.suit !== b.suit
  return a.suit === b.suit && distance(a, b) <= 2
}

/** How useful a card is for future melds: jokers most, then pairs and neighbours. */
function usefulness(card: Card, hand: readonly Card[]) {
  if (card.kind === 'joker') return 100
  let u = 0
  for (const other of hand) {
    if (other === card || other.kind !== 'suited') continue
    if (other.rank === card.rank && other.suit !== card.suit) u += 3
    if (other.suit === card.suit) {
      const d = Math.abs(rankNumber(other.rank) - rankNumber(card.rank))
      if (d === 1) u += 3
      else if (d === 2) u += 1.5
    }
  }
  return u
}

/** Card counting: how many copies of each card (two decks) nobody has seen yet. */
function liveCounter(view: RommeView) {
  const seen = new Map<string, number>()
  for (const c of [...view.hand, ...view.discardPile, ...view.melds.flatMap((m) => m.cards)]) {
    if (c.kind === 'suited') seen.set(c.rank + c.suit, (seen.get(c.rank + c.suit) ?? 0) + 1)
  }
  return (rank: number, suit: Suited['suit']) => {
    const n = rank === 1 ? 14 : rank
    if (n < 2 || n > 14) return 0
    const r = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][n - 2]!
    return Math.max(0, 2 - (seen.get(r + suit) ?? 0))
  }
}

const SUITS = ['clubs', 'spades', 'hearts', 'diamonds'] as const

/**
 * Expert: like `usefulness`, but a pair or a pair of neighbours is only worth as much as the
 * cards that would complete it are still out there.
 */
function liveUsefulness(card: Card, hand: readonly Card[], live: ReturnType<typeof liveCounter>) {
  if (card.kind === 'joker') return 100
  let u = 0
  const n = rankNumber(card.rank)
  for (const other of hand) {
    if (other === card || other.kind !== 'suited') continue
    if (other.rank === card.rank && other.suit !== card.suit) {
      // A set needs one of the two other suits.
      const outs = SUITS.filter((s) => s !== card.suit && s !== other.suit).reduce(
        (sum, s) => sum + live(n, s),
        0,
      )
      u += 0.9 * outs
    } else if (other.suit === card.suit) {
      const d = distance(card, other)
      const lo = Math.min(n, rankNumber(other.rank))
      const hi = Math.max(n, rankNumber(other.rank))
      if (d === 1) u += 0.8 * (live(lo - 1, card.suit) + live(hi + 1, card.suit))
      else if (d === 2) u += 0.8 * live(lo + 1, card.suit)
    }
  }
  return u
}

const fitsTable = (card: Card, melds: readonly Meld[]) => melds.some((m) => layOff(m, [card]))

/**
 * Expert: how much a discard would help the next player. Cards that fit a meld on the table are
 * a gift once they have laid out; cards close to what they took from the discard pile probably
 * complete their melds.
 */
function danger(card: Card, view: RommeView, me: PlayerId) {
  if (card.kind === 'joker') return 0
  const next = nextPlayer(view.order, me)
  let d = 0
  if (view.hasMelded[next] && fitsTable(card, view.melds)) d += 6
  for (const picked of view.pickups[next] ?? []) if (related(card, picked)) d += 4
  return d
}

/** Fewest cards any opponent holds – close to going out means dumping high cards matters. */
const closestOpponent = (view: RommeView, me: PlayerId) =>
  Math.min(...view.order.filter((p) => p !== me).map((p) => view.handSizes[p] ?? 13))

const JOKER = jokerCard('red')

/**
 * A joker is only worth keeping while it can still be used: with two cards or fewer it can no
 * longer join a new meld, and if nothing on the table takes it either, holding it on forever
 * would stall the round.
 */
const deadJoker = (hand: readonly Card[], table: readonly Meld[]) =>
  hand.length <= 2 && !table.some((m) => layOff(m, [JOKER]))

/** The melds to lay out now (everything `bestMelds` finds, if the first lay-out is reached). */
function meldsToPlay(
  hand: readonly Card[],
  hasMelded: boolean,
  firstMeld: number,
  find: (h: readonly Card[]) => Card[][] = bestMelds,
) {
  const melds = find(hand)
  if (melds.length === 0) return null
  const value = melds.reduce((s, m) => s + meldValue(analyzeMeld(m)!), 0)
  return hasMelded || value >= firstMeld ? melds : null
}

function findLayOff(hand: readonly Card[], table: readonly Meld[]) {
  for (const card of hand) {
    for (const meld of table) if (layOff(meld, [card])) return { meld, card }
  }
  return null
}

/** Intermediate discard: keep melds and pairs/neighbours, then the lower penalty. */
function plainDiscard(
  hand: readonly Card[],
  table: readonly Meld[],
  takenDiscard: string | null,
  usefulnessWeight = 1,
) {
  const options = hand.filter((c) => c.id !== takenDiscard || hand.length === 1)
  const keep = coveredBy(bestMelds(hand))
  const dead = deadJoker(hand, table)
  let best = options[0]!
  let bestScore = Infinity
  for (const c of options) {
    const u = c.kind === 'joker' && dead ? 0 : usefulness(c, hand)
    const s = (keep.has(c.id) ? 50 : 0) + u * usefulnessWeight - handPenalty(c) * 0.15
    if (s < bestScore) {
      bestScore = s
      best = c
    }
  }
  return best
}

// --- Expert: short solitaire rollouts ----------------------------------------------------------

/** My own future: the hand, the table (which my lay-offs change) and whether I have laid out. */
interface Sim {
  hand: Card[]
  table: Meld[]
  melded: boolean
}

/** Plays the rest of a turn after drawing like the intermediate does. True when out. */
function playTurn(sim: Sim, firstMeld: number, takenDiscard: string | null) {
  const melds = meldsToPlay(sim.hand, sim.melded, firstMeld, bestMeldsWithJokers)
  if (melds) {
    for (const group of melds) {
      sim.table.push({ ...analyzeMeld(group)!, id: 'sim' })
      sim.hand = sim.hand.filter((c) => !group.includes(c))
    }
    sim.melded = true
    if (sim.hand.length === 0) return true
  }
  if (sim.melded) {
    for (let move = findLayOff(sim.hand, sim.table); move; move = findLayOff(sim.hand, sim.table)) {
      const { meld, card } = move
      sim.table[sim.table.indexOf(meld)] = { ...layOff(meld, [card])!, id: meld.id }
      sim.hand = sim.hand.filter((c) => c !== card)
      if (sim.hand.length === 0) return true
    }
  }
  const card = plainDiscard(sim.hand, sim.table, takenDiscard)
  sim.hand = sim.hand.filter((c) => c !== card)
  return sim.hand.length === 0
}

const penaltyOf = (hand: readonly Card[]) => hand.reduce((s, c) => s + handPenalty(c), 0)

/** How many of my turns a rollout looks ahead (a round lasts about six to eight turns). */
const HORIZON = 10
/** Sampled draw sequences per decision. */
const SAMPLES = 24
/** Weight of the penalty still in hand when the horizon ends without anybody going out. */
const TAIL = 0.6
/** How many of the discards the card-counting score likes best are compared by rollouts. */
const CANDIDATES = 3
/** How much feeding the next player counts against a discard (in penalty points). */
const DANGER_WEIGHT = 0.3
/** Share of the opponents' estimated penalties that going out is worth on top. */
const GOING_OUT_WEIGHT = 0.5

/** Chance that a player who has laid out goes out this turn, by cards in hand (measured). */
const OUT_CHANCE = [0, 0.4, 0.16, 0.16, 0.02, 0.01]
/** Hand sizes right after a first lay-out (measured, from 13 cards in hand). */
const AFTER_FIRST_MELD = [0, 0.02, 0.05, 0.11, 0.2, 0.12, 0.2, 0.26, 0.02, 0.02]
const FIRST_MELD_CHANCE = 0.35

/**
 * One opponent turn as a Markov chain over hand sizes (index 0: not laid out yet), measured
 * from intermediate games: a player who has laid out goes out (OUT_CHANCE), keeps the hand size
 * (≈58 %), lays off one card (≈21 %) or lays out a new meld of three (≈19 %). Returns the new
 * distribution without the share that went out.
 */
function opponentStep(dist: readonly number[]) {
  const next = new Array<number>(dist.length).fill(0)
  for (let n = 0; n < dist.length; n++) {
    const p = dist[n]!
    if (p === 0) continue
    if (n === 0) {
      next[0]! += p * (0.99 - FIRST_MELD_CHANCE)
      AFTER_FIRST_MELD.forEach((q, m) => (next[m]! += p * FIRST_MELD_CHANCE * q))
      continue
    }
    const rest = 1 - (OUT_CHANCE[n] ?? 0.01)
    const down3 = n >= 4 ? 0.19 : 0
    const down1 = n >= 2 ? 0.21 : 0
    next[n]! += p * rest * (1 - down1 - down3)
    if (down1) next[n - 1]! += p * rest * down1
    if (down3) next[n - 3]! += p * rest * down3
  }
  return next
}

/** What a rollout needs to know about the round besides my own cards. */
interface Outlook {
  /** Chance that some opponent goes out between two of my turns, for HORIZON turns. */
  readonly hazards: readonly number[]
  /** What going out myself is worth on top of keeping my own penalty at zero. */
  readonly goingOut: number
  readonly firstMeld: number
}

function outlook(view: RommeView, me: PlayerId): Outlook {
  const opponents = view.order.filter((p) => p !== me)
  const dists = opponents.map((p) => {
    const dist = new Array<number>(15).fill(0)
    dist[view.hasMelded[p] ? Math.min(14, view.handSizes[p] ?? 13) : 0] = 1
    return dist
  })
  const hazards: number[] = []
  let before = 1
  for (let t = 0; t < HORIZON; t++) {
    let survive = 1
    for (let i = 0; i < dists.length; i++) {
      dists[i] = opponentStep(dists[i]!)
      survive *= dists[i]!.reduce((a, b) => a + b, 0)
    }
    hazards.push(before > 0 ? 1 - survive / before : 1)
    before = survive
  }
  // Roughly five points per card for players who have laid out, seven for the others.
  const theirs = opponents.reduce(
    (s, p) => s + (view.handSizes[p] ?? 13) * (view.hasMelded[p] ? 5 : 7),
    0,
  )
  return { hazards, goingOut: theirs * GOING_OUT_WEIGHT, firstMeld: view.options.firstMeld }
}

/**
 * Value of a position right after my discard (the lower, the better): the penalty I expect to
 * keep, as opponents may go out before each of my next turns, minus the bonus for going out
 * first. On my turns I draw the sampled cards and play like the intermediate.
 */
function rollout(start: Sim, draws: readonly Card[], o: Outlook) {
  const sim: Sim = { hand: [...start.hand], table: [...start.table], melded: start.melded }
  let expected = 0
  let alive = 1
  for (let t = 0; t < HORIZON; t++) {
    expected += alive * o.hazards[t]! * penaltyOf(sim.hand)
    alive *= 1 - o.hazards[t]!
    const card = draws[t]
    if (!card) break
    sim.hand.push(card)
    if (playTurn(sim, o.firstMeld, null)) return expected - alive * o.goingOut
  }
  return expected + alive * TAIL * penaltyOf(sim.hand)
}

/** Cards I have not seen: what the stock (and the opponents' hands) are made of. */
function unseenCards(view: RommeView) {
  const seen = new Set(
    [...view.hand, ...view.discardPile, ...view.melds.flatMap((m) => m.cards)].map((c) => c.id),
  )
  return createDeck('romme110').filter((c) => !seen.has(c.id))
}

/** SAMPLES random draw sequences, shared by every option so that differences are not noise. */
function sampleDraws(view: RommeView, rng: Rng, length: number) {
  const pool = unseenCards(view)
  const out: Card[][] = []
  for (let k = 0; k < SAMPLES; k++) {
    const p = [...pool]
    const seq: Card[] = []
    for (let i = 0; i < length && i < p.length; i++) {
      const j = i + rng.int(p.length - i)
      const swap = p[j]!
      p[j] = p[i]!
      p[i] = swap
      seq.push(swap)
    }
    out.push(seq)
  }
  return out
}

/** Card-counting discard score: the lower, the better to throw away. */
function expertScore(c: Card, view: RommeView, me: PlayerId, keep: Set<string>) {
  const hand = view.hand
  const penaltyWeight = closestOpponent(view, me) <= 4 ? 0.6 : 0.25
  const u =
    c.kind === 'joker' && deadJoker(hand, view.melds)
      ? 0
      : liveUsefulness(c, hand, liveCounter(view))
  return (keep.has(c.id) ? 50 : 0) + u + danger(c, view, me) - handPenalty(c) * penaltyWeight
}

/** The best few discards by card counting, then the one whose rollouts keep the least penalty. */
function expertDiscard(view: RommeView, me: PlayerId, rng: Rng) {
  const hand = view.hand
  const keep = coveredBy(bestMeldsWithJokers(hand))
  const candidates = hand
    .filter((c) => c.id !== view.takenDiscard || hand.length === 1)
    .map((c) => ({ c, s: expertScore(c, view, me, keep) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, CANDIDATES)
    .map((r) => r.c)
  if (candidates.length === 1) return candidates[0]!
  const o = outlook(view, me)
  const draws = sampleDraws(view, rng, HORIZON)
  let best = candidates[0]!
  let bestValue = Infinity
  for (const c of candidates) {
    const start: Sim = {
      hand: hand.filter((x) => x !== c),
      table: [...view.melds],
      melded: view.hasMelded[me]!,
    }
    let total = 0
    for (const seq of draws) total += rollout(start, seq, o)
    const value = total / draws.length + DANGER_WEIGHT * danger(c, view, me)
    if (value < bestValue) {
      bestValue = value
      best = c
    }
  }
  return best
}

/** Expert draw: compare taking the discard with drawing from the stock, by rollouts. */
function expertTakesDiscard(view: RommeView, me: PlayerId, rng: Rng) {
  const top = view.discardTop
  if (!top) return false
  const hand = view.hand
  const melded = view.hasMelded[me]!
  const promising =
    top.kind === 'joker' ||
    hand.some((c) => related(c, top)) ||
    (melded && fitsTable(top, view.melds))
  if (!promising) return false
  const o = outlook(view, me)
  const draws = sampleDraws(view, rng, HORIZON + 1)
  const turn = (first: Card, seq: readonly Card[], taken: string | null) => {
    const sim: Sim = { hand: [...hand, first], table: [...view.melds], melded }
    return playTurn(sim, o.firstMeld, taken) ? -o.goingOut : rollout(sim, seq.slice(1), o)
  }
  let take = 0
  let stock = 0
  for (const seq of draws) {
    take += turn(top, seq, top.id)
    stock += turn(seq[0]!, seq, null)
  }
  return take < stock
}

/**
 * Beginners forget to lay out and keep poor cards; intermediate players take the discard only
 * for a meld and keep what forms melds. The expert uses every joker when building melds (and so
 * lays out sooner), and plays a few turns ahead in its head: for the most sensible discards (and
 * for taking the discard or not) it draws sampled unseen cards, plays on like the intermediate
 * and weighs the penalty left in hand by how likely an opponent goes out by then (a model
 * measured from real games). It also counts cards and avoids feeding the next player.
 */
export function createRommeAgent(difficulty: Difficulty): AiAgent<RommeView, RommeAction> {
  const expert = difficulty === 'expert'
  return {
    name: `Rommé (${difficulty})`,
    chooseAction({ view, rng }) {
      const hand = view.hand
      const me = view.turn
      if (view.phase === 'draw') {
        if (expert)
          return expertTakesDiscard(view, me, rng) ? { type: 'drawDiscard' } : { type: 'drawStock' }
        // Take the discard only if it ends up in a meld.
        const top = view.discardTop
        if (top && difficulty !== 'beginner' && coveredBy(bestMelds([...hand, top])).has(top.id))
          return { type: 'drawDiscard' }
        return { type: 'drawStock' }
      }

      // Lay out as soon as it is allowed (beginners sometimes forget).
      const find = expert ? bestMeldsWithJokers : bestMelds
      const melds = meldsToPlay(hand, view.hasMelded[me]!, view.options.firstMeld, find)
      if (melds && !(difficulty === 'beginner' && rng.next() < 0.3)) {
        // Melding everything ends the round at once; otherwise a card stays to discard.
        return { type: 'meld', melds: melds.map((m) => m.map((c) => c.id)) }
      }

      // Lay off single cards on the table (also the very last card: that ends the round).
      if (view.hasMelded[me]) {
        const move = findLayOff(hand, view.melds)
        if (move) return { type: 'layOff', meldId: move.meld.id, cardIds: [move.card.id] }
      }

      const card = expert
        ? expertDiscard(view, me, rng)
        : plainDiscard(hand, view.melds, view.takenDiscard, difficulty === 'beginner' ? 0.3 : 1)
      return { type: 'discard', cardId: card.id }
    },
  }
}
