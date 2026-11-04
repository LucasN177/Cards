/**
 * Seedable pseudo random number generator (sfc32, seeded via splitmix32).
 *
 * The state is a plain tuple so it can live inside a serializable game state. A game that needs
 * randomness after setup (e.g. reshuffling the discard pile) stores `rng.state` in its state and
 * recreates the generator with `new Rng(state.rng)`. That keeps every game fully deterministic
 * for a given seed and action sequence, which replays, saved games and tests rely on.
 */

export type RngState = readonly [number, number, number, number]

export function seedToState(seed: number): RngState {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
  return [next(), next(), next(), next()]
}

/** A fresh random seed for a new game. */
export function randomSeed(): number {
  const buffer = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buffer)
  return buffer[0]!
}

export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(state: RngState) {
    ;[this.a, this.b, this.c, this.d] = state
  }

  static fromSeed(seed: number): Rng {
    return new Rng(seedToState(seed))
  }

  /** Current state; pass it to `new Rng(state)` to continue the same sequence later. */
  get state(): RngState {
    return [this.a, this.b, this.c, this.d]
  }

  /** Continues from another generator's state, e.g. after an AI decided in a web worker. */
  set state(state: RngState) {
    ;[this.a, this.b, this.c, this.d] = state
  }

  nextUint32(): number {
    const t0 = (this.a + this.b) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.d = (this.d + 1) | 0
    const t = (t0 + this.d) | 0
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 0x1_0000_0000
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`)
    }
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list')
    return items[this.int(items.length)]!
  }

  /** Returns a shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[result[i], result[j]] = [result[j]!, result[i]!]
    }
    return result
  }
}
