import { describe, expect, it } from 'vitest'
import { isTie } from './result'

describe('isTie', () => {
  it('treats several winners without teams as a tie', () => {
    expect(isTie(['a', 'b'])).toBe(true)
    expect(isTie(['a'])).toBe(false)
  })

  it('counts partners who win together as one side', () => {
    const teams = [
      ['a', 'c'],
      ['b', 'd'],
    ]
    expect(isTie(['a', 'c'], teams)).toBe(false)
    expect(isTie(['a', 'b', 'c', 'd'], teams)).toBe(true)
  })
})
