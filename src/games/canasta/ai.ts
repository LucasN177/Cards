import type { AiAgent, Card, Difficulty, PlayerId, Rank, Rng } from '@/engine'
import { nextPlayer } from '@/engine'
import {
  type CanastaAction,
  type CanastaView,
  cardPoints,
  isBlackThree,
  isCanasta,
  isRedThree,
  isWild,
  MAX_WILDS,
  type Meld,
  type MeldGroup,
  naturalRank,
  pointsOf,
  sideOf,
} from './canasta'

/** Natural cards of the hand by rank (black threes apart), and the wild cards. */
function analyse(hand: readonly Card[]) {
  const byRank = new Map<Rank, Card[]>()
  const wilds: Card[] = []
  const blackThrees: Card[] = []
  for (const c of hand) {
    if (isWild(c)) wilds.push(c)
    else if (isBlackThree(c)) blackThrees.push(c)
    else byRank.set(naturalRank(c)!, [...(byRank.get(naturalRank(c)!) ?? []), c])
  }
  return { byRank, wilds, blackThrees }
}

const ownMelds = (view: CanastaView) => view.melds[view.mySide]!
const meldOf = (melds: readonly Meld[], rank: Rank) => melds.find((m) => m.rank === rank)

/** Group cards into `MeldGroup`s (merging per rank). */
function toGroups(plan: Map<Rank, Card[]>): MeldGroup[] {
  return [...plan]
    .filter(([, cs]) => cs.length > 0)
    .map(([rank, cs]) => ({ rank, cardIds: cs.map((c) => c.id) }))
}

interface Plan {
  readonly groups: MeldGroup[]
  readonly value: number
  readonly cardsUsed: number
}

/**
 * What to meld from `hand` this turn. Naturals go onto own melds and form new melds of three;
 * pairs become melds with one wild card when needed (or allowed by `pairWithWild`). Wild cards
 * complete melds close to a canasta when `wildsToCanasta`. `keep` cards stay in hand.
 */
function planMelds(
  hand: readonly Card[],
  melds: readonly Meld[],
  opts: { pairWithWild: boolean; wildsToCanasta: boolean; goOut: boolean; keep: number },
): Plan {
  const { byRank, wilds, blackThrees } = analyse(hand)
  const plan = new Map<Rank, Card[]>()
  const freeWilds = [...wilds]
  const sizeOf = (rank: Rank) =>
    (meldOf(melds, rank)?.cards.length ?? 0) + (plan.get(rank)?.length ?? 0)
  const wildsIn = (rank: Rank) =>
    (meldOf(melds, rank)?.cards.filter(isWild).length ?? 0) +
    (plan.get(rank)?.filter(isWild).length ?? 0)
  for (const [rank, cards] of byRank) {
    if (meldOf(melds, rank) || cards.length >= 3) plan.set(rank, [...cards])
  }
  if (opts.pairWithWild) {
    for (const [rank, cards] of [...byRank].sort((a, b) => pointsOf(b[1]) - pointsOf(a[1]))) {
      if (plan.has(rank) || cards.length !== 2 || freeWilds.length === 0) continue
      plan.set(rank, [...cards, freeWilds.shift()!])
    }
  }
  if (opts.wildsToCanasta || opts.goOut) {
    // Biggest melds first: they are closest to a canasta.
    const ranks = [...new Set([...melds.map((m) => m.rank), ...plan.keys()])].sort(
      (a, b) => sizeOf(b) - sizeOf(a),
    )
    for (const rank of ranks) {
      while (
        freeWilds.length > 0 &&
        wildsIn(rank) < MAX_WILDS &&
        (opts.goOut || (sizeOf(rank) >= 5 && sizeOf(rank) < 7))
      ) {
        plan.set(rank, [...(plan.get(rank) ?? []), freeWilds.shift()!])
      }
    }
  }
  if (opts.goOut && blackThrees.length >= 3) plan.set('3', [...blackThrees])
  // Keep enough cards back (unless going out).
  let groups = toGroups(plan)
  if (!opts.goOut) {
    const used = () => groups.reduce((s, g) => s + g.cardIds.length, 0)
    while (groups.length > 0 && hand.length - used() < opts.keep) {
      // Drop the cheapest new group.
      const drop = [...groups].sort((a, b) => a.cardIds.length - b.cardIds.length)[0]!
      groups = groups.filter((g) => g !== drop)
    }
  }
  const all = groups.flatMap((g) => g.cardIds.map((id) => hand.find((c) => c.id === id)!))
  return { groups, value: pointsOf(all), cardsUsed: all.length }
}

