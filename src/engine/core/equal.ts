/** Structural equality for plain, JSON-like data (actions, views). Key order does not matter. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const keys = Object.keys(aRecord).filter((k) => aRecord[k] !== undefined)
  const otherKeys = Object.keys(bRecord).filter((k) => bRecord[k] !== undefined)
  return (
    keys.length === otherKeys.length &&
    keys.every((key) => Object.hasOwn(bRecord, key) && deepEqual(aRecord[key], bRecord[key]))
  )
}
