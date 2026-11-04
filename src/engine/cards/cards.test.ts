import {
  cardColor,
  createDeck,
  deal,
  DECKS,
  type DeckName,
  isJoker,
  jokerCard,
  parseCard,
  parseCards,
  ranksFrom,
  suitedCard,
} from '.'

describe('card model', () => {
  it('builds stable ids', () => {
    expect(suitedCard('Q', 'hearts').id).toBe('QH')
    expect(suitedCard('10', 'spades').id).toBe('10S')
    expect(suitedCard('A', 'clubs', 1).id).toBe('AC:1')
    expect(jokerCard('red').id).toBe('JKR')
    expect(jokerCard('black', 2).id).toBe('JKB:2')
  })

  it('parses card codes back into cards', () => {
    expect(parseCard('QH')).toEqual(suitedCard('Q', 'hearts'))
    expect(parseCard('10D:1')).toEqual(suitedCard('10', 'diamonds', 1))
    expect(parseCard('JKB')).toEqual(jokerCard('black'))
    expect(parseCards(' AS  7C ').map((c) => c.id)).toEqual(['AS', '7C'])
  })

  it.each(['', 'Q', '1H', '11S', 'QX', 'JK', 'QH:x'])('rejects invalid code %j', (code) => {
    expect(() => parseCard(code)).toThrow()
  })

  it('knows card colors', () => {
    expect(cardColor(parseCard('KH'))).toBe('red')
    expect(cardColor(parseCard('KC'))).toBe('black')
    expect(cardColor(parseCard('JKR'))).toBe('red')
  })

  it('lists ranks from a lowest rank', () => {
    expect(ranksFrom('9')).toEqual(['9', '10', 'J', 'Q', 'K', 'A'])
  })
})

describe('decks', () => {
  const expectedSizes: Record<DeckName, number> = {
    standard52: 52,
    short36: 36,
    piquet32: 32,
    short24: 24,
    doppelkopf48: 48,
    doppelkopf40: 40,
    canasta108: 108,
    romme110: 110,
  }

  it.each(Object.keys(DECKS) as DeckName[])('%s has the right size and unique ids', (name) => {
    const deck = createDeck(name)
    expect(deck).toHaveLength(expectedSizes[name])
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })

  it('alternates joker colors', () => {
    const jokers = createDeck('romme110').filter(isJoker)
    expect(jokers.map((j) => j.id)).toEqual(['JKR', 'JKB', 'JKR:1', 'JKB:1', 'JKR:2', 'JKB:2'])
  })

  it('supports custom specs', () => {
    const deck = createDeck({ ranks: ['A'], suits: ['hearts', 'spades'], copies: 2 })
    expect(deck.map((c) => c.id)).toEqual(['AH', 'AS', 'AH:1', 'AS:1'])
  })
})

describe('deal', () => {
  it('deals in rotation and keeps the rest', () => {
    const { hands, rest } = deal([1, 2, 3, 4, 5, 6, 7], 3, 2)
    expect(hands).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ])
    expect(rest).toEqual([7])
  })

  it('refuses to deal more cards than available', () => {
    expect(() => deal([1, 2, 3], 2, 2)).toThrow(RangeError)
  })
})
