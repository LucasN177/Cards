import type { GameOptionField } from '@/engine'
import { applyOption } from './applyOption'

const fields: GameOptionField[] = [
  {
    type: 'choice',
    key: 'rules',
    label: 'Regelwerk',
    choices: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'own', label: 'Eigene' },
    ],
    presets: { a: { x: true, y: false }, b: { x: true, y: true } },
  },
  { type: 'boolean', key: 'x', label: 'X' },
  { type: 'boolean', key: 'y', label: 'Y' },
  { type: 'boolean', key: 'z', label: 'Z' },
]

describe('applyOption', () => {
  it('applies a preset', () => {
    expect(applyOption(fields, { rules: 'a', x: true, y: false }, 'rules', 'b')).toEqual({
      rules: 'b',
      x: true,
      y: true,
    })
  })

  it('switches to custom when a switch leaves the preset, and back when it matches again', () => {
    const own = applyOption(fields, { rules: 'a', x: true, y: false }, 'x', false)
    expect(own).toMatchObject({ rules: 'own', x: false })
    expect(applyOption(fields, own, 'x', true)).toMatchObject({ rules: 'a' })
    expect(applyOption(fields, { rules: 'a', x: true, y: false }, 'y', true)).toMatchObject({
      rules: 'b',
    })
  })

  it('leaves the preset alone for options it does not cover', () => {
    expect(applyOption(fields, { rules: 'a', x: true, y: false }, 'z', true)).toMatchObject({
      rules: 'a',
      z: true,
    })
  })
})
