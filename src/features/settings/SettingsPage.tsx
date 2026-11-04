import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ChoiceGroup } from '@/components/ChoiceGroup'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { deleteAllSaves } from '@/features/persistence/savedGames'
import { DECK_STYLE_LABELS, GAME_SPEED_LABELS, THEME_LABELS } from '@/lib/labels'
import {
  type DeckStyle,
  type GameSpeed,
  type ThemePreference,
  useSettings,
} from '@/stores/settingsStore'
import { useStats } from '@/stores/statsStore'

const entries = <T extends string>(labels: Readonly<Record<T, string>>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Two-step delete so statistics are never wiped by a single mis-tap. */
function ClearStatistics() {
  const [state, setState] = useState<'idle' | 'confirm' | 'done' | 'error'>('idle')
  const clear = async () => {
    try {
      await useStats.getState().clear()
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'confirm') {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-3">
        <p className="text-sm">
          Alle gespeicherten Partien und Auswertungen werden gelöscht. Das lässt sich nicht
          rückgängig machen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => void clear()}>
            Ja, Statistik löschen
          </Button>
          <Button variant="ghost" onClick={() => setState('idle')}>
            Abbrechen
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => setState('confirm')}>
        Statistik löschen
      </Button>
      {state === 'done' && (
        <span role="status" className="text-sm text-muted-foreground">
          Statistik gelöscht.
        </span>
      )}
      {state === 'error' && (
        <span role="status" className="text-sm text-destructive">
          Löschen fehlgeschlagen.
        </span>
      )}
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const nameId = useId()
  const deckId = useId()

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Spieler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor={nameId}>Dein Name</Label>
          <input
            id={nameId}
            value={settings.playerName}
            maxLength={24}
            onChange={(e) => settings.update({ playerName: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>Gilt für alle Spiele.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ChoiceGroup<ThemePreference>
            label="Design"
            value={settings.theme}
            choices={entries(THEME_LABELS)}
            onChange={(theme) => settings.update({ theme })}
          />
          <div className="space-y-2">
            <Label htmlFor={deckId}>Kartenblatt</Label>
            <Select
              value={settings.deckStyle}
              onValueChange={(deckStyle) => settings.update({ deckStyle: deckStyle as DeckStyle })}
            >
              <SelectTrigger id={deckId} className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entries(DECK_STYLE_LABELS).map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ToggleRow
            label="Animationen"
            description="Karten fliegen animiert über den Tisch."
            checked={settings.animations}
            onChange={(animations) => settings.update({ animations })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spiel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ChoiceGroup<GameSpeed>
            label="Spielgeschwindigkeit der Gegner"
            value={settings.gameSpeed}
            choices={entries(GAME_SPEED_LABELS)}
            onChange={(gameSpeed) => settings.update({ gameSpeed })}
          />
          <ToggleRow
            label="Soundeffekte"
            description="Geräusche beim Mischen und Ausspielen."
            checked={settings.sound}
            onChange={(sound) => settings.update({ sound })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daten & Fortschritt</CardTitle>
          <CardDescription>
            Alles bleibt auf diesem Gerät – ohne Konto, ohne Server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow
            label="Statistik aufzeichnen"
            description="Beendete Partien werden für die Statistik gespeichert."
            checked={settings.recordStats}
            onChange={(recordStats) => settings.update({ recordStats })}
          />
          <ToggleRow
            label="Laufende Partien speichern"
            description="Eine angefangene Partie bleibt erhalten, auch wenn du die App schließt."
            checked={settings.saveGames}
            onChange={(saveGames) => {
              settings.update({ saveGames })
              if (!saveGames) deleteAllSaves()
            }}
          />
          <div className="space-y-2">
            <p className="text-sm">
              Deine Auswertungen findest du unter{' '}
              <Link to="/stats" className="underline underline-offset-4">
                Statistik
              </Link>
              .
            </p>
            <ClearStatistics />
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={settings.reset}>
        Auf Standard zurücksetzen
      </Button>
    </div>
  )
}
