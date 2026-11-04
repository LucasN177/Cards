import { type AnyGameDefinition, gameRegistry } from '@/engine'

export type GameCategory = 'classic' | 'german' | 'strategic' | 'development'

export const CATEGORY_LABELS: Readonly<Record<GameCategory, string>> = {
  classic: 'Klassiker',
  german: 'Deutsche Kartenspiele',
  strategic: 'Taktik & Strategie',
  development: 'Entwicklung',
}

export interface CatalogEntry {
  readonly id: string
  readonly name: string
  readonly category: GameCategory
  readonly description: string
  readonly players: { readonly min: number; readonly max: number }
}

/** Every game on the roadmap. An entry becomes playable once its definition is registered. */
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'texas-holdem',
    name: "Texas Hold'em",
    category: 'classic',
    description: 'Poker mit zwei verdeckten und fünf offenen Karten.',
    players: { min: 2, max: 9 },
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    category: 'classic',
    description: 'Komm so nah wie möglich an 21, ohne dich zu überkaufen.',
    players: { min: 1, max: 1 },
  },
  {
    id: 'klondike',
    name: 'Solitär',
    category: 'classic',
    description: 'Die klassische Patience: alle Karten auf die Ablagestapel.',
    players: { min: 1, max: 1 },
  },
  {
    id: 'spider',
    name: 'Spider Solitär',
    category: 'classic',
    description: 'Bilde absteigende Folgen von König bis Ass.',
    players: { min: 1, max: 1 },
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    category: 'classic',
    description: 'Patience mit vier freien Zellen – fast jedes Spiel ist lösbar.',
    players: { min: 1, max: 1 },
  },
  {
    id: 'mau-mau',
    name: 'Mau-Mau',
    category: 'classic',
    description: 'Farbe oder Wert bedienen und als Erster alle Karten loswerden.',
    players: { min: 2, max: 6 },
  },
  {
    id: 'crazy-eights',
    name: 'Crazy Eights',
    category: 'classic',
    description: 'Der amerikanische Verwandte von Mau-Mau.',
    players: { min: 2, max: 7 },
  },
  {
    id: 'hearts',
    name: 'Hearts',
    category: 'classic',
    description: 'Stichspiel: Vermeide Herzen und die Pik-Dame.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'spades',
    name: 'Spades',
    category: 'classic',
    description: 'Partnerstichspiel mit Ansagen, Pik ist immer Trumpf.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'bridge',
    name: 'Bridge',
    category: 'classic',
    description: 'Das Partnerspiel mit Reizung und Gegenspiel.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'skat',
    name: 'Skat',
    category: 'german',
    description: 'Reizen, Skat aufnehmen und als Alleinspieler gewinnen.',
    players: { min: 3, max: 3 },
  },
  {
    id: 'doppelkopf',
    name: 'Doppelkopf',
    category: 'german',
    description: 'Re gegen Kontra mit doppeltem Blatt – inklusive Regelvarianten.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'schafkopf',
    name: 'Schafkopf',
    category: 'german',
    description: 'Bayerisches Stichspiel mit Rufspiel, Wenz und Solo.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'schwimmen',
    name: 'Schwimmen (31)',
    category: 'german',
    description: 'Tausche Karten und sammle 31 Punkte in einer Farbe.',
    players: { min: 2, max: 9 },
  },
  {
    id: 'durak',
    name: 'Durak',
    category: 'german',
    description: 'Angreifen, verteidigen – wer übrig bleibt, ist der Durak.',
    players: { min: 2, max: 6 },
  },
  {
    id: 'romme',
    name: 'Rommé',
    category: 'german',
    description: 'Sätze und Folgen auslegen, als Erster fertig werden.',
    players: { min: 2, max: 6 },
  },
  {
    id: 'canasta',
    name: 'Canasta',
    category: 'german',
    description: 'Partnerspiel mit Meldungen und Canastas aus sieben Karten.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'gin-rummy',
    name: 'Gin Rummy',
    category: 'strategic',
    description: 'Rommé für zwei: Kombinationen bilden und klopfen.',
    players: { min: 2, max: 2 },
  },
  {
    id: 'cribbage',
    name: 'Cribbage',
    category: 'strategic',
    description: 'Punkte zählen auf dem Cribbage-Brett.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'euchre',
    name: 'Euchre',
    category: 'strategic',
    description: 'Schnelles Partnerstichspiel mit 24 Karten.',
    players: { min: 4, max: 4 },
  },
  {
    id: 'president',
    name: 'President',
    category: 'strategic',
    description: 'Werde Präsident – oder lande ganz unten.',
    players: { min: 3, max: 7 },
  },
  {
    id: 'wizard',
    name: 'Wizard',
    category: 'strategic',
    description: 'Sage deine Stiche jede Runde genau voraus.',
    players: { min: 3, max: 6 },
  },
  {
    id: 'sechsundsechzig',
    name: 'Sechsundsechzig',
    category: 'strategic',
    description: 'Zweierspiel: Erreiche als Erster 66 Augen.',
    players: { min: 2, max: 2 },
  },
]

export interface CatalogGame extends CatalogEntry {
  /** Registered definition, or undefined while the game is still on the roadmap. */
  readonly definition: AnyGameDefinition | undefined
}

/** Catalog entries plus registered games without an entry (e.g. dev-only games). */
export function listCatalog(registry = gameRegistry): CatalogGame[] {
  const known = CATALOG.map((entry) => ({ ...entry, definition: registry.get(entry.id) }))
  const extra = registry
    .list()
    .filter((game) => !CATALOG.some((entry) => entry.id === game.id))
    .map((game) => ({
      id: game.id,
      name: game.name,
      category: 'development' as const,
      description: 'Test-Spiel für die Engine (nur im Entwicklungsmodus).',
      players: game.players,
      definition: game,
    }))
  return [...known, ...extra]
}

export function findCatalogGame(id: string, registry = gameRegistry): CatalogGame | undefined {
  return listCatalog(registry).find((game) => game.id === id)
}
