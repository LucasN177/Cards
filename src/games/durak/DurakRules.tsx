import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_DURAK_OPTIONS } from './durak'
import { durakGame } from './index'

export default function DurakRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Werde deine Karten los. Wer am Ende als Letzter noch Karten hat, ist der{' '}
          <strong>Durak</strong> (russisch für „Dummkopf“) und hat verloren – alle anderen gewinnen.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>Gespielt wird mit 36 Karten (6 bis Ass), jeder bekommt sechs.</li>
          <li>
            Die unterste Karte des Stapels liegt offen und bestimmt den <strong>Trumpf</strong>; sie
            wird als letzte gezogen.
          </li>
          <li>
            Eine Karte <strong>sticht</strong> eine höhere Karte derselben Farbe – oder jeder Trumpf
            eine Nicht-Trumpf-Karte.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Angriff und Verteidigung">
        <RulesList>
          <li>Wer den niedrigsten Trumpf hat, greift zuerst seinen linken Nachbarn an.</li>
          <li>
            Der Angreifer legt eine Karte, der Verteidiger muss sie stechen oder alles{' '}
            <strong>aufnehmen</strong>.
          </li>
          <li>
            Nach jedem Stechen darf eine weitere Karte <strong>beigelegt</strong> werden, deren Wert
            schon auf dem Tisch liegt – zuerst vom Angreifer, danach von den anderen (siehe
            Einstellungen). Höchstens sechs Angriffskarten, und nie mehr, als der Verteidiger zu
            Beginn auf der Hand hatte.
          </li>
          <li>
            Wollen alle „<strong>Fertig</strong>“ sagen und ist alles gestochen, kommen die Karten
            aus dem Spiel. Der Verteidiger greift als Nächster an.
          </li>
          <li>Nimmt der Verteidiger auf, wird er übersprungen: Sein linker Nachbar greift an.</li>
          <li>
            Danach füllen alle auf sechs Karten auf, zuerst der Angreifer, der Verteidiger zuletzt.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende">
        <RulesList>
          <li>Ist der Stapel leer, scheidet aus, wer keine Karten mehr hat.</li>
          <li>
            Der Letzte mit Karten ist der Durak. Werden die letzten beiden gleichzeitig fertig, gibt
            es keinen.
          </li>
          <li>Bist du raus, endet das Spiel für dich als Sieg.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={durakGame.optionFields ?? []}
          defaults={DEFAULT_DURAK_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
