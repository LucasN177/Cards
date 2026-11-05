import type { AiAgent, Difficulty, Suit, SuitedCard } from '@/engine'
import {
  BID_VALUES,
  cardPoints,
  type DeclareAction,
  declareOptions,
  effectiveSuit,
  minimumValue,
  power,
  SKAT_GAMES,
  type SkatAction,
  type SkatGame,
  type SkatView,
  trickWinner,
} from './skat'

const SUITS: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds']
const NULL_RANK = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/**
 * Rough strength of a ten-card hand for a game, on a scale where about 7 is a safe win.
 * Suit/Grand: trumps, jacks, aces, protected tens and short side suits; Null: few high cards.
 */
export function strength(hand: readonly SuitedCard[], game: SkatGame): number {
  if (game.type === 'null') {
    let danger = 0
    for (const suit of SUITS) {
      const ranks = hand
        .filter((c) => c.suit === suit)
        .map((c) => NULL_RANK.indexOf(c.rank))
        .sort((a, b) => a - b)
      // Each card should have enough lower cards below it to duck.
      ranks.forEach((r, i) => {
        if (r - i * 2 > 1) danger += 1
      })
    }
    return 8 - danger * 1.5
  }
  const jacks = hand.filter((c) => c.rank === 'J')
  const trumps = hand.filter((c) => effectiveSuit(c, game) === 'trump')
  let s = 0
  if (game.type === 'grand') {
    s += jacks.length * 1.5
    if (jacks.some((j) => j.suit === 'clubs')) s += 0.5
  } else {
    s += trumps.length * 0.9 + jacks.length * 0.5
    if (jacks.some((j) => j.suit === 'clubs' || j.suit === 'spades')) s += 0.4
  }
  for (const suit of SUITS) {
    if (game.type === 'suit' && suit === game.suit) continue
    const side = hand.filter((c) => c.suit === suit && c.rank !== 'J')
    if (side.some((c) => c.rank === 'A')) s += game.type === 'grand' ? 1.3 : 1
    if (side.some((c) => c.rank === '10') && side.some((c) => c.rank === 'A')) s += 0.6
    else if (side.some((c) => c.rank === '10') && side.length >= 3) s += 0.3
    if (game.type === 'suit' && side.length === 0) s += 0.5
    if (game.type === 'grand' && side.length >= 4 && side.some((c) => c.rank === 'A')) s += 0.8
  }
  return s
}

/** The best game for a hand and the least it is worth (without Hand or Schneider). */
export function bestGame(hand: readonly SuitedCard[]): {
  game: SkatGame
  strength: number
  value: number
} {
  let best = { game: SKAT_GAMES[0]!, strength: -Infinity, value: 0 }
  for (const game of SKAT_GAMES) {
    const st = strength(hand, game)
    if (st > best.strength) best = { game, strength: st, value: minimumValue(hand, game, false) }
  }
  return best
}

/** How high to bid: the value of the best game if it looks playable. */
export function bidLimit(
  hand: readonly SuitedCard[],
  difficulty: Difficulty,
  noise: number,
): number {
  const threshold =
    difficulty === 'beginner' ? 5.5 + noise : difficulty === 'intermediate' ? 6.2 : 6.5
  let limit = 0
  for (const game of SKAT_GAMES) {
    // The Skat usually helps a little.
    if (strength(hand, game) + 0.6 >= threshold)
      limit = Math.max(limit, minimumValue(hand, game, false))
  }
  return limit
}

/** Choosing two cards to put away: keep trumps, aim for voids, save points. */
function chooseDiscard(hand: readonly SuitedCard[], bid: number) {
  let best: { ids: string[]; score: number } | null = null
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++) {
      const rest = hand.filter((_, k) => k !== i && k !== j)
      const away = [hand[i]!, hand[j]!]
      for (const game of SKAT_GAMES) {
        const reach = game.type === 'null' ? 23 : minimumValue([...rest, ...away], game, false)
        let score = strength(rest, game)
        if (game.type !== 'null') score += (cardPoints(away[0]!) + cardPoints(away[1]!)) * 0.04
        if (reach < bid) score -= 10
        if (!best || score > best.score) best = { ids: away.map((c) => c.id), score }
      }
    }
  return best!.ids
}

function chooseDeclare(
  view: SkatView,
  options: readonly DeclareAction[],
  hand: boolean,
): DeclareAction {
  const cards = [...view.hand, ...(view.skat ?? [])]
  let best: { action: DeclareAction; score: number } | null = null
  for (const action of options) {
    if (action.schneider || action.ouvert) continue
    const value = minimumValue(cards, action.game, hand)
    let score = strength(view.hand, action.game)
    if (value < view.bid) score -= 10
    if (!best || score > best.score) best = { action, score }
  }
  return best!.action
}

