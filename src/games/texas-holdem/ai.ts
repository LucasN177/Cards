import {
  type AiAgent,
  createDeck,
  type Difficulty,
  type PlayerId,
  type Rng,
  type SuitedCard,
} from '@/engine'
import { evaluate, rankValue } from './handRank'
import type { HoldemAction, HoldemView } from './holdem'

/** Rough preflop strength 0…1 of two hole cards (pairs, high cards, suited, connected). */
export function preflopStrength(hole: readonly SuitedCard[]) {
  const [a, b] = hole.map(rankValue).sort((x, y) => y - x) as [number, number]
  let s = a + b * 0.5
  if (a === b) s += 10 + a * 0.6
  if (hole[0]!.suit === hole[1]!.suit) s += 2.5
  const gap = a - b
  if (gap === 1) s += 1.5
  else if (gap === 2) s += 0.75
  else if (gap >= 4) s -= gap * 0.3
  // About 3 (7-2 offsuit) to 41 (aces).
  return Math.max(0, Math.min(1, (s - 3) / 38))
}

/**
 * Monte-Carlo equity: the share of the pot `hole` wins against `opponents` random hands with
 * the board completed at random. `minStrength` per opponent narrows their hands (e.g. after a
 * raise only the better half of starting hands).
 */
export function equity(
  hole: readonly SuitedCard[],
  board: readonly SuitedCard[],
  opponents: number,
  sims: number,
  rng: Rng,
  minStrength: readonly number[] = [],
) {
  const known = new Set([...hole, ...board].map((c) => c.id))
  const deck = (createDeck('standard52') as SuitedCard[]).filter((c) => !known.has(c.id))
  let total = 0
  for (let s = 0; s < sims; s++) {
    // Partial shuffle: we only need the first few cards.
    const pool = [...deck]
    let k = 0
    const draw = () => {
      const i = k + rng.int(pool.length - k)
      ;[pool[k], pool[i]] = [pool[i]!, pool[k]!]
      return pool[k++]!
    }
    const hands: SuitedCard[][] = []
    for (let o = 0; o < opponents; o++) {
      let hand = [draw(), draw()]
      // Re-deal weak hands for opponents who showed strength (a few tries).
      for (let tries = 0; tries < 6 && preflopStrength(hand) < (minStrength[o] ?? 0); tries++) {
        k -= 2
        hand = [draw(), draw()]
      }
      hands.push(hand)
    }
    const fullBoard = [...board]
    while (fullBoard.length < 5) fullBoard.push(draw())
    const mine = evaluate([...hole, ...fullBoard])
    let ties = 1
    let lost = false
    for (const h of hands) {
      const v = evaluate([...h, ...fullBoard])
      if (v > mine) {
        lost = true
        break
      }
      if (v === mine) ties++
    }
    if (!lost) total += 1 / ties
  }
  return total / sims
}

const raiseTo = (view: HoldemView, to: number): HoldemAction => ({
  type: 'raise',
  to: Math.max(view.minRaiseTo, Math.min(view.maxRaiseTo, Math.round(to))),
})

/** Opponents still in the hand. */
const opponentsIn = (view: HoldemView, self: PlayerId) =>
  view.seated.filter((p) => p !== self && !view.folded.includes(p))

/** Who raised this hand (seen from the current events only: the round's last raiser). */
function raisers(view: HoldemView, self: PlayerId) {
  return opponentsIn(view, self).filter(
    (p) => view.bets[p]! > view.bigBlind && view.bets[p] === view.currentBet,
  )
}

/**
 * Beginners call too much and rarely raise; intermediate players weigh their Monte-Carlo
 * equity against the pot odds and bet strong hands; the expert simulates more, reads raises as
 * strength, bets for value by the pot, semi-bluffs draws now and then and plays push-or-fold
 * when short-stacked.
 */
export function createHoldemAgent(difficulty: Difficulty): AiAgent<HoldemView, HoldemAction> {
  const sims = difficulty === 'beginner' ? 40 : difficulty === 'intermediate' ? 150 : 400
  return {
    name: `Hold'em (${difficulty})`,
    chooseAction({ view, rng, playerId }) {
      const opponents = opponentsIn(view, playerId)
      const n = Math.max(1, opponents.length)
      const pot = view.pot
      const toCall = view.toCall
      const stack = view.stacks[playerId]!
      const canRaise = view.maxRaiseTo > view.currentBet
      const expert = difficulty === 'expert'

      const strong = expert ? raisers(view, playerId) : []
      const narrowing = opponents.map((p) => (strong.includes(p) ? 0.45 : 0))
      const eq = equity(view.hole, view.board, n, sims, rng, narrowing)
      const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0
      // A fair share against n opponents is 1/(n+1); "strong" means clearly above it.
      const fair = 1 / (n + 1)

      if (difficulty === 'beginner') {
        if (toCall === 0)
          return canRaise && eq > 0.75 && rng.next() < 0.5
            ? raiseTo(view, view.currentBet + pot * 0.5)
            : { type: 'check' }
        if (eq + 0.15 > potOdds || rng.next() < 0.3) return { type: 'call' }
        return { type: 'fold' }
      }

      // Short stack (expert): all-in with a good hand, fold the rest.
      const bigBlinds = stack / view.bigBlind
      if (expert && bigBlinds <= 10 && view.board.length === 0) {
        if (eq > fair * 1.35 && canRaise) return raiseTo(view, view.maxRaiseTo)
        return toCall === 0 ? { type: 'check' } : { type: 'fold' }
      }

      const valueBet = (fraction: number) =>
        raiseTo(view, view.currentBet + Math.max(view.bigBlind, pot * fraction))
      const veryStrong = eq > Math.max(0.55, fair * 2.2)
      const good = eq > Math.max(0.4, fair * 1.5)

      if (toCall === 0) {
        if (canRaise && veryStrong) return valueBet(expert ? 0.75 : 0.6)
        if (canRaise && good && (expert || rng.next() < 0.5)) return valueBet(0.5)
        // Expert: an occasional bluff or semi-bluff when few opponents are left.
        if (
          expert &&
          canRaise &&
          n <= 2 &&
          view.board.length >= 3 &&
          view.board.length < 5 &&
          eq > fair * 0.8 &&
          rng.next() < 0.25
        )
          return valueBet(0.5)
        return { type: 'check' }
      }
      if (canRaise && veryStrong && (expert || rng.next() < 0.7)) {
        // Raise, but not every time with the same size.
        return raiseTo(view, view.currentBet + view.lastRaise + pot * (expert ? 0.75 : 0.5))
      }
      // Call when the equity beats the pot odds (the expert also counts on later bets).
      const implied = expert && view.board.length < 5 ? 0.04 : 0
      if (eq + implied > potOdds * 1.05) return { type: 'call' }
      return { type: 'fold' }
    },
  }
}
