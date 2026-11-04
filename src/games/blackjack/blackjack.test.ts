import { type AiAgent, parseCards, type PlayerInfo, simulateGame, type SuitedCard } from '@/engine'
import {
  basicStrategy,
  type BlackjackAction,
  blackjackGame,
  type BlackjackOptions,
  type BlackjackState,
  type BlackjackView,
  DEFAULT_BLACKJACK_OPTIONS,
  handValue,
  STARTING_CHIPS,
} from './blackjack'

const rules = blackjackGame
const me: PlayerInfo = { id: 'me', name: 'Ich', kind: 'human' }
const cards = (codes: string) => parseCards(codes) as SuitedCard[]

/** A table at the betting stage whose shoe deals `codes` in order (player, dealer, player, dealer, …). */
function stacked(codes: string, options: Partial<BlackjackOptions> = {}): BlackjackState {
  const state = rules.setup({
    players: [me],
    options: { ...DEFAULT_BLACKJACK_OPTIONS, ...options },
    seed: 1,
  })
  // Keep the shoe big enough so no reshuffle happens; the stacked cards come first.
  return { ...state, shoe: [...state.shoe.slice(0, 200), ...cards(codes).reverse()] }
}

const play = (state: BlackjackState, ...actions: BlackjackAction[]) =>
  actions.reduce((s, a) => rules.applyAction(s, 'me', a), state)

describe('card values', () => {
  it('counts aces as 11 or 1 and knows soft hands', () => {
    expect(handValue(cards('AS 6H'))).toEqual({ total: 17, soft: true })
    expect(handValue(cards('AS 6H 9C'))).toEqual({ total: 16, soft: false })
    expect(handValue(cards('AS AH KC'))).toEqual({ total: 12, soft: false })
    expect(handValue(cards('KS QH'))).toEqual({ total: 20, soft: false })
  })
})

describe('a round', () => {
  it('pays 1:1 for a win and takes the bet for a loss', () => {
    // Player 10+9 = 19, dealer 10+7 = 17 stands.
    const won = play(stacked('10H 10S 9C 7D'), { type: 'bet', amount: 10 }, { type: 'stand' })
    expect(won.phase).toBe('settled')
    expect(won.hands[0]).toMatchObject({ outcome: 'win', payout: 10 })
    expect(won.chips).toBe(STARTING_CHIPS + 10)

    const lost = play(stacked('10H 10S 7C 9D'), { type: 'bet', amount: 10 }, { type: 'stand' })
    expect(lost.hands[0]).toMatchObject({ outcome: 'lose', payout: -10 })
    expect(lost.chips).toBe(STARTING_CHIPS - 10)
  })

  it('pays 3:2 for a blackjack and ends the round at once', () => {
    const state = play(stacked('AH 9S KC 7D'), { type: 'bet', amount: 10 })
    expect(state.phase).toBe('settled')
    expect(state.hands[0]).toMatchObject({ outcome: 'blackjack', payout: 15 })
    expect(state.chips).toBe(STARTING_CHIPS + 15)
  })

  it('returns the bet on a tie and when both have blackjack', () => {
    expect(
      play(stacked('10H 10S 8C 8D'), { type: 'bet', amount: 10 }, { type: 'stand' }).chips,
    ).toBe(STARTING_CHIPS)
    expect(play(stacked('AH AS KC QD'), { type: 'bet', amount: 10 }).hands[0]!.outcome).toBe('push')
  })

  it('loses immediately when busting; the dealer then does not draw', () => {
    const state = play(stacked('10H 10S 6C 6D 9H'), { type: 'bet', amount: 10 }, { type: 'hit' })
    expect(state.hands[0]).toMatchObject({ outcome: 'lose' })
    expect(state.dealer).toHaveLength(2)
  })

  it('lets the dealer draw to 17 and win against a bust dealer', () => {
    // Player 10+8 stands; dealer 10+6 draws K and busts.
    const state = play(stacked('10H 10S 8C 6D KH'), { type: 'bet', amount: 10 }, { type: 'stand' })
    expect(state.dealer).toHaveLength(3)
    expect(state.hands[0]!.outcome).toBe('win')
  })

  it('draws on a soft 17 only with that option', () => {
    const shoe = '10H AS 8C 6D 4H'
    const stands = play(stacked(shoe), { type: 'bet', amount: 10 }, { type: 'stand' })
    expect(stands.dealer).toHaveLength(2)
    const hits = play(
      stacked(shoe, { dealerHitsSoft17: true }),
      { type: 'bet', amount: 10 },
      { type: 'stand' },
    )
    expect(hits.dealer).toHaveLength(3)
  })

  it('doubles the bet for exactly one more card', () => {
    const state = play(stacked('6H 10S 5C 7D 10C'), { type: 'bet', amount: 10 }, { type: 'double' })
    expect(state.hands[0]).toMatchObject({ bet: 20, doubled: true, outcome: 'win', payout: 20 })
    expect(state.chips).toBe(STARTING_CHIPS + 20)
  })

  it('splits pairs into two hands; split aces get one card each', () => {
    const eights = play(
      stacked('8H 10S 8C 7D 3H 2S'),
      { type: 'bet', amount: 10 },
      { type: 'split' },
    )
    expect(eights.hands).toHaveLength(2)
    expect(eights.chips).toBe(STARTING_CHIPS - 20)
    expect(eights.hands.map((h) => h.cards.map((c) => c.id))).toEqual([
      ['8H', '3H'],
      ['8C', '2S'],
    ])

    const aces = play(stacked('AH 9S AC 7D KH QS'), { type: 'bet', amount: 10 }, { type: 'split' })
    // Both hands are finished at once; A+K from a split is 21 but not a blackjack.
    expect(aces.phase).toBe('settled')
    expect(aces.hands.map((h) => h.outcome)).toEqual(['win', 'win'])
    expect(aces.hands[0]!.payout).toBe(10)
  })

  it('hides the hole card until the player is done', () => {
    const state = play(stacked('10H 10S 9C 7D'), { type: 'bet', amount: 10 })
    const view = rules.playerView(state, 'me')
    expect(view.dealer[1]).toBeNull()
    expect(view.dealerValue).toBe(10)
  })
})

