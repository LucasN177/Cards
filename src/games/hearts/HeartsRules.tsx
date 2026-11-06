import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_HEARTS_OPTIONS, heartsRules } from './hearts'

export default function HeartsRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Hearts ist ein Stichspiel für drei bis fünf Spieler (klassisch vier), bei dem du{' '}
          <strong>möglichst wenig</strong> Punkte sammeln willst. Punkte bringen nur Herzen und die
          Pik-Dame. Wer am Ende die wenigsten Punkte hat, gewinnt.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Weitergeben">
        <RulesList>
          <li>
            Gespielt wird mit 52 Karten (zu viert bekommt jeder 13) oder – je nach Einstellung – mit
            32 Karten von 7 bis Ass (zu viert je 8). Ass ist die höchste Karte.
          </li>
          <li>
            Die Spielerzahl wählst du über die Anzahl der Gegner.{' '}
            <strong>Zu dritt oder zu fünft</strong> geht das Austeilen nicht auf: Die übrigen Karten
            (eine oder zwei) kommen verdeckt in den <strong>Topf</strong>. Wer den{' '}
            <strong>letzten Stich</strong> gewinnt, bekommt den Topf dazu – samt aller Herzen oder
            der Pik-Dame darin.
          </li>
          <li>
            Vor jeder Hand gibst du <strong>drei Karten</strong> weiter: in der ersten Hand nach
            links, dann nach rechts, dann zum Gegenüber, in der vierten Hand gar nicht – danach von
            vorn. Zu dritt oder zu fünft entfällt „gegenüber“: links, rechts, keine. Gute Kandidaten
            sind die Pik-Dame, hohe Pik und hohe Herzen.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielablauf">
        <RulesList>
          <li>
            Wer die <strong>niedrigste Kreuz</strong> hat (Kreuz 2, mit 32 Karten Kreuz 7 – liegt
            sie im Topf, die nächsthöhere), spielt sie zum ersten Stich aus.
          </li>
          <li>
            Es herrscht <strong>Bedienpflicht</strong>: Wer die ausgespielte Farbe hat, muss sie
            legen. Wer sie nicht hat, darf eine beliebige Karte abwerfen – mit einer Ausnahme:
          </li>
          <li>
            <strong>Pik-Dame-Pflicht:</strong> Wer nicht bedienen kann und die Pik-Dame auf der Hand
            hat, muss sie abwerfen – auch schon im ersten Stich.
          </li>
          <li>
            Den Stich gewinnt die <strong>höchste Karte der ausgespielten Farbe</strong>. Trümpfe
            gibt es nicht. Wer den Stich gewinnt, spielt den nächsten aus.
          </li>
          <li>
            <strong>Herz</strong> darf jederzeit ausgespielt und abgeworfen werden – Herz muss nicht
            erst „gebrochen“ werden.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <table className="w-full max-w-xs text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="py-1 pr-4">Jedes Herz</td>
              <td className="py-1 text-right font-medium text-foreground">1 Punkt</td>
            </tr>
            <tr>
              <td className="py-1 pr-4">Pik-Dame</td>
              <td className="py-1 text-right font-medium text-foreground">
                13 Punkte (mit 32 Karten 8)
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Pro Hand werden also 26 Punkte verteilt, mit 32 Karten 16. <strong>Durchmarsch:</strong>{' '}
          Wer alle Herzen und die Pik-Dame bekommt (auch über den Topf), kehrt das um – je nach
          Einstellung bekommen alle anderen diese Punkte, oder sie werden ihm selbst abgezogen. Beim
          Spiel bis 51 Punkte zählt ein Durchmarsch immer 16 Punkte.
        </p>
        <p>
          Gespielt werden so viele Hände, bis jemand die Zielpunktzahl erreicht (100, 51 oder 50).
          Dann gewinnt, wer die wenigsten Punkte hat; bei Gleichstand teilen sich mehrere den Sieg.
          Nach jeder Hand zeigt die App den Zwischenstand.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={heartsRules.optionFields ?? []}
          defaults={DEFAULT_HEARTS_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Weitergeben:</strong> Tippe drei Karten an (sie werden angehoben) und dann auf
            „Weitergeben“. Erhaltene Karten sind danach blau umrandet.
          </li>
          <li>
            <strong>Spielen:</strong> Auf dem Handy eine Karte antippen und noch einmal antippen –
            mit der Maus genügt ein Klick. Du kannst Karten auch in die Mitte ziehen.
          </li>
          <li>
            Über den Gegnern stehen ihre Punkte in dieser Hand und (Σ) insgesamt. Mit dem Pfeil oben
            rechts nimmst du deinen letzten Zug zurück.
          </li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