/** Groups to take the pile with (the top card is added by the rules), or null. */
function planTakePile(view: CanastaView, hand: readonly Card[]): MeldGroup[] | null {
  const top = view.discardTop
  if (!top || isWild(top) || isBlackThree(top)) return null
  const rank = naturalRank(top)!
  const { byRank, wilds } = analyse(hand)
  const naturals = byRank.get(rank) ?? []
  const melds = ownMelds(view)
  let topGroup: Card[] | null = null
  if (view.pileFrozen) {
    if (naturals.length >= 2) topGroup = [...naturals]
  } else if (meldOf(melds, rank)) topGroup = [...naturals]
  else if (naturals.length >= 2) topGroup = [...naturals]
  else if (naturals.length === 1 && wilds.length > 0) topGroup = [naturals[0]!, wilds[0]!]
  if (!topGroup) return null
  const groups: MeldGroup[] = [{ rank, cardIds: topGroup.map((c) => c.id) }]
  if (view.minimum > 0) {
    // The first meld must reach the minimum: add other melds from the hand.
    let value = pointsOf(topGroup) + cardPoints(top)
    const rest = hand.filter((c) => !topGroup!.includes(c))
    const extra = planMelds(rest, melds, {
      pairWithWild: true,
      wildsToCanasta: false,
      goOut: false,
      keep: 0,
    })
    for (const g of extra.groups) {
      if (value >= view.minimum) break
      if (g.rank === rank) continue
      groups.push(g)
      value += pointsOf(g.cardIds.map((id) => hand.find((c) => c.id === id)!))
    }
    if (value < view.minimum) return null
  }
  // Keep at least two cards (counting the pile) unless going out is allowed.
  const used = groups.reduce((n, g) => n + g.cardIds.length, 0)
  const pile = view.discardPile.slice(0, -1).filter((c) => !isRedThree(c)).length
  const canastas = simulatedCanastas(
    melds,
    groups.map((g) => (g.rank === rank ? { ...g, cardIds: [...g.cardIds, top.id] } : g)),
  )
  if (hand.length - used + pile <= 1 && canastas < view.canastasNeeded) return null
  return groups
}

/** Expert: how much a discard helps the next opponent (they meld that rank or took it). */
function danger(card: Card, view: CanastaView, next: PlayerId) {
  if (isBlackThree(card)) return -20
  const rank = naturalRank(card)
  if (!rank) return 100
  let d = 0
  if (view.melds[sideOf(view.order, next)]!.some((m) => m.rank === rank))
    d += view.pileFrozen ? 2 : 8
  for (const c of view.pickups[next] ?? []) if (naturalRank(c) === rank) d += 3
  for (const c of view.thrown[next] ?? []) if (naturalRank(c) === rank) d -= 2
  return d
}

/** The card to throw: singles first, low value, never a wild card; the expert plays safe. */
function chooseDiscard(view: CanastaView, difficulty: Difficulty, rng: Rng): Card {
  const hand = view.hand
  const melds = ownMelds(view)
  const { byRank } = analyse(hand)
  const next = nextPlayer(view.order, view.turn)
  const score = (c: Card) => {
    if (difficulty === 'beginner') return rng.next() * 10 + (isWild(c) ? 50 : 0)
    if (isWild(c)) return 100
    if (isBlackThree(c)) return difficulty === 'expert' ? -5 : 0
    const rank = naturalRank(c)!
    if (meldOf(melds, rank)) return 60 // could be added to an own meld
    const count = byRank.get(rank)?.length ?? 0
    let s = count * 12 + cardPoints(c) * 0.3
    if (difficulty === 'expert') s += danger(c, view, next)
    return s
  }
  return [...hand].sort((a, b) => score(a) - score(b))[0]!
}

/**
 * Beginners rarely take the pile and meld only full threes; intermediate players take the pile
 * whenever possible, build melds with wild cards and go out when they can; the expert also
 * completes canastas with wild cards, keeps pairs back for taking the pile and discards
 * defensively (stop cards first, nothing the next opponent can use).
 */
export function createCanastaAgent(difficulty: Difficulty): AiAgent<CanastaView, CanastaAction> {
  const expert = difficulty === 'expert'
  return {
    name: `Canasta (${difficulty})`,
    chooseAction({ view, rng }) {
      const hand = view.hand
      const melds = ownMelds(view)
      if (view.phase === 'draw') {
        const groups = planTakePile(view, hand)
        const worth = difficulty === 'beginner' ? view.discardCount >= 5 && rng.next() < 0.5 : true
        if (groups && worth) return { type: 'takePile', groups }
        return { type: 'drawStock' }
      }

      const canastas = melds.filter(isCanasta).length
      // Go out when the side has (or now completes) enough canastas.
      if (difficulty !== 'beginner') {
        const out = planMelds(hand, melds, {
          pairWithWild: true,
          wildsToCanasta: true,
          goOut: true,
          keep: 0,
        })
        const left = hand.length - out.cardsUsed
        const after = simulatedCanastas(melds, out.groups)
        if (
          left <= 1 &&
          after >= view.canastasNeeded &&
          (view.minimum === 0 || out.value >= view.minimum)
        ) {
          if (out.groups.length > 0) return { type: 'meld', groups: out.groups }
          if (left === 1) return { type: 'discard', cardId: hand[0]!.id }
        }
      }

      const plan = planMelds(hand, melds, {
        // After the first meld the expert keeps pairs back to take the pile with them.
        pairWithWild: difficulty !== 'beginner' && !(expert && view.minimum === 0),
        wildsToCanasta: expert || canastas < view.canastasNeeded,
        goOut: false,
        keep: 2,
      })
      if (plan.groups.length > 0 && (view.minimum === 0 || plan.value >= view.minimum)) {
        return { type: 'meld', groups: plan.groups }
      }
      return { type: 'discard', cardId: chooseDiscard(view, difficulty, rng).id }
    },
  }
}

/** Canastas the side would have after melding `groups`. */
function simulatedCanastas(melds: readonly Meld[], groups: readonly MeldGroup[]) {
  const sizes = new Map(melds.map((m) => [m.rank, m.cards.length]))
  for (const g of groups) sizes.set(g.rank, (sizes.get(g.rank) ?? 0) + g.cardIds.length)
  return [...sizes.values()].filter((n) => n >= 7).length
}
