import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { cribbageRules, DEFAULT_CRIBBAGE_OPTIONS } from './cribbage'

export default function CribbageRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Cribbage ist ein Zählspiel: Punkte gibt es beim Ausspielen und beim Auszählen der Hände.
          Wer zuerst <strong>121</strong> Punkte (oder 61) erreicht, gewinnt – sofort, auch mitten
          in einer Hand. Das Brett zeigt, wie weit jede Seite ist.
        </p>
      </RulesSection>

      <RulesSection title="Geben und Crib">
        <RulesList>
          <li>
            52 Karten. Zu zweit bekommt jeder sechs Karten und gibt zwei in den{' '}
            <strong>Crib</strong>; zu dritt und zu viert sind es fünf Karten und eine für den Crib
            (zu dritt kommt noch eine Karte vom Stapel dazu). Zu viert spielen die
            Gegenübersitzenden als Partner.
          </li>
          <li>
            Der Crib gehört dem <strong>Geber</strong> und wird am Ende der Hand für ihn gezählt.
            Der Geber wechselt jede Hand reihum.
          </li>
          <li>
            Danach wird der <strong>Starter</strong> aufgedeckt. Ist er ein Bube, bekommt der Geber
            2 Punkte (<em>His Heels</em>).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ausspielen (Pegging)">
        <RulesList>
          <li>
            Links vom Geber beginnend legt jeder reihum eine Karte offen vor sich und nennt die
            Summe: Ass 1, Zahlen ihren Wert, Bube, Dame und König 10. Die Summe darf 31 nicht
            übersteigen.
          </li>
          <li>
            Punkte: Summe <strong>15</strong> oder <strong>31</strong> – 2. Gleicher Wert wie die
            Karte davor: Paar 2, Drilling 6, Vierling 12. Bilden die letzten drei oder mehr Karten
            eine <strong>Folge</strong> (in beliebiger Reihenfolge), gibt es einen Punkt pro Karte.
          </li>
          <li>
            Wer keine Karte mehr legen kann, sagt <strong>Go</strong>. Kann niemand mehr legen,
            bekommt der Letzte 1 Punkt, und eine neue Runde ab 0 beginnt. Wer die letzte Karte der
            Hand spielt, bekommt ebenfalls 1 Punkt (bei 31 nur die 2 Punkte dafür).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Auszählen">
        <RulesList>
          <li>
            Jede Hand wird mit dem Starter als fünfter Karte gezählt – links vom Geber beginnend,
            der Geber zuletzt, danach sein Crib.
          </li>
          <li>
            <strong>Fünfzehn:</strong> jede Kombination mit der Summe 15 – 2.{' '}
            <strong>Paare:</strong> 2 pro Paar (Drilling 6, Vierling 12). <strong>Folgen:</strong> 1
            pro Karte, jede Kombination zählt einzeln (z. B. 4-5-5-6: zwei Folgen à 3).
          </li>
          <li>
            <strong>Flush:</strong> vier Karten der Hand in einer Farbe 4, mit passendem Starter 5.
            Im Crib zählt nur ein Flush aus allen fünf Karten.
          </li>
          <li>
            <strong>Nobs:</strong> der Bube in der Farbe des Starters – 1.
          </li>
          <li>Die beste mögliche Hand bringt 29 Punkte.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={cribbageRules.optionFields ?? []}
          defaults={DEFAULT_CRIBBAGE_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>Wähle die Karten für den Crib und tippe „In den Crib legen“.</li>
          <li>
            Beim Ausspielen tippst du eine Karte an; Karten, die über 31 führen würden, sind
            gesperrt. Go wird automatisch gesagt.
          </li>
          <li>Nach jeder Hand siehst du die ausgezählten Hände und den Crib mit allen Punkten.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
