import { type AiAgent, type Difficulty, SUITS, type Suit, type SuitedCard } from '@/engine'
import {
  effectiveSuit,
  type EuchreAction,
  type EuchreView,
  isLeftBower,
  isRightBower,
  partnerOf,
  power,
  teamOf,
  trickWinner,
} from './euchre'

/** How strong a hand is with `trump`: bowers and trumps count most, plus side aces. */
export function handStrength(hand: readonly SuitedCard[], trump: Suit): number {
  let strength = 0
  for (const c of hand) {
    if (isRightBower(c, trump)) strength += 3
    else if (isLeftBower(c, trump)) strength += 2.5
    else if (c.suit === trump) strength += c.rank === 'A' ? 2 : c.rank === 'K' ? 1.5 : 1
    else if (c.rank === 'A') strength += 1
  }
  // Voids in side suits help to trump in.
  const sideSuits = new Set(
    hand.filter((c) => effectiveSuit(c, trump) !== trump).map((c) => c.suit),
  )
  strength += (3 - sideSuits.size) * 0.4
  return strength
}

/** The worst card to throw away: a low card of a short side suit. */
export function worstCard(hand: readonly SuitedCard[], trump: Suit): SuitedCard {
  const count = (s: Suit) => hand.filter((c) => effectiveSuit(c, trump) === s).length
  return [...hand].sort((a, b) => {
    const value = (c: SuitedCard) =>
      effectiveSuit(c, trump) === trump
        ? 100 + power(c, trump, trump)
        : (c.rank === 'A' ? 50 : 0) + power(c, trump, c.suit) * 2 + count(c.suit)
    return value(a) - value(b)
  })[0]!
}

export function createEuchreAgent(difficulty: Difficulty): AiAgent<EuchreView, EuchreAction> {
  const threshold = difficulty === 'beginner' ? 5 : difficulty === 'intermediate' ? 6 : 6.5
  return {
    name: `Euchre (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const me = view.turn
      const hand = view.hand
      const canAlone = (a: EuchreAction) =>
        legalActions.some((l) => JSON.stringify(l) === JSON.stringify(a))

      if (view.phase === 'bid1') {
        const trump = view.upcard.suit
        let strength = handStrength(hand, trump)
        const dealerTeam = teamOf(view.order, view.dealer) === teamOf(view.order, me)
        // The turned card goes to the dealer: good for the dealer's team, bad for the others.
        if (me === view.dealer) {
          const withUp = [...hand, view.upcard]
          const discard = worstCard(withUp, trump)
          strength = handStrength(
            withUp.filter((c) => c !== discard),
            trump,
          )
        } else
          strength += (dealerTeam ? 0.5 : -0.5) * (power(view.upcard, trump, trump) > 103 ? 2 : 1)
        if (difficulty === 'beginner') strength += rng.next() * 2 - 1
        if (strength >= threshold) {
          if (
            strength >= 11 &&
            difficulty !== 'beginner' &&
            canAlone({ type: 'order', alone: true })
          )
            return { type: 'order', alone: true }
          return { type: 'order' }
        }
        return { type: 'pass' }
      }

      if (view.phase === 'bid2') {
        const suits = SUITS.filter((s) => s !== view.upcard.suit)
        const best = suits
          .map((suit) => ({ suit, strength: handStrength(hand, suit) }))
          .sort((a, b) => b.strength - a.strength)[0]!
        const mustCall = !legalActions.some((a) => a.type === 'pass')
        if (best.strength >= threshold || mustCall) {
          if (
            best.strength >= 11 &&
            difficulty !== 'beginner' &&
            canAlone({ type: 'call', suit: best.suit, alone: true })
          )
            return { type: 'call', suit: best.suit, alone: true }
          return { type: 'call', suit: best.suit }
        }
        return { type: 'pass' }
      }

      const trump = view.trump!
      if (view.phase === 'discard') return { type: 'discard', cardId: worstCard(hand, trump).id }

      const plays = legalActions.flatMap((a) => (a.type === 'play' ? [a] : []))
      const cards = plays.map((p) => hand.find((c) => c.id === p.cardId)!)
      const asPlay = (c: SuitedCard) => plays[cards.indexOf(c)]!
      if (difficulty === 'beginner' && rng.next() < 0.35) return rng.pick(plays)

      const value = (c: SuitedCard) =>
        power(c, trump, effectiveSuit(c, trump)) + (effectiveSuit(c, trump) === trump ? 100 : 0)
      const lowest = (list: SuitedCard[]) => [...list].sort((a, b) => value(a) - value(b))[0]!
      const highest = (list: SuitedCard[]) => [...list].sort((a, b) => value(b) - value(a))[0]!
      const makers =
        view.maker !== null && teamOf(view.order, view.maker) === teamOf(view.order, me)

      if (view.trick.length === 0) {
        const trumps = cards.filter((c) => effectiveSuit(c, trump) === trump)
        // Makers pull trumps with the right bower; otherwise cash a side ace or lead low.
        if (makers && trumps.some((c) => isRightBower(c, trump))) return asPlay(highest(trumps))
        const aces = cards.filter((c) => c.rank === 'A' && effectiveSuit(c, trump) !== trump)
        if (aces.length > 0) return asPlay(aces[0]!)
        if (makers && trumps.length >= 2 && difficulty === 'expert') return asPlay(highest(trumps))
        const side = cards.filter((c) => effectiveSuit(c, trump) !== trump)
        return asPlay(lowest(side.length > 0 ? side : cards))
      }

      const current = trickWinner(view.trick, trump)
      const partner = partnerOf(view.order, me)
      const wins = (c: SuitedCard) =>
        trickWinner([...view.trick, { player: me, card: c }], trump) === me
      const winners = cards.filter(wins)
      const lastToPlay = view.trick.length === (view.sittingOut ? 2 : 3)
      if (current === partner) {
        // Partner already wins: only overtake when the partner's card is weak and others follow.
        const partnerCard = view.trick.find((t) => t.player === partner)!.card
        const strong = value(partnerCard) >= 104 || lastToPlay
        if (strong || winners.length === 0 || difficulty === 'beginner')
          return asPlay(lowest(cards))
      }
      if (winners.length > 0) return asPlay(lowest(winners))
      return asPlay(lowest(cards))
    },
  }
}
