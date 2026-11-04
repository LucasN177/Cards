import {
  type Card,
  jokerCard,
  type Rank,
  RANKS,
  ranksFrom,
  type Suit,
  SUITS,
  suitedCard,
} from './card'

export interface DeckSpec {
  readonly ranks: readonly Rank[]
  readonly suits?: readonly Suit[]
  /** How many copies of each suited card (e.g. 2 for Doppelkopf, Rommé, Canasta). Default 1. */
  readonly copies?: number
  /** Number of jokers, alternating red and black. Default 0. */
  readonly jokers?: number
}

/** Common decks used by the planned games. */
export const DECKS = {
  /** Poker, Blackjack, Patience, Hearts, Spades, Bridge, Crazy Eights, Gin Rummy, Cribbage … */
  standard52: { ranks: RANKS },
  /** Durak */
  short36: { ranks: ranksFrom('6') },
  /** Skat, Schafkopf, Mau-Mau, Schwimmen */
  piquet32: { ranks: ranksFrom('7') },
  /** Sechsundsechzig, Euchre */
  short24: { ranks: ranksFrom('9') },
  /** Doppelkopf (with nines) */
  doppelkopf48: { ranks: ranksFrom('9'), copies: 2 },
  /** Doppelkopf without nines */
  doppelkopf40: { ranks: ranksFrom('10'), copies: 2 },
  /** Canasta */
  canasta108: { ranks: RANKS, copies: 2, jokers: 4 },
  /** Rommé */
  romme110: { ranks: RANKS, copies: 2, jokers: 6 },
} as const satisfies Record<string, DeckSpec>

export type DeckName = keyof typeof DECKS

/** Builds a deck in a stable, unshuffled order. */
export function createDeck(spec: DeckSpec | DeckName): Card[] {
  const resolved: DeckSpec = typeof spec === 'string' ? DECKS[spec] : spec
  const { ranks, suits = SUITS, copies = 1, jokers = 0 } = resolved
  const cards: Card[] = []
  for (let copy = 0; copy < copies; copy++) {
    for (const suit of suits) {
      for (const rank of ranks) cards.push(suitedCard(rank, suit, copy))
    }
  }
  for (let i = 0; i < jokers; i++) {
    cards.push(jokerCard(i % 2 === 0 ? 'red' : 'black', Math.floor(i / 2)))
  }
  return cards
}
