/**
 * Card model.
 *
 * Internally every deck uses the French suits. German-suited decks (Eichel, Grün, Herz, Schellen)
 * map 1:1 onto them (clubs, spades, hearts, diamonds) and are purely a rendering style.
 */

export const SUITS = ['clubs', 'spades', 'hearts', 'diamonds'] as const
export type Suit = (typeof SUITS)[number]

/** Ranks in ascending "natural" order. Games define their own ranking on top of this. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Rank = (typeof RANKS)[number]

export type CardColor = 'red' | 'black'

/** Unique within a deck, e.g. `QH`, `10S`, `QH:1` (second copy), `JKR` (red joker). */
export type CardId = string

export interface SuitedCard {
  readonly id: CardId
  readonly kind: 'suited'
  readonly suit: Suit
  readonly rank: Rank
}

export interface JokerCard {
  readonly id: CardId
  readonly kind: 'joker'
  readonly color: CardColor
  /** Special jokers of some games: Wizard's wizards (Zauberer) and jesters (Narren). */
  readonly face?: SpecialFace
}

export type SpecialFace = 'wizard' | 'jester'

export type Card = SuitedCard | JokerCard

export const SUIT_COLOR: Readonly<Record<Suit, CardColor>> = {
  clubs: 'black',
  spades: 'black',
  hearts: 'red',
  diamonds: 'red',
}

const SUIT_CODE: Readonly<Record<Suit, string>> = {
  clubs: 'C',
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
}

const SUIT_BY_CODE: Readonly<Record<string, Suit>> = {
  C: 'clubs',
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
}

const copySuffix = (copy: number) => (copy === 0 ? '' : `:${copy}`)

export function suitedCard(rank: Rank, suit: Suit, copy = 0): SuitedCard {
  return { id: `${rank}${SUIT_CODE[suit]}${copySuffix(copy)}`, kind: 'suited', suit, rank }
}

export function jokerCard(color: CardColor, copy = 0): JokerCard {
  return { id: `JK${color === 'red' ? 'R' : 'B'}${copySuffix(copy)}`, kind: 'joker', color }
}

/** A wizard (`Z1` … `Z4`) or jester (`N1` … `N4`) for Wizard. */
export function specialCard(face: SpecialFace, number: number): JokerCard {
  return {
    id: `${face === 'wizard' ? 'Z' : 'N'}${number}`,
    kind: 'joker',
    color: face === 'wizard' ? 'red' : 'black',
    face,
  }
}

export const isWizard = (card: Card): card is JokerCard =>
  card.kind === 'joker' && card.face === 'wizard'
export const isJester = (card: Card): card is JokerCard =>
  card.kind === 'joker' && card.face === 'jester'

const CARD_CODE = /^(?:(10|[2-9JQKA])([CSHD])|JK([RB])|([ZN])(\d))(?::(\d+))?$/

/** Parses a card code such as `QH`, `10S`, `AS:1`, `JKR` or `Z1` (wizard) / `N1` (jester). Handy for tests and fixtures. */
export function parseCard(code: string): Card {
  const match = CARD_CODE.exec(code)
  if (!match) throw new Error(`Invalid card code: "${code}"`)
  const [, rank, suitCode, jokerColor, special, number, copy] = match
  const copyIndex = copy ? Number(copy) : 0
  if (special) return specialCard(special === 'Z' ? 'wizard' : 'jester', Number(number))
  if (jokerColor) return jokerCard(jokerColor === 'R' ? 'red' : 'black', copyIndex)
  return suitedCard(rank as Rank, SUIT_BY_CODE[suitCode!]!, copyIndex)
}

/** Parses a space-separated list of card codes, e.g. `"QH 10S JKR"`. */
export function parseCards(codes: string): Card[] {
  return codes.trim().split(/\s+/).filter(Boolean).map(parseCard)
}

export function isSuited(card: Card): card is SuitedCard {
  return card.kind === 'suited'
}

export function isJoker(card: Card): card is JokerCard {
  return card.kind === 'joker'
}

export function cardColor(card: Card): CardColor {
  return card.kind === 'joker' ? card.color : SUIT_COLOR[card.suit]
}

/** All ranks from `lowest` up to the ace, e.g. `ranksFrom('7')` → 7, 8, 9, 10, J, Q, K, A. */
export function ranksFrom(lowest: Rank): Rank[] {
  return RANKS.slice(RANKS.indexOf(lowest))
}
