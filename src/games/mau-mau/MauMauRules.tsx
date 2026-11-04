import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { CARD_POINTS, DEFAULT_MAU_MAU_OPTIONS, mauMauRules } from './mauMau'

const POINT_ROWS = [
  ['7, 8, 9, 10', 'Augenwert (7–10)'],
  ['Bube / Unter', String(CARD_POINTS.J)],
  ['Dame / Ober', String(CARD_POINTS.Q)],
  ['König', String(CARD_POINTS.K)],
  ['Ass', String(CARD_POINTS.A)],
] as const

export default function MauMauRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>Wer als Erster alle Karten abgelegt hat, gewinnt.</p>
      </RulesSection>

      <RulesSection title="Karten und Vorbereitung">
        <p>
          Gespielt wird mit <strong>32 Karten</strong>: 7, 8, 9, 10, Bube, Dame, König und Ass in
          vier Farben – Kreuz, Pik, Herz und Karo. Beim deutschen Blatt heißen die Farben Eichel,
          Grün, Herz und Schellen, Bube und Dame heißen Unter und Ober.
        </p>
        <p>
          Jeder bekommt <strong>5 Karten</strong> (einstellbar bis 7; bei vielen Spielern
          entsprechend weniger, damit genug Karten zum Ziehen bleiben). Die oberste Karte des
          Stapels wird aufgedeckt und bildet den Ablagestapel – sie hat keine Sonderwirkung. Ein
          zufällig bestimmter Spieler beginnt.
        </p>
      </RulesSection>

      <RulesSection title="Spielablauf">
        <RulesList>
          <li>
            Reihum legt jeder <strong>eine passende Karte</strong> auf den Ablagestapel: gleiche
            Farbe <em>oder</em> gleicher Wert wie die oberste Karte.
          </li>
          <li>
            Wer nicht legen kann oder will, <strong>zieht eine Karte</strong>. Passt sie, darf sie
            sofort gespielt werden – sonst ist der Nächste dran.
          </li>
          <li>
            Ist der Stapel leer, wird der Ablagestapel bis auf die oberste Karte gemischt und wird
            zum neuen Stapel.
          </li>
          <li>
            Hat ein Spieler nur noch eine Karte, muss er „Mau!“ sagen. Das übernimmt die App: Am
            Platz des Spielers erscheint <strong>Mau!</strong>.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Sonderkarten">
        <RulesList>
          <li>
            <strong>7 – Zwei ziehen:</strong> Der nächste Spieler muss zwei Karten ziehen und ist
            danach nicht mehr am Zug. Mit „7 auf 7“ kann er stattdessen selbst eine 7 legen – dann
            muss der Folgende vier Karten ziehen, und so weiter.
          </li>
          <li>
            <strong>8 – Aussetzen:</strong> Der nächste Spieler wird übersprungen. Zu zweit bist du
            also gleich noch einmal dran.
          </li>
          <li>
            <strong>Bube – Wünschen:</strong> Der Bube passt auf jede Karte (auf einen anderen Buben
            nur mit der Variante „Bube auf Bube“). Wer ihn legt, wünscht sich eine Farbe: Der
            Nächste muss diese Farbe oder einen Buben legen.
          </li>
          <li>
            <strong>9 – Richtungswechsel</strong> (Variante, standardmäßig aus): Die Spielrichtung
            dreht sich um. Das wirkt erst ab drei Spielern.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende und Wertung">
        <p>
          Wer seine letzte Karte ablegt, gewinnt sofort. Alle anderen bekommen{' '}
          <strong>Strafpunkte</strong> für die Karten, die sie noch auf der Hand haben – je weniger,
          desto besser die Platzierung.
        </p>
        <table className="w-full max-w-xs text-sm">
          <tbody className="divide-y">
            {POINT_ROWS.map(([card, points]) => (
              <tr key={card}>
                <td className="py-1 pr-4">{card}</td>
                <td className="py-1 text-right font-medium text-foreground tabular-nums">
                  {points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Sonderfall: Kann reihum niemand mehr legen oder ziehen, weil alle Karten auf den Händen
          sind, endet das Spiel. Dann gewinnt, wer die wenigsten Strafpunkte hat.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Varianten in diesem Spiel' : 'Varianten'}>
        <p>Vor Spielbeginn lassen sich diese Regeln im Spiel-Setup ein- und ausschalten:</p>
        <VariantList
          fields={mauMauRules.optionFields ?? []}
          defaults={DEFAULT_MAU_MAU_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Touch:</strong> Karte einmal antippen hebt sie an, ein zweites Antippen spielt
            sie aus. So passiert nichts aus Versehen.
          </li>
          <li>
            <strong>Maus und Tastatur:</strong> Ein Klick bzw. Enter spielt die Karte direkt aus.
          </li>
          <li>Karten lassen sich auch auf den Ablagestapel ziehen.</li>
          <li>
            Zum Ziehen auf den Stapel tippen oder „Ziehen“ wählen. Nach dem Ziehen geht es mit
            „Weiter“ zum nächsten Spieler, falls du die gezogene Karte nicht spielen möchtest.
          </li>
          <li>Mit dem Pfeil oben rechts nimmst du deinen letzten Zug zurück.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
