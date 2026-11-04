import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { THEME_LABELS } from '@/lib/labels'
import { type ThemePreference, useSettings } from '@/stores/settingsStore'

const NEXT: Readonly<Record<ThemePreference, ThemePreference>> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const

export function ThemeToggle() {
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const Icon = ICONS[theme]

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => update({ theme: NEXT[theme] })}
      aria-label={`Design: ${THEME_LABELS[theme]} (wechseln)`}
      title={`Design: ${THEME_LABELS[theme]}`}
    >
      <Icon />
    </Button>
  )
}
