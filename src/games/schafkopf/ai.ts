import type { AiAgent, Difficulty, PlayerId, Suit, SuitedCard } from '@/engine'
import {
  callableSuits,
  cardPoints,
  isTrump,
  type SchafkopfAction,
  type SchafkopfGame,
  type SchafkopfView,
  trickWinner,
  trumpRank,
} from './schafkopf'

/** Strength of a hand for a game: Ober and Unter count most, then trumps and side aces. */
export function strength(hand: readonly SuitedCard[], game: SchafkopfGame): number {
  let s = 0
  for (const c of hand) {
    const t = trumpRank(c, game)
    if (t >= 90) s += 1.5
    else if (t >= 80) s += 1.1
    else if (game.type === 'wenz' && t >= 0) s += 1.6
    else if (t >= 0) s += c.rank === 'A' || c.rank === '10' ? 0.9 : 0.6
    else if (c.rank === 'A') s += game.type === 'wenz' ? 1.2 : 0.8
    else if (c.rank === '10' && game.type === 'wenz') s += 0.4
  }
  return s
}

function chooseGame(
  view: SchafkopfView,
  options: readonly SchafkopfGame[],
  difficulty: Difficulty,
) {
  const hand = view.hand
  const extra = difficulty === 'beginner' ? 0.8 : difficulty === 'intermediate' ? 0.3 : 0
  let best: { game: SchafkopfGame; margin: number } | null = null
  for (const game of options) {
    const need = game.type === 'sau' ? 5 : game.type === 'wenz' ? 6.4 : 7.4
    const margin = strength(hand, game) - need - extra
    if (margin < 0) continue
    // Higher games first when strong enough.
    const score = margin + (game.type === 'sau' ? 0 : 1.5)
    if (!best || score > best.margin) best = { game, margin: score }
  }
  if (!best) return null
  if (best.game.type === 'sau') {
    // Call the ace of the suit where we hold the fewest cards.
    const suits = callableSuits(hand)
    const count = (s: Suit) => hand.filter((c) => c.suit === s && !isTrump(c, best!.game)).length
    const suit = [...suits].sort((a, b) => count(a) - count(b))[0]!
    return { type: 'sau', suit } as SchafkopfGame
  }
  return best.game
}

export function createSchafkopfAgent(
  difficulty: Difficulty,
): AiAgent<SchafkopfView, SchafkopfAction> {
  return {
    name: `Schafkopf (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const me = view.turn
      const hand = view.hand
      if (view.phase === 'bidding') {
        const options = legalActions.flatMap((a) => (a.type === 'announce' ? [a.game] : []))
        const game = chooseGame(view, options, difficulty)
        return game ? { type: 'announce', game } : { type: 'pass' }
      }
      const game = view.game!
      const plays = legalActions.flatMap((a) => (a.type === 'play' ? [a] : []))
      if (difficulty === 'beginner' && rng.next() < 0.35) return rng.pick(plays)
      const cards = plays.map((p) => hand.find((c) => c.id === p.cardId)!)
      const asPlay = (c: SuitedCard) => plays[cards.indexOf(c)]!
      const value = (c: SuitedCard) => {
        const t = trumpRank(c, game)
        return t >= 0 ? 1000 + t : cardPoints(c)
      }
      const lowest = (list: SuitedCard[]) =>
        [...list].sort((a, b) => value(a) - value(b) || cardPoints(a) - cardPoints(b))[0]!
      const richest = (list: SuitedCard[]) =>
        [...list].sort((a, b) => cardPoints(b) - cardPoints(a) || value(a) - value(b))[0]!

      const declarerSide = me === view.player || me === view.partner
      // Who is on my side, as far as I know.
      const side = (p: PlayerId) => p === view.player || p === view.partner
      const friend = (p: PlayerId) => {
        if (p === me) return true
        // Solo/Wenz: everybody knows the parties. Sauspiel: only once the partner is known.
        if (game.type === 'sau' && view.partner === null) return false
        return side(p) === side(me)
      }

      if (view.trick.length === 0) {
        const trumps = cards.filter((c) => isTrump(c, game))
        if (declarerSide && trumps.length >= 2)
          return asPlay([...trumps].sort((a, b) => value(b) - value(a))[0]!)
        // Defenders in a Sauspiel look for the partner by leading the called suit.
        if (!declarerSide && game.type === 'sau') {
          const called = cards.filter((c) => c.suit === game.suit && !isTrump(c, game))
          if (called.length > 0) return asPlay(lowest(called))
        }
        const aces = cards.filter((c) => !isTrump(c, game) && c.rank === 'A')
        if (aces.length > 0) return asPlay(aces[0]!)
        const plain = cards.filter((c) => !isTrump(c, game))
        return asPlay(lowest(plain.length > 0 ? plain : cards))
      }

      const current = trickWinner(view.trick, game)
      const lastToPlay = view.trick.length === 3
      const wins = (c: SuitedCard) =>
        trickWinner([...view.trick, { player: me, card: c }], game) === me
      const winners = cards.filter(wins)
      if (current !== me && friend(current)) {
        const plain = cards.filter((c) => !isTrump(c, game))
        return asPlay(lastToPlay ? richest(plain.length > 0 ? plain : cards) : lowest(cards))
      }
      const trickPoints = view.trick.reduce((s, t) => s + cardPoints(t.card), 0)
      if (winners.length > 0 && (trickPoints >= 10 || lastToPlay || difficulty === 'expert')) {
        const sorted = [...winners].sort((a, b) => value(a) - value(b))
        return asPlay(sorted[0]!)
      }
      return asPlay(lowest(cards))
    },
  }
}