function choosePlay(
  view: SkatView,
  plays: readonly SuitedCard[],
  difficulty: Difficulty,
): SuitedCard {
  const game = view.game!
  const me = view.turn
  const declarer = view.declarer!
  const iAmDeclarer = me === declarer
  const led = view.trick.length > 0 ? effectiveSuit(view.trick[0]!.card, game) : null
  const value = (c: SuitedCard) => power(c, game, effectiveSuit(c, game))
  const byPower = (list: readonly SuitedCard[]) =>
    [...list].sort((a, b) => value(a) - value(b) || cardPoints(a) - cardPoints(b))
  const wins = (c: SuitedCard) => trickWinner([...view.trick, { player: me, card: c }], game) === me
  const winners = plays.filter(wins)
  const losers = plays.filter((c) => !wins(c))
  const cheapest = (list: readonly SuitedCard[]) =>
    [...list].sort((a, b) => cardPoints(a) - cardPoints(b) || value(a) - value(b))[0]!
  const richest = (list: readonly SuitedCard[]) =>
    [...list].sort((a, b) => cardPoints(b) - cardPoints(a) || value(a) - value(b))[0]!

  if (game.type === 'null') {
    if (iAmDeclarer) {
      // Never win: the highest card that still loses, else the lowest.
      if (losers.length > 0) return byPower(losers).at(-1)!
      return byPower(plays)[0]!
    }
    // Defenders: lead low, stay under the declarer's card when possible.
    if (view.trick.length === 0) return byPower(plays)[0]!
    const declarerPlayed = view.trick.some((t) => t.player === declarer)
    if (declarerPlayed && trickWinner(view.trick, game) === declarer && losers.length > 0)
      return byPower(losers).at(-1)!
    return byPower(plays)[0]!
  }

  const partner = iAmDeclarer ? null : view.order.find((p) => p !== me && p !== declarer)!
  const trickPoints = view.trick.reduce((s, t) => s + cardPoints(t.card), 0)
  const lastToPlay = view.trick.length === 2

  if (view.trick.length === 0) {
    const trumps = plays.filter((c) => effectiveSuit(c, game) === 'trump')
    const aces = plays.filter((c) => c.rank === 'A' && effectiveSuit(c, game) !== 'trump')
    if (iAmDeclarer) {
      // Pull trumps while holding many, then cash aces.
      if (trumps.length >= 3 || (difficulty === 'expert' && trumps.length >= 2))
        return byPower(trumps).at(-1)!
      if (aces.length > 0) return aces[0]!
      return cheapest(plays)
    }
    if (aces.length > 0) return aces[0]!
    const side = plays.filter((c) => effectiveSuit(c, game) !== 'trump')
    return cheapest(side.length > 0 ? side : plays)
  }

  const winnerNow = trickWinner(view.trick, game)
  const friendWinning = !iAmDeclarer && winnerNow === partner
  if (friendWinning) {
    // Partner has it: add points ("schmieren") when safe.
    const safe = lastToPlay || view.trick.length === 2 || winners.length === 0
    const declarerStillToPlay = !lastToPlay && !view.trick.some((t) => t.player === declarer)
    if (!declarerStillToPlay || safe) {
      const sideCards = plays.filter((c) => effectiveSuit(c, game) !== 'trump' || led === 'trump')
      return richest(sideCards.length > 0 ? sideCards : plays)
    }
    return cheapest(plays)
  }
  if (
    winners.length > 0 &&
    (trickPoints >= 3 || lastToPlay || iAmDeclarer || difficulty !== 'beginner')
  ) {
    // Take it with the cheapest winning card; last to play may use the lowest winner.
    return byPower(winners)[0]!
  }
  return cheapest(losers.length > 0 ? losers : plays)
}

export function createSkatAgent(difficulty: Difficulty): AiAgent<SkatView, SkatAction> {
  return {
    name: `Skat (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const hand = view.hand
      switch (view.phase) {
        case 'bidding': {
          const b = view.bidding
          const limit = bidLimit(hand, difficulty, rng.next() * 1.5 - 0.5)
          if (b.stage === 3) return limit >= 18 ? { type: 'bid', value: 18 } : { type: 'pass' }
          if (b.waiting === 'listener')
            return b.value <= limit ? { type: 'hold' } : { type: 'pass' }
          const next = BID_VALUES.find((v) => v > b.value)
          return next !== undefined && next <= limit
            ? { type: 'bid', value: next }
            : { type: 'pass' }
        }
        case 'skat': {
          const best = bestGame(hand)
          const handValue = minimumValue(hand, best.game, true)
          const playHand =
            difficulty !== 'beginner' && best.strength >= 8.5 && handValue >= view.bid
          if (playHand) {
            const options = legalActions.filter((a): a is DeclareAction => a.type === 'declare')
            return chooseDeclare(view, options, true)
          }
          return { type: 'takeSkat' }
        }
        case 'discard':
          return { type: 'discard', cardIds: chooseDiscard(hand, view.bid) }
        case 'declare':
          return chooseDeclare(view, declareOptions(false), false)
        case 'playing': {
          const ids = new Set(legalActions.flatMap((a) => (a.type === 'play' ? [a.cardId] : [])))
          const plays = hand.filter((c) => ids.has(c.id))
          if (difficulty === 'beginner' && rng.next() < 0.3)
            return { type: 'play', cardId: rng.pick(plays).id }
          return { type: 'play', cardId: choosePlay(view, plays, difficulty).id }
        }
        default:
          return legalActions[0]!
      }
    },
  }
}
