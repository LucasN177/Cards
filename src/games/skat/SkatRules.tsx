import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { skatGame } from './index'
import { DEFAULT_SKAT_OPTIONS } from './skat'

export default function SkatRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Drei Spieler, ein <strong>Alleinspieler</strong> gegen zwei Gegenspieler. Wer beim Reizen
          am höchsten geht, spielt allein und braucht mehr als die Hälfte der 120 Augen – also{' '}
          <strong>mindestens 61</strong>.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Augen">
        <RulesList>
          <li>32 Karten (7 bis Ass). Jeder bekommt 10, zwei liegen verdeckt als Skat.</li>
          <li>Augen: Ass 11, Zehn 10, König 4, Dame 3, Bube 2, 9/8/7 nichts.</li>
          <li>
            Die vier <strong>Buben</strong> sind die höchsten Trümpfe: Kreuz, Pik, Herz, Karo.
            Danach folgen im Farbspiel die Karten der Trumpffarbe: Ass, 10, König, Dame, 9, 8, 7.
          </li>
          <li>Buben gehören zur Trumpffarbe – auch beim Bedienen.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Reizen">
        <RulesList>
          <li>Vorhand sitzt links vom Geber, dann Mittelhand, dann Hinterhand (der Geber).</li>
          <li>
            Mittelhand reizt Vorhand mit Zahlen (18, 20, 22, 23, 24, 27, 30 …); Vorhand sagt „Ja“
            oder „Passe“. Danach reizt Hinterhand den, der übrig blieb.
          </li>
          <li>
            Passen Mittel- und Hinterhand sofort, darf Vorhand noch 18 spielen. Passen alle, wird
            neu gegeben.
          </li>
          <li>
            Man reizt höchstens den Wert des Spiels, das man spielen möchte. Ist das Spiel am Ende
            weniger wert als gereizt, ist es <strong>überreizt</strong> und verloren.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Skat und Spielansage">
        <RulesList>
          <li>
            Der Alleinspieler nimmt den Skat auf und <strong>drückt</strong> zwei Karten. Ihre Augen
            zählen für ihn.
          </li>
          <li>
            Oder er spielt <strong>Hand</strong>, ohne den Skat anzusehen (eine Stufe mehr). Nur im
            Handspiel kann er Schneider oder Schwarz ansagen.
          </li>
          <li>
            Spiele: Kreuz (Grundwert 12), Pik (11), Herz (10), Karo (9), Grand (24, nur Buben sind
            Trumpf) und Null (23, Hand 35, ouvert 46, Hand ouvert 59).
          </li>
          <li>
            Beim <strong>Null</strong> gibt es keinen Trumpf, die Reihenfolge ist 7, 8, 9, 10, Bube,
            Dame, König, Ass – und der Alleinspieler darf keinen einzigen Stich machen. Bei „ouvert“
            liegen seine Karten offen.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>Vorhand spielt aus; wer den Stich gewinnt, spielt neu aus.</li>
          <li>Farbe muss bedient werden (Trumpf mit Trumpf), sonst darf man beliebig spielen.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielwert">
        <RulesList>
          <li>
            Grundwert × Stufen. Stufen: die <strong>Spitzen</strong> (wie viele höchste Trümpfe ab
            dem Kreuz-Buben man in Folge hat – „mit“ – oder in Folge nicht hat – „ohne“; Skat zählt
            mit) plus 1 für das Spiel.
          </li>
          <li>
            Je eine Stufe mehr für Hand, Schneider (90 Augen bzw. Gegner höchstens 30), Schneider
            angesagt, Schwarz (alle Stiche), Schwarz angesagt.
          </li>
          <li>Beispiel: Kreuz mit 2, Hand → 12 × (2 + 1 + 1) = 48.</li>
          <li>
            Gewonnen: Spielwert. Verloren: das Doppelte als Abzug. Bei Seeger-Fabian zusätzlich +50
            für jedes gewonnene und −50 für jedes verlorene Spiel; verliert der Alleinspieler,
            bekommen die Gegenspieler je 40.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={skatGame.optionFields ?? []}
          defaults={DEFAULT_SKAT_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
