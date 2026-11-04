import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_SPIDER_OPTIONS, spiderGame } from './spider'

export default function SpiderRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Bilde in den Reihen <strong>acht vollständige Folgen vom König bis zum Ass</strong> in
          jeweils einer Farbe. Jede fertige Folge wird automatisch abgelegt.
        </p>
      </RulesSection>

      <RulesSection title="Aufbau">
        <RulesList>
          <li>Gespielt wird mit 104 Karten – zwei Kartenspielen.</li>
          <li>
            <strong>Zehn Reihen:</strong> Die ersten vier haben sechs, die übrigen fünf Karten. Nur
            die jeweils unterste liegt offen.
          </li>
          <li>
            Die restlichen 50 Karten bilden den <strong>Stapel</strong> oben links.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielzüge">
        <RulesList>
          <li>
            Eine Karte passt auf jede Karte, die <strong>einen Rang höher</strong> ist – egal
            welcher Farbe: eine 7 auf jede 8.
          </li>
          <li>
            Mehrere Karten darfst du nur zusammen verschieben, wenn sie eine geordnete Folge{' '}
            <strong>derselben Farbe</strong> bilden. Darum lohnt es sich, gleiche Farben aufeinander
            zu bauen.
          </li>
          <li>
            In eine <strong>leere Reihe</strong> darf jede Karte oder Folge.
          </li>
          <li>Wird eine verdeckte Karte frei, wird sie automatisch aufgedeckt.</li>
          <li>
            Ein Tipp auf den <strong>Stapel</strong> legt auf jede der zehn Reihen eine neue Karte.
            Das geht nur, wenn keine Reihe leer ist.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende">
        <p>
          Gewonnen hast du mit acht fertigen Folgen. Mit <strong>„Aufgeben“</strong> endet die
          Partie als Niederlage; gewertet wird die Zahl der fertigen Folgen. Findet die App keinen
          sinnvollen Zug mehr und ist der Stapel leer, zeigt sie einen Hinweis.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Varianten in diesem Spiel' : 'Varianten'}>
        <VariantList
          fields={spiderGame.optionFields ?? []}
          defaults={DEFAULT_SPIDER_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Antippen</strong> legt eine Karte (mit allem, was darauf liegt) an den besten
            Platz: zuerst auf dieselbe Farbe, dann auf eine passende Karte, dann in eine leere
            Reihe.
          </li>
          <li>
            <strong>Ziehen</strong> legt sie genau dort ab, wo du sie loslässt.
          </li>
          <li>
            <strong>Tipp</strong> zeigt einen sinnvollen Zug, der Pfeil oben rechts nimmt Züge
            zurück.
          </li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