describe('the game', () => {
  it('ends after the chosen number of rounds or when you stop', () => {
    let state = stacked('10H 10S 9C 7D 10H 10S 9C 7D', { rounds: 5 })
    state = { ...state, round: 4 }
    state = play(state, { type: 'bet', amount: 10 }, { type: 'stand' }, { type: 'next' })
    expect(state.phase).toBe('over')
    expect(rules.result(state)).toMatchObject({
      winners: ['me'],
      scores: { me: STARTING_CHIPS + 10 },
    })

    const left = play(stacked(''), { type: 'leave' })
    expect(rules.isTerminal(left)).toBe(true)
    expect(rules.result(left).winners).toEqual([])
  })
})

describe('basic strategy', () => {
  const up = (code: string) => cards(code)[0]!
  const any = { canDouble: true, canSplit: true }
  it.each([
    ['AS AH', '6D', 'split'],
    ['8S 8H', '10D', 'split'],
    ['10S 10H', '6D', 'stand'],
    ['5S 6H', '9D', 'double'],
    ['5S 6H', 'AD', 'hit'],
    ['10S 6H', '7D', 'hit'],
    ['10S 6H', '5D', 'stand'],
    ['AS 7H', '9D', 'hit'],
    ['AS 7H', '7D', 'stand'],
    ['10S 2H', '4D', 'stand'],
  ] as const)('%s against %s: %s', (hand, dealer, move) => {
    expect(basicStrategy(cards(hand), up(dealer), any)).toBe(move)
  })

  it('hits instead of doubling when doubling is not possible', () => {
    expect(basicStrategy(cards('5S 6H'), up('9D'), { canDouble: false, canSplit: false })).toBe(
      'hit',
    )
  })
})

/** Plays basic strategy with a fixed bet; used to check that whole games run through. */
function strategyAgent(): AiAgent<BlackjackView, BlackjackAction> {
  return {
    name: 'basic',
    chooseAction({ view, legalActions }) {
      if (view.phase === 'betting')
        return legalActions.find((a) => a.type === 'bet') ?? { type: 'leave' }
      if (view.phase === 'settled') return { type: 'next' }
      return { type: view.hint ?? 'stand' }
    },
  }
}

describe('simulation', () => {
  it('plays many games with basic strategy without breaking the rules', async () => {
    for (let seed = 0; seed < 200; seed++) {
      const { session, result } = await simulateGame(blackjackGame, {
        players: [{ id: 'me', name: 'Ich', kind: 'ai' }],
        agents: { me: strategyAgent() },
        options: { rounds: 20, decks: seed % 2 ? 1 : 6 },
        seed,
      })
      const state = session.state
      expect(state.round).toBeLessThanOrEqual(20)
      expect(state.chips).toBeGreaterThanOrEqual(0)
      expect(result.scores['me']).toBe(state.chips)
    }
  })
})
