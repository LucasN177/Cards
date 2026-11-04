import { GameRegistry } from '@/engine'
import { highCardGame } from '@/engine/testing/highCardGame'
import { CATALOG, findCatalogGame, listCatalog } from './catalog'

describe('catalog', () => {
  it('has unique ids', () => {
    expect(new Set(CATALOG.map((g) => g.id)).size).toBe(CATALOG.length)
  })

  it('marks only registered games as playable', () => {
    const registry = new GameRegistry()
    expect(listCatalog(registry).every((g) => g.definition === undefined)).toBe(true)
  })

  it('adds registered games without an entry to the development category', () => {
    const registry = new GameRegistry()
    registry.register(highCardGame)
    const game = findCatalogGame('high-card', registry)
    expect(game).toMatchObject({ category: 'development', definition: highCardGame })
    expect(listCatalog(registry)).toHaveLength(CATALOG.length + 1)
  })
})
