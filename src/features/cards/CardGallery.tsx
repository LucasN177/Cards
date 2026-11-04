import { createDeck } from '@/engine'
import { PlayingCard } from './PlayingCard'

/** Dev-only overview of all card faces (route `#/dev/cards`). */
export function CardGallery() {
  const cards = [...createDeck('standard52'), ...createDeck({ ranks: [], jokers: 2 })]
  return (
    <div className="flex card-table flex-wrap gap-2 rounded-xl p-4">
      {cards.map((card) => (
        <PlayingCard key={card.id} card={card} />
      ))}
      <PlayingCard />
    </div>
  )
}
