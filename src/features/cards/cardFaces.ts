import type { Card, Rank, Suit } from '@/engine'
import type { DeckStyle } from '@/stores/settingsStore'

const SUIT_NAMES: Readonly<Record<DeckStyle, Record<Suit, string>>> = {
  french: { clubs: 'Kreuz', spades: 'Pik', hearts: 'Herz', diamonds: 'Karo' },
  german: { clubs: 'Eichel', spades: 'Grün', hearts: 'Herz', diamonds: 'Schellen' },
}

const FACE_NAMES: Readonly<Record<DeckStyle, Partial<Record<Rank, string>>>> = {
  french: { J: 'Bube', Q: 'Dame', K: 'König', A: 'Ass' },
  german: { J: 'Unter', Q: 'Ober', K: 'König', A: 'Ass' },
}

const FACE_INDEX: Readonly<Record<DeckStyle, Partial<Record<Rank, string>>>> = {
  french: { J: 'B', Q: 'D', K: 'K', A: 'A' },
  german: { J: 'U', Q: 'O', K: 'K', A: 'A' },
}

/** Corner index shown on the card, e.g. `D` for a French queen, `O` for a German Ober. */
export function rankIndex(rank: Rank, style: DeckStyle): string {
  return FACE_INDEX[style][rank] ?? rank
}

export function suitName(suit: Suit, style: DeckStyle): string {
  return SUIT_NAMES[style][suit]
}

/** Accessible name, e.g. "Herz Dame" or "Eichel Ober". */
export function cardName(card: Card, style: DeckStyle): string {
  if (card.kind === 'joker') return card.color === 'red' ? 'Roter Joker' : 'Schwarzer Joker'
  return `${suitName(card.suit, style)} ${FACE_NAMES[style][card.rank] ?? card.rank}`
}

export const SUIT_FILL: Readonly<Record<DeckStyle, Record<Suit, string>>> = {
  french: { clubs: '#1f2937', spades: '#1f2937', hearts: '#d32f2f', diamonds: '#d32f2f' },
  german: { clubs: '#7a4a1e', spades: '#2e7d32', hearts: '#c62828', diamonds: '#d99a00' },
}
