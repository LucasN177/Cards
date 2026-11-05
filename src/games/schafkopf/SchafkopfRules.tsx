import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { schafkopfGame } from './index'
import { DEFAULT_SCHAFKOPF_OPTIONS } from './schafkopf'

export default function SchafkopfRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Vier Spieler, 32 Karten. Wer ein Spiel ansagt, muss mit seiner Partei{' '}
          <strong>mindestens 61</strong> der 120 Augen holen.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>Farben: Eichel, Gras, Herz, Schellen. Jeder bekommt acht Karten.</li>
          <li>Augen: Sau (Ass) 11, Zehn 10, König 4, Ober 3, Unter 2, 9/8/7 nichts.</li>
          <li>
            <strong>Trümpfe</strong> im Sauspiel: die vier Ober (Eichel, Gras, Herz, Schellen), die
            vier Unter in derselben Reihenfolge, dann Herz: Sau, 10, König, 9, 8, 7.
          </li>
          <li>
            Die übrigen Farben: Sau, 10, König, 9, 8, 7. Farbe bzw. Trumpf muss bedient werden.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiele">
        <RulesList>
          <li>
            Links vom Geber beginnend sagt jeder „Weiter“ oder ein Spiel an. Ein höheres Spiel
            sticht ein niedrigeres: Sauspiel &lt; Wenz &lt; Solo. Passen alle, wird
            zusammengeworfen.
          </li>
          <li>
            <strong>Sauspiel:</strong> Du rufst eine Sau (Eichel, Gras oder Schellen), die du nicht
            hast, von deren Farbe du aber eine Karte hast. Wer die Sau hat, spielt mit dir – das
            weiß anfangs nur er selbst.
          </li>
          <li>
            Die gerufene Sau muss gelegt werden, sobald ihre Farbe angespielt wird, und darf nicht
            abgeworfen werden. Spielt ihr Besitzer die Farbe selbst an, muss er die Sau legen –
            außer er hat vier oder mehr Karten der Farbe („davonlaufen“).
          </li>
          <li>
            <strong>Wenz:</strong> Nur die vier Unter sind Trumpf, die Ober zählen in ihrer Farbe
            (zwischen König und 9).
          </li>
          <li>
            <strong>Farbsolo:</strong> Wie das Sauspiel, aber mit der gewählten Farbe statt Herz als
            Trumpffarbe – und du spielst allein gegen drei.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung (Tarif)">
        <RulesList>
          <li>Sauspiel 10, Wenz und Solo 50.</li>
          <li>
            +10 für Schneider (eine Partei hat höchstens 30 Augen) und +10 für Schwarz (keinen
            Stich).
          </li>
          <li>
            <strong>Laufende:</strong> Hat die Spielerpartei die höchsten Trümpfe in Folge (oder sie
            fehlen ihr in Folge – „ohne“), gibt es je 10 – im Sauspiel und Solo ab drei, im Wenz ab
            zwei.
          </li>
          <li>
            Sauspiel: Jeder Verlierer zahlt jedem Gewinner den Wert. Solo/Wenz: Die drei anderen
            zahlen dem Solisten je den Wert – oder bekommen ihn von ihm.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={schafkopfGame.optionFields ?? []}
          defaults={DEFAULT_SCHAFKOPF_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
