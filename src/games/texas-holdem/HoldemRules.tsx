import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_HOLDEM_OPTIONS, holdemRules } from './holdem'

export default function HoldemRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Gewinne die Chips der anderen. Jeder bekommt zwei verdeckte Karten, dazu kommen fünf
          offene Karten in der Mitte (das <strong>Board</strong>). Wer am Ende die beste Hand aus
          fünf seiner sieben Karten hat – oder als Einziger übrig bleibt, weil alle anderen
          ausgestiegen sind – gewinnt den Pot. Gespielt wird mit Spielchips ohne echten Einsatz.
        </p>
      </RulesSection>

      <RulesSection title="Ablauf einer Hand">
        <RulesList>
          <li>
            Der <strong>Dealer-Button</strong> wandert jede Hand eine Position weiter. Links von ihm
            setzen zwei Spieler Pflichteinsätze: den <strong>Small Blind</strong> und den{' '}
            <strong>Big Blind</strong> (anfangs 10 und 20). Zu zweit setzt der Dealer den Small
            Blind.
          </li>
          <li>
            Vier Setzrunden: vor dem Flop (nur die eigenen Karten), nach dem <strong>Flop</strong>{' '}
            (drei Karten), nach dem <strong>Turn</strong> (vierte Karte) und nach dem{' '}
            <strong>River</strong> (fünfte Karte).
          </li>
          <li>
            Wer dran ist, kann <strong>aussteigen</strong>, <strong>mitgehen</strong> (oder
            schieben, wenn nichts zu zahlen ist) oder <strong>erhöhen</strong>. Eine Erhöhung muss
            mindestens so groß sein wie die vorige (anfangs ein Big Blind); nach oben gibt es keine
            Grenze (No Limit) außer den eigenen Chips.
          </li>
          <li>
            Eine Setzrunde endet, wenn alle gleich viel gesetzt haben oder all-in sind. Wer all-in
            ist, spielt nur um den Teil des Pots, den er selbst abdecken kann – der Rest kommt in{' '}
            <strong>Nebenpots</strong>.
          </li>
          <li>Bei gleich guten Händen wird der Pot geteilt.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Die Hände (von oben nach unten)">
        <RulesList>
          <li>
            <strong>Royal Flush</strong> und <strong>Straight Flush</strong>: fünf Karten einer
            Farbe in Reihe.
          </li>
          <li>
            <strong>Vierling</strong>, <strong>Full House</strong> (Drilling und Paar),{' '}
            <strong>Flush</strong> (fünf Karten einer Farbe), <strong>Straße</strong> (fünf in
            Reihe; das Ass zählt auch als Eins).
          </li>
          <li>
            <strong>Drilling</strong>, <strong>Zwei Paare</strong>, <strong>Ein Paar</strong>,{' '}
            <strong>Höchste Karte</strong>. Bei Gleichstand entscheiden die übrigen Karten (Kicker).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende">
        <p>
          Wer keine Chips mehr hat, scheidet aus. Das Spiel endet, wenn einer alle Chips hat, wenn
          du ausscheidest oder – je nach Einstellung – nach 30 oder 60 Händen. Steigende Blinds
          sorgen dafür, dass es nicht ewig dauert.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={holdemRules.optionFields ?? []}
          defaults={DEFAULT_HOLDEM_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>„Aussteigen“, „Mitgehen“ bzw. „Schieben“ und „Erhöhen“ stehen unter dem Tisch.</li>
          <li>Den Betrag wählst du mit „Min“, „½ Pot“, „Pot“, „All-in“ oder dem Schieberegler.</li>
          <li>Ab dem Flop siehst du neben deinen Chips, welche Hand du gerade hast.</li>
          <li>Nach jeder Hand zeigt eine Übersicht die aufgedeckten Karten und die Gewinner.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
