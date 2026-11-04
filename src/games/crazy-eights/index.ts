import { defineGame } from '@/engine'
import {
  type MauMauAction,
  mauMauGame,
  type MauMauOptions,
  type MauMauState,
  type MauMauView,
} from '@/games/mau-mau'

/**
 * Crazy Eights shares its rules engine with Mau-Mau: 52 cards, the eight is wild, players draw
 * until a card fits, and optional special cards (two, queen, ace).
 */
export const DEFAULT_CRAZY_EIGHTS_OPTIONS: MauMauOptions = {
  handSize: 0,
  sevenDrawsTwo: false,
  stackSevens: true,
  eightSkips: false,
  nineReverses: false,
  jackOnJack: true,
  deck: 'standard52',
  wildRank: '8',
  drawTwoRank: '2',
  skipRank: 'Q',
  reverseRank: 'A',
  drawUntilPlayable: true,
  scoring: 'crazyEights',
}

export const crazyEightsGame = defineGame<MauMauState, MauMauAction, MauMauOptions, MauMauView>({
  ...mauMauGame,
  id: 'crazy-eights',
  name: 'Crazy Eights',
  players: { min: 2, max: 7 },
  defaultOptions: DEFAULT_CRAZY_EIGHTS_OPTIONS,
  optionFields: [
    {
      type: 'choice',
      key: 'handSize',
      label: 'Karten pro Spieler',
      description: 'Automatisch: sieben Karten zu zweit, sonst fünf.',
      choices: [
        { value: 0, label: 'Automatisch' },
        { value: 5, label: '5' },
        { value: 7, label: '7' },
      ],
    },
    {
      type: 'boolean',
      key: 'drawUntilPlayable',
      label: 'Ziehen, bis es passt',
      description: 'Wer nicht kann, zieht so lange, bis eine passende Karte kommt.',
    },
    {
      type: 'boolean',
      key: 'jackOnJack',
      label: '8 auf 8',
      description: 'Eine 8 darf auch auf eine 8 gelegt werden.',
    },
    {
      type: 'boolean',
      key: 'sevenDrawsTwo',
      label: '2 – Zwei ziehen',
      description: 'Der nächste Spieler muss zwei Karten ziehen.',
    },
    {
      type: 'boolean',
      key: 'stackSevens',
      label: '2 auf 2',
      description: 'Eine 2 kann mit einer 2 beantwortet werden, die Strafe addiert sich.',
    },
    {
      type: 'boolean',
      key: 'eightSkips',
      label: 'Dame – Aussetzen',
      description: 'Der nächste Spieler wird übersprungen.',
    },
    {
      type: 'boolean',
      key: 'nineReverses',
      label: 'Ass – Richtungswechsel',
      description: 'Die Spielrichtung dreht sich um.',
    },
  ],
  statFields: [
    { key: 'cardsPlayed', label: 'Gespielte Karten' },
    { key: 'cardsDrawn', label: 'Gezogene Karten' },
    { key: 'jacksPlayed', label: 'Achten gespielt' },
    { key: 'penaltyDraws', label: 'Strafkarten gezogen' },
  ],
})
