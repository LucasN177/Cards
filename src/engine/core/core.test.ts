import { highCardGame } from '../testing/highCardGame'
import { deepEqual } from './equal'
import { GameRegistry } from './registry'

describe('deepEqual', () => {
  it.each([
    [1, 1, true],
    [{ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, true],
    [{ a: 1, b: undefined }, { a: 1 }, true],
    [{ a: 1 }, { a: 2 }, false],
    [[1, 2], [1, 2, 3], false],
    [[], {}, false],
    [null, {}, false],
    [{ a: { b: 'x' } }, { a: { b: 'x' } }, true],
  ])('deepEqual(%j, %j) → %s', (a, b, expected) => {
    expect(deepEqual(a, b)).toBe(expected)
  })
})

describe('GameRegistry', () => {
  it('registers, finds and lists games', () => {
    const registry = new GameRegistry()
    registry.register(highCardGame)
    expect(registry.get('high-card')).toBe(highCardGame)
    expect(registry.require('high-card')).toBe(highCardGame)
    expect(registry.list()).toEqual([highCardGame])
    expect(registry.get('missing')).toBeUndefined()
  })

  it('rejects duplicates and unknown ids', () => {
    const registry = new GameRegistry()
    registry.register(highCardGame)
    expect(() => registry.register(highCardGame)).toThrow(/already registered/)
    expect(() => registry.require('missing')).toThrow(/Unknown game/)
  })
})
