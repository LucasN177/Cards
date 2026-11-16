import type { GameOptionField } from '@/engine'

/**
 * Sets one rule option. Choosing a preset (a choice field with `presets`) also sets the options
 * it lists; changing any other option re-derives every preset field: a preset whose values all
 * match is selected, otherwise the first choice without a preset ("custom").
 */
export function applyOption(
  fields: readonly GameOptionField[],
  value: Readonly<Record<string, unknown>>,
  key: string,
  next: unknown,
): Record<string, unknown> {
  const field = fields.find((f) => f.key === key)
  let out: Record<string, unknown> = { ...value, [key]: next }
  if (field?.type === 'choice' && field.presets) {
    const preset = field.presets[String(next)]
    return preset ? { ...out, ...preset } : out
  }
  for (const f of fields) {
    if (f.type !== 'choice' || !f.presets || f.key === key) continue
    const presets = f.presets
    const match = f.choices.find((c) => {
      const preset = presets[String(c.value)]
      return preset && Object.entries(preset).every(([k, v]) => out[k] === v)
    })
    const custom = f.choices.find((c) => !presets[String(c.value)])
    const chosen = match ?? custom
    if (chosen) out = { ...out, [f.key]: chosen.value }
  }
  return out
}
