import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { wizardGame } from './index'
import { DEFAULT_WIZARD_OPTIONS } from './wizard'

export default function WizardRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Sage jede Runde <strong>genau</strong> voraus, wie viele Stiche du machst. Wer am Ende die
          meisten Punkte hat, gewinnt.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>
            60 Karten: die üblichen 52 (2 bis Ass) plus vier <strong>Zauberer</strong> (Z) und vier{' '}
            <strong>Narren</strong> (N).
          </li>
          <li>
            In Runde 1 bekommt jeder eine Karte, in Runde 2 zwei und so weiter. Ein volles Spiel hat
            60 ÷ Spielerzahl Runden (bei 3 Spielern 20, bei 6 Spielern 10).
          </li>
          <li>
            Die nächste Karte wird aufgedeckt und bestimmt den <strong>Trumpf</strong>. Ein Narr
            bedeutet: kein Trumpf. Bei einem Zauberer wählt der Geber die Trumpffarbe. In der
            letzten Runde eines vollen Spiels bleibt keine Karte übrig – dann gibt es keinen Trumpf.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ansagen">
        <RulesList>
          <li>
            Links vom Geber beginnend sagt jeder an, wie viele Stiche er machen wird (0 ist
            erlaubt).
          </li>
          <li>Beim Ansagen ist eine Schätzung für dein Blatt markiert.</li>
          <li>
            Mit „Ansagen dürfen nicht aufgehen“ darf der Geber nicht so ansagen, dass alle Ansagen
            zusammen genau die Zahl der Stiche ergeben – mindestens einer liegt dann daneben.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>Links vom Geber wird ausgespielt; wer den Stich gewinnt, spielt neu aus.</li>
          <li>
            Die Farbe der ersten normalen Karte muss bedient werden.{' '}
            <strong>Zauberer und Narren</strong> dürfen aber immer gespielt werden.
          </li>
          <li>
            Wird ein Narr ausgespielt, bestimmt die nächste normale Karte die Farbe. Wird ein
            Zauberer ausgespielt, darf jeder beliebig spielen.
          </li>
          <li>
            Den Stich gewinnt der <strong>erste Zauberer</strong>, sonst der höchste Trumpf, sonst
            die höchste Karte der ausgespielten Farbe. Narren gewinnen nie – außer es liegen nur
            Narren, dann der erste.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>
            Ansage genau getroffen: <strong>20 Punkte plus 10 pro Stich</strong>.
          </li>
          <li>Daneben: 10 Punkte Abzug pro Stich zu viel oder zu wenig.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={wizardGame.optionFields ?? []}
          defaults={DEFAULT_WIZARD_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
