import { nextPlayer, rotateTo } from './seating'

const order = ['a', 'b', 'c', 'd']

describe('seating', () => {
  it('moves clockwise and counter-clockwise with wrap-around', () => {
    expect(nextPlayer(order, 'a')).toBe('b')
    expect(nextPlayer(order, 'd')).toBe('a')
    expect(nextPlayer(order, 'a', -1)).toBe('d')
    expect(nextPlayer(order, 'b', 2)).toBe('d')
    expect(nextPlayer(order, 'b', -6)).toBe('d')
  })

  it('rotates the order to a starting player', () => {
    expect(rotateTo(order, 'c')).toEqual(['c', 'd', 'a', 'b'])
  })

  it('rejects unknown players', () => {
    expect(() => nextPlayer(order, 'x')).toThrow()
    expect(() => rotateTo(order, 'x')).toThrow()
  })
})
