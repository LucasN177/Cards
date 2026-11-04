import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { presidentGame } from './index'
import { DEFAULT_PRESIDENT_OPTIONS } from './president'

export default function PresidentRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Werde deine Karten als Erster los. Die Reihenfolge, in der alle fertig werden, bestimmt
          die Titel und Punkte der Runde. Nach der letzten Runde gewinnt, wer die meisten Punkte
          hat.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>Gespielt wird mit 52 Karten, die komplett verteilt werden.</li>
          <li>
            Rangfolge von niedrig nach hoch: 3, 4, 5, 6, 7, 8, 9, 10, Bube, Dame, König, Ass,{' '}
            <strong>2</strong>. Die Farbe spielt keine Rolle.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ablauf">
        <RulesList>
          <li>
            In der ersten Runde beginnt, wer die Kreuz 3 hat, danach der Bettler der letzten Runde.
          </li>
          <li>
            Wer ausspielt, legt eine bis vier <strong>gleiche</strong> Karten (z. B. zwei Siebenen).
          </li>
          <li>
            Die anderen müssen <strong>gleich viele</strong> Karten eines <strong>höheren</strong>{' '}
            Rangs legen – oder passen. Wer passt, setzt bis zum Ende dieses Stichs aus.
          </li>
          <li>
            Passen alle anderen, gewinnt der Spieler mit der letzten Ablage den Stich und spielt neu
            aus. Ist er schon fertig, spielt der nächste aus.
          </li>
          <li>Die Runde endet, wenn nur noch einer Karten hat.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Titel und Punkte">
        <RulesList>
          <li>
            Wer zuerst fertig ist, wird <strong>Präsident</strong>, der Letzte{' '}
            <strong>Bettler</strong>. Ab vier Spielern gibt es außerdem den Vize und den
            Vize-Bettler, alle anderen sind Bürger.
          </li>
          <li>
            Punkte pro Runde: Der Letzte bekommt 0, jeder Platz davor einen Punkt mehr (bei vier
            Spielern also 3, 2, 1, 0).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Kartentausch">
        <RulesList>
          <li>
            Ab der zweiten Runde gibt der Bettler dem Präsidenten seine <strong>zwei besten</strong>{' '}
            Karten; der Präsident gibt zwei beliebige Karten zurück.
          </li>
          <li>Ab vier Spielern tauschen Vize-Bettler und Vize genauso je eine Karte.</li>
          <li>Ohne Kartentausch beginnt trotzdem der Bettler.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={presidentGame.optionFields ?? []}
          defaults={DEFAULT_PRESIDENT_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
