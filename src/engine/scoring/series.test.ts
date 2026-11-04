import type { GameResult } from '../core/types'
import { isSeriesOver, seriesStandings, seriesWinners } from './series'

const penalty = (scores: Record<string, number>, winner: string): GameResult => ({
  scores,
  winners: [winner],
  lowerScoreIsBetter: true,
})
const points = (scores: Record<string, number>, winner: string): GameResult => ({
  scores,
  winners: [winner],
})

describe('series', () => {
  it('adds up penalty points; the lowest total wins', () => {
    const results = [penalty({ a: 0, b: 12 }, 'a'), penalty({ a: 30, b: 0 }, 'b')]
    expect(seriesStandings(['a', 'b'], results)).toEqual([
      { player: 'b', total: 12, roundsWon: 1 },
      { player: 'a', total: 30, roundsWon: 1 },
    ])
    expect(seriesWinners(['a', 'b'], results)).toEqual(['b'])
  })

  it('uses the highest total when more points are better', () => {
    const results = [points({ a: 5, b: 3 }, 'a'), points({ a: 1, b: 2 }, 'b')]
    expect(seriesWinners(['a', 'b'], results)).toEqual(['a'])
  })

  it('breaks ties by rounds won and reports real ties', () => {
    const tieOnPoints = [
      penalty({ a: 0, b: 10 }, 'a'),
      penalty({ a: 10, b: 0 }, 'b'),
      penalty({ a: 0, b: 0 }, 'a'),
    ]
    expect(seriesWinners(['a', 'b'], tieOnPoints)).toEqual(['a'])
    const realTie = [penalty({ a: 0, b: 10 }, 'a'), penalty({ a: 10, b: 0 }, 'b')]
    expect(seriesWinners(['a', 'b'], realTie)).toEqual(['a', 'b'])
  })

  it('ends after the configured number of rounds', () => {
    const one = [points({ a: 1 }, 'a')]
    expect(isSeriesOver({ rounds: 1 }, one)).toBe(true)
    expect(isSeriesOver({ rounds: 3 }, one)).toBe(false)
    expect(seriesWinners(['a'], [])).toEqual(['a'])
  })
})
