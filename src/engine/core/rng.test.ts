import { randomSeed, Rng } from './rng'

const sample = (rng: Rng, n = 5) => Array.from({ length: n }, () => rng.nextUint32())

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    expect(sample(Rng.fromSeed(42))).toEqual(sample(Rng.fromSeed(42)))
    expect(sample(Rng.fromSeed(42))).not.toEqual(sample(Rng.fromSeed(43)))
  })

  it('continues the same sequence from a saved state', () => {
    const rng = Rng.fromSeed(7)
    sample(rng, 10)
    const saved = rng.state
    const expected = sample(rng)
    expect(sample(new Rng(saved))).toEqual(expected)
  })

  it('returns a state copy that is not affected by later draws', () => {
    const rng = Rng.fromSeed(1)
    const state = rng.state
    rng.next()
    expect(rng.state).not.toEqual(state)
  })

  it('keeps values in range', () => {
    const rng = Rng.fromSeed(123)
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = rng.int(6)
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true)
    }
  })

  it('rejects invalid bounds and empty picks', () => {
    const rng = Rng.fromSeed(1)
    expect(() => rng.int(0)).toThrow(RangeError)
    expect(() => rng.int(1.5)).toThrow(RangeError)
    expect(() => rng.pick([])).toThrow(RangeError)
  })

  it('shuffles into a permutation without touching the input', () => {
    const input = Array.from({ length: 52 }, (_, i) => i)
    const shuffled = Rng.fromSeed(99).shuffle(input)
    expect(shuffled).not.toEqual(input)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input)
    expect(input[0]).toBe(0)
    expect(Rng.fromSeed(99).shuffle(input)).toEqual(shuffled)
  })

  it('shuffles roughly uniformly', () => {
    const rng = Rng.fromSeed(2024)
    const runs = 40_000
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < runs; i++) counts[rng.shuffle([0, 1, 2, 3])[0]!]!++
    for (const count of counts) expect(Math.abs(count / runs - 0.25)).toBeLessThan(0.01)
  })

  it('creates random seeds', () => {
    const seed = randomSeed()
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true)
  })
})
