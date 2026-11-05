import type { AiAgent, Difficulty, PlayerId, SuitedCard } from '@/engine'
import {
  type Contract,
  cardPoints,
  type DoppelkopfAction,
  type DoppelkopfView,
  isTrump,
  type SoloKind,
  suitOf,
  trickWinner,
  trumpRank,
} from './doppelkopf'

/** Strength of a hand for a contract: high trumps, many trumps and plain aces. */
export function handStrength(hand: readonly SuitedCard[], contract: Contract): number {
  let s = 0
  for (const c of hand) {
    const t = trumpRank(c, contract)
    if (t >= 0) s += t >= 90 ? 1.3 : t >= 80 ? 1 : 0.7
    else if (c.rank === 'A') s += 0.8
  }
  return s
}

function chooseSolo(hand: readonly SuitedCard[], difficulty: Difficulty): SoloKind | null {
  if (difficulty === 'beginner') return null
  const kinds: SoloKind[] = ['queens', 'jacks', 'clubs', 'spades', 'hearts', 'diamonds']
  let best: { kind: SoloKind; s: number } | null = null
  for (const kind of kinds) {
    const contract: Contract = { type: 'solo', kind, player: '' }
    const trumps = hand.filter((c) => isTrump(c, contract)).length
    const s = handStrength(hand, contract) + trumps * 0.3
    if (!best || s > best.s) best = { kind, s }
  }
  const needed = hand.length >= 12 ? 14.5 : 12.3
  return best && best.s >= needed + (difficulty === 'expert' ? 0 : 1) ? best.kind : null
}

export function createDoppelkopfAgent(
  difficulty: Difficulty,
): AiAgent<DoppelkopfView, DoppelkopfAction> {
  return {
    name: `Doppelkopf (${difficulty})`,
    chooseAction({ view, legalActions, rng }) {
      const hand = view.hand
      if (view.phase === 'reservation') {
        const solo = chooseSolo(hand, difficulty)
        return solo ? { type: 'solo', kind: solo } : { type: 'healthy' }
      }
      const me = view.turn
      const contract = view.contract
      const announce = legalActions.find((a) => a.type === 'announce')
      // Announce Re/Kontra with a strong hand (once); further absagen only for experts with a big lead.
      if (announce?.type === 'announce' && difficulty !== 'beginner') {
        const strong = handStrength(hand, contract) >= (hand.length >= 11 ? 11 : 9.5)
        if (announce.level === 0 && strong) return announce
      }

      const plays = legalActions.flatMap((a) => (a.type === 'play' ? [a] : []))
      if (difficulty === 'beginner' && rng.next() < 0.35) return rng.pick(plays)
      const cards = plays.map((p) => hand.find((c) => c.id === p.cardId)!)
      const asPlay = (c: SuitedCard) => plays[cards.indexOf(c)]!
      const value = (c: SuitedCard) => {
        const t = trumpRank(c, contract)
        return t >= 0 ? 1000 + t : cardPoints(c)
      }
      const lowest = (list: SuitedCard[]) =>
        [...list].sort((a, b) => value(a) - value(b) || cardPoints(a) - cardPoints(b))[0]!
      const richest = (list: SuitedCard[]) =>
        [...list].sort((a, b) => cardPoints(b) - cardPoints(a) || value(a) - value(b))[0]!

      const friend = (p: PlayerId) => p !== me && view.knownParties[p] === view.myParty
      const wins = (c: SuitedCard) =>
        trickWinner([...view.trick, { player: me, card: c }], contract) === me
      const winners = cards.filter(wins)
      const lastToPlay = view.trick.length === 3

      if (view.trick.length === 0) {
        // Lead a plain ace of a suit nobody has played yet, otherwise the lowest plain card;
        // Re with many trumps pulls trumps.
        const played = new Set(view.played.map((c) => suitOf(c, contract)))
        const aces = cards.filter(
          (c) => !isTrump(c, contract) && c.rank === 'A' && !played.has(c.suit),
        )
        if (aces.length > 0) return asPlay(aces[0]!)
        const trumps = cards.filter((c) => isTrump(c, contract))
        if (view.myParty === 're' && trumps.length >= cards.length / 2 && difficulty !== 'beginner')
          return asPlay([...trumps].sort((a, b) => value(b) - value(a))[0]!)
        const plain = cards.filter((c) => !isTrump(c, contract))
        return asPlay(lowest(plain.length > 0 ? plain : cards))
      }

      const current = trickWinner(view.trick, contract)
      if (friend(current)) {
        // Partner has the trick: add points when nobody unknown comes after us.
        const safe = lastToPlay || difficulty === 'beginner'
        const plain = cards.filter((c) => !isTrump(c, contract))
        if (safe) return asPlay(richest(plain.length > 0 ? plain : cards))
        return asPlay(lowest(cards))
      }
      const trickPoints = view.trick.reduce((s, t) => s + cardPoints(t.card), 0)
      if (winners.length > 0 && (trickPoints >= 10 || lastToPlay || difficulty === 'expert')) {
        // The cheapest card that wins – on the last seat, otherwise a solid one.
        const sorted = [...winners].sort((a, b) => value(a) - value(b))
        return asPlay(
          lastToPlay ? sorted[0]! : (sorted.find((c) => value(c) >= 1080) ?? sorted[0]!),
        )
      }
      return asPlay(lowest(cards))
    },
  }
}
