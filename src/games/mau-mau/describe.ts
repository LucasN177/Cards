import type { PlayerId } from '@/engine'
import { cardName, suitName } from '@/features/cards/cardFaces'
import type { DeckStyle } from '@/stores/settingsStore'
import type { MauMauEvent, MauMauView } from './mauMau'

interface Names {
  readonly humanId: PlayerId
  readonly nameOf: (id: PlayerId) => string
  readonly style: DeckStyle
}

/** Text for what just happened, e.g. "Anna spielt Herz 7 · Ben muss 2 Karten ziehen". */
export function describeEvents(events: readonly MauMauEvent[], { humanId, nameOf, style }: Names) {
  const you = (id: PlayerId) => id === humanId
  return events
    .map((event) => {
      switch (event.type) {
        case 'played': {
          const card = cardName(event.card, style)
          const text = you(event.player)
            ? `Du spielst ${card}`
            : `${nameOf(event.player)} spielt ${card}`
          if (!event.wish) return text
          const wish = suitName(event.wish, style)
          return you(event.player)
            ? `${text} und wünschst dir ${wish}`
            : `${text} und wünscht sich ${wish}`
        }
        case 'drew': {
          const what = event.count === 1 ? 'eine Karte' : `${event.count} Karten`
          if (event.count === 0)
            return you(event.player)
              ? 'Du kannst nicht ziehen'
              : `${nameOf(event.player)} kann nicht ziehen`
          return you(event.player) ? `Du ziehst ${what}` : `${nameOf(event.player)} zieht ${what}`
        }
        case 'passed':
          return you(event.player) ? 'Du passt' : `${nameOf(event.player)} passt`
        case 'skipped':
          return you(event.player) ? 'Du musst aussetzen' : `${nameOf(event.player)} muss aussetzen`
        case 'reversed':
          return 'Richtungswechsel'
        case 'reshuffled':
          return 'Ablagestapel wird neu gemischt'
      }
    })
    .join(' · ')
}

/** What the human player can do right now. */
export function describeTurn(view: MauMauView, myTurn: boolean, nameOf: (id: PlayerId) => string) {
  if (view.winner) return ''
  if (!myTurn) return `${nameOf(view.turn)} ist am Zug …`
  if (view.pendingDraw > 0) {
    return view.options.stackSevens
      ? `Lege eine 7 oder ziehe ${view.pendingDraw} Karten`
      : `Du musst ${view.pendingDraw} Karten ziehen`
  }
  if (view.drawnCardId) return 'Spiele die gezogene Karte oder tippe auf „Weiter“'
  return 'Du bist dran'
}
