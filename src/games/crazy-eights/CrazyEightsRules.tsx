import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { CRAZY_EIGHTS_POINTS } from '@/games/mau-mau'
import { crazyEightsGame, DEFAULT_CRAZY_EIGHTS_OPTIONS } from '.'

export default function CrazyEightsRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Wer als Erster alle Karten abgelegt hat, gewinnt – der amerikanische Verwandte von
          Mau-Mau.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Vorbereitung">
        <p>
          Gespielt wird mit <strong>52 Karten</strong> (2 bis Ass). Zu zweit bekommt jeder sieben
          Karten, ab drei Spielern fünf (einstellbar). Die oberste Karte des Stapels wird
          aufgedeckt.
        </p>
      </RulesSection>

      <RulesSection title="Spielablauf">
        <RulesList>
          <li>
            Lege eine Karte, die in <strong>Farbe oder Wert</strong> zur obersten Karte passt.
          </li>
          <li>
            <strong>Die 8 ist wild:</strong> Sie passt immer. Wer sie legt, wünscht sich eine Farbe,
            die der Nächste bedienen muss (oder mit einer 8 überspielt).
          </li>
          <li>
            Wer nicht legen kann oder will,{' '}
            <strong>zieht so lange, bis eine passende Karte kommt</strong>, und darf sie sofort
            spielen. Ist die Variante „Ziehen, bis es passt“ aus, wird nur eine Karte gezogen.
          </li>
          <li>
            Ist der Stapel leer, wird der Ablagestapel bis auf die oberste Karte neu gemischt.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Sonderkarten (Varianten)">
        <RulesList>
          <li>
            <strong>2 – Zwei ziehen:</strong> Der Nächste zieht zwei Karten, außer er legt selbst
            eine 2 (dann addiert sich die Strafe).
          </li>
          <li>
            <strong>Dame – Aussetzen:</strong> Der nächste Spieler wird übersprungen.
          </li>
          <li>
            <strong>Ass – Richtungswechsel:</strong> Die Spielrichtung dreht sich um (ab drei
            Spielern).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende und Wertung">
        <p>
          Wer seine letzte Karte ablegt, gewinnt. Die anderen bekommen Strafpunkte für ihre
          Handkarten: eine 8 zählt {CRAZY_EIGHTS_POINTS['8']}, Bube, Dame und König je{' '}
          {CRAZY_EIGHTS_POINTS.K}, ein Ass {CRAZY_EIGHTS_POINTS.A}, alle anderen ihren Augenwert. Im
          Spiel-Setup lässt sich über mehrere Runden spielen; dann zählt die Summe.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Varianten in diesem Spiel' : 'Varianten'}>
        <VariantList
          fields={crazyEightsGame.optionFields ?? []}
          defaults={DEFAULT_CRAZY_EIGHTS_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Touch:</strong> Karte antippen hebt sie an, noch einmal antippen spielt sie. Mit
            der Maus genügt ein Klick; Karten lassen sich auch auf den Ablagestapel ziehen.
          </li>
          <li>Zum Ziehen auf den Stapel tippen oder „Ziehen“ wählen.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
