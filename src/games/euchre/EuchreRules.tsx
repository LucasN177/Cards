import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_EUCHRE_OPTIONS } from './euchre'
import { euchreGame } from './index'

export default function EuchreRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Zwei Teams spielen gegeneinander, Partner sitzen sich gegenüber. Das Team, das Trumpf
          bestimmt, muss mindestens <strong>drei von fünf Stichen</strong> machen.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Buben">
        <RulesList>
          <li>Gespielt wird mit 24 Karten (9 bis Ass), jeder bekommt fünf.</li>
          <li>
            Höchste Karte ist der <strong>rechte Bube</strong> (Bube der Trumpffarbe), danach der{' '}
            <strong>linke Bube</strong> (Bube der gleichfarbigen Farbe), dann Ass, König, Dame, 10,
            9 in Trumpf.
          </li>
          <li>
            Der linke Bube gehört ganz zur Trumpffarbe – auch beim Bedienen. Beispiel: Ist Herz
            Trumpf, ist der Karo-Bube ein Herz.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Trumpf bestimmen">
        <RulesList>
          <li>
            Eine Karte wird aufgedeckt. Links vom Geber beginnend sagt jeder „Bestellen“ oder
            „Passen“.
          </li>
          <li>
            Wird bestellt, ist die Farbe der aufgedeckten Karte Trumpf; der Geber nimmt sie auf und
            legt eine Karte ab.
          </li>
          <li>
            Passen alle, wird die Karte umgedreht. In einer zweiten Runde darf jeder eine{' '}
            <strong>andere</strong> Farbe als Trumpf bestimmen.
          </li>
          <li>
            Passen wieder alle, muss der Geber wählen (siehe Einstellungen) – sonst wird neu
            gegeben.
          </li>
          <li>
            Wer Trumpf bestimmt, darf <strong>allein spielen</strong>; der Partner setzt diese Hand
            aus.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>Links vom Geber wird ausgespielt; wer den Stich gewinnt, spielt neu aus.</li>
          <li>Farbe muss bedient werden, sonst darf man beliebig spielen.</li>
          <li>
            Den Stich gewinnt der höchste Trumpf, sonst die höchste Karte der ausgespielten Farbe.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>Bestimmendes Team mit 3 oder 4 Stichen: 1 Punkt.</li>
          <li>Alle 5 Stiche („March“): 2 Punkte, allein gespielt 4 Punkte.</li>
          <li>
            Weniger als 3 Stiche: Das Team ist <strong>euchred</strong>, die Gegner bekommen 2
            Punkte.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={euchreGame.optionFields ?? []}
          defaults={DEFAULT_EUCHRE_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
