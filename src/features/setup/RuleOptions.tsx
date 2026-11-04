import { useId } from 'react'
import { ChoiceGroup } from '@/components/ChoiceGroup'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { GameOptionField } from '@/engine'

interface RuleOptionsProps {
  readonly fields: readonly GameOptionField[]
  readonly value: Readonly<Record<string, unknown>>
  readonly onChange: (value: Record<string, unknown>) => void
}

function BooleanOption({
  field,
  checked,
  onChange,
}: {
  field: GameOptionField
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{field.label}</Label>
        {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Renders a game's rule variants from its `optionFields`, so games need no setup UI code. */
export function RuleOptions({ fields, value, onChange }: RuleOptionsProps) {
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next })
  return (
    <div className="space-y-5">
      {fields.map((field) =>
        field.type === 'boolean' ? (
          <BooleanOption
            key={field.key}
            field={field}
            checked={Boolean(value[field.key])}
            onChange={(checked) => set(field.key, checked)}
          />
        ) : (
          <ChoiceGroup
            key={field.key}
            label={field.label}
            value={String(value[field.key])}
            choices={field.choices.map((c) => ({ value: String(c.value), label: c.label }))}
            onChange={(next) =>
              set(field.key, field.choices.find((c) => String(c.value) === next)?.value)
            }
          />
        ),
      )}
    </div>
  )
}
