import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export interface Choice<T extends string> {
  readonly value: T
  readonly label: string
}

interface ChoiceGroupProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly choices: readonly Choice<T>[]
  readonly onChange: (value: T) => void
  readonly className?: string
}

/** Labelled radio group rendered as selectable tiles. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  className,
}: ChoiceGroupProps<T>) {
  const id = useId()
  return (
    <fieldset className={cn('space-y-2', className)}>
      <legend className="text-sm font-medium">{label}</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as T)}
        className="flex flex-wrap gap-2"
      >
        {choices.map((choice) => {
          const itemId = `${id}-${choice.value}`
          return (
            <Label
              key={choice.value}
              htmlFor={itemId}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent"
            >
              <RadioGroupItem id={itemId} value={choice.value} />
              {choice.label}
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
