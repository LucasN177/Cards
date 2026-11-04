import { formatDuration, overview, statsByGame, statsForGame, tally } from './aggregate'
import { addMatch, clearMatches, listMatches } from './statsDb'
import { makeRecord } from '@/test/fixtures'
import type { Outcome } from './types'

const results = (...outcomes: Outcome[]) =>
  outcomes.map((outcome) =>
    makeRecord({
      outcome,
      placement: outcome === 'win' ? 1 : 2,
      humanScore: outcome === 'win' ? 0 : 10,
    }),
  )

describe('aggregation', () => {
  it('counts wins, draws and losses', () => {
    expect(tally(results('win', 'loss', 'draw', 'win'))).toEqual({
      games: 4,
      wins: 2,
      draws: 1,
      losses: 1,
      winRate: 0.5,
    })
    expect(tally([]).winRate).toBeNull()
  })

  it('finds the longest and the current streak', () => {
    const totals = overview(results('win', 'win', 'win', 'loss', 'win', 'win'))
    expect(totals.longestWinStreak).toBe(3)
    expect(totals.currentStreak).toEqual({ outcome: 'win', length: 2 })
    expect(totals.playTimeMs).toBe(6 * 120_000)
    expect(overview([]).currentStreak).toBeNull()
  })

  it('uses the lowest penalty as best score and splits by difficulty', () => {
    const records = [
      makeRecord({ humanScore: 0, outcome: 'win', durationMs: 90_000 }),
      makeRecord({ humanScore: 23, outcome: 'loss', placement: 2, difficulty: 'expert' }),
      makeRecord({ humanScore: 7, outcome: 'loss', placement: 3, difficulty: 'expert' }),
    ]
    const stats = statsForGame('mau-mau', records)
    expect(stats.bestScore).toBe(0)
    expect(stats.averagePlacement).toBe(2)
    expect(stats.fastestWinMs).toBe(90_000)
    expect(stats.byDifficulty.expert).toMatchObject({ games: 2, wins: 0, winRate: 0 })
    expect(stats.byDifficulty.beginner).toMatchObject({ games: 1, wins: 1 })
    expect(stats.statTotals).toEqual({ cardsPlayed: 15, cardsDrawn: 6 })
  })

  it('uses the highest score as best when more points are better', () => {
    const records = [
      makeRecord({ gameId: 'x', humanScore: 3, lowerScoreIsBetter: false }),
      makeRecord({ gameId: 'x', humanScore: 9, lowerScoreIsBetter: false }),
    ]
    expect(statsForGame('x', records).bestScore).toBe(9)
  })

  it('groups by game, most recently played first', () => {
    const records = [
      makeRecord({ gameId: 'a' }),
      makeRecord({ gameId: 'b' }),
      makeRecord({ gameId: 'a' }),
    ]
    expect(statsByGame(records).map((s) => [s.gameId, s.games])).toEqual([
      ['a', 2],
      ['b', 1],
    ])
  })

  it('formats durations for humans', () => {
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(12 * 60_000)).toBe('12 min')
    expect(formatDuration(185 * 60_000)).toBe('3 h 05 min')
    expect(formatDuration(null)).toBe('–')
  })
})

describe('stats database', () => {
  it('stores matches and lists them newest first', async () => {
    const first = makeRecord()
    const second = makeRecord({ outcome: 'loss' })
    await addMatch(first)
    await addMatch(second)
    const all = await listMatches()
    expect(all.map((r) => r.outcome)).toEqual(['loss', 'win'])
    expect(all[0]!.id).toBeDefined()

    await clearMatches()
    expect(await listMatches()).toEqual([])
  })
})
