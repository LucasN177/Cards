import type { ReactNode } from 'react'
import type { GameOptionField } from '@/engine'
import { cn } from '@/lib/utils'

/** Building blocks for readable rule texts (no typography plugin needed). */

export function RulesSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}

export function RulesList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
}

export interface RulesProps {
  /** Options of the running game, to mark which variants are active. */
  readonly options?: Readonly<Record<string, unknown>>
}

/** Lists a game's rule variants; with `options` it shows which ones are switched on. */
export function VariantList({
  fields,
  defaults,
  options,
}: {
  fields: readonly GameOptionField[]
  defaults: Readonly<Record<string, unknown>>
  options?: Readonly<Record<string, unknown>>
}) {
  const current = { ...defaults, ...options }
  return (
    <ul className="divide-y rounded-lg border">
      {fields.map((field) => {
        const value = current[field.key]
        const state =
          field.type === 'boolean'
            ? value
              ? 'an'
              : 'aus'
            : (field.choices.find((c) => c.value === value)?.label ?? String(value))
        return (
          <li key={field.key} className="flex items-start justify-between gap-3 px-3 py-2">
            <div>
              <p className="font-medium text-foreground">{field.label}</p>
              {field.description && <p className="text-sm">{field.description}</p>}
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                field.type === 'boolean' && !value
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {options ? state : `Standard: ${state}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
