import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_FREECELL_OPTIONS, freeCellGame } from './freecell'

export default function FreeCellRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Lege alle 52 Karten auf die vier <strong>Ablagestapel</strong> – je Farbe einen, vom Ass
          bis zum König. Fast jedes Spiel ist lösbar; es kommt auf die richtige Reihenfolge an.
        </p>
      </RulesSection>

      <RulesSection title="Aufbau">
        <RulesList>
          <li>
            <strong>Acht Reihen:</strong> Alle Karten liegen von Anfang an offen – vier Reihen mit
            sieben und vier mit sechs Karten.
          </li>
          <li>
            <strong>Vier freie Zellen</strong> (oben links) nehmen je eine beliebige Karte auf.
          </li>
          <li>
            <strong>Vier Ablagestapel</strong> (oben rechts) sind zu Beginn leer.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielzüge">
        <RulesList>
          <li>
            In den Reihen wird <strong>absteigend und in abwechselnden Farben</strong> angelegt: auf
            eine schwarze 9 passt eine rote 8.
          </li>
          <li>
            In eine <strong>leere Reihe</strong> darf jede Karte.
          </li>
          <li>
            Jede oberste Karte darf in eine freie Zelle; von dort kann sie später zurück in eine
            Reihe oder auf ihren Ablagestapel.
          </li>
          <li>
            Eigentlich wird immer nur eine Karte bewegt. Eine <strong>geordnete Folge</strong>{' '}
            darfst du trotzdem am Stück verschieben, wenn genug Platz zum Umschichten da ist:
            höchstens (freie Zellen + 1) × 2 hoch (leere Reihen) Karten. Soll die Folge in eine
            leere Reihe, zählt diese Reihe nicht mit. Die Statuszeile zeigt, wie viele es gerade
            sind.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende">
        <p>
          Gewonnen hast du, wenn alle Karten auf den Ablagestapeln liegen. Mit{' '}
          <strong>„Aufgeben“</strong> beendest du die Partie als Niederlage. Kann keine Karte mehr
          bewegt werden, zeigt die App einen Hinweis.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Varianten in diesem Spiel' : 'Varianten'}>
        <p>
          Mit „Automatisch ablegen“ wandern Karten von selbst auf die Ablagen, sobald sie in den
          Reihen nicht mehr gebraucht werden – also wenn keine niedrigere Karte der anderen Farbe
          mehr auf sie gelegt werden könnte. Ein Zurücknehmen nimmt das mit zurück.
        </p>
        <VariantList
          fields={freeCellGame.optionFields ?? []}
          defaults={DEFAULT_FREECELL_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Antippen</strong> legt eine Karte an den besten Platz: Ablage, dann eine
            passende Reihe, dann eine leere Reihe, zuletzt eine freie Zelle.
          </li>
          <li>
            <strong>Ziehen</strong> legt sie genau dort ab, wo du sie loslässt – auch ganze Folgen.
          </li>
          <li>
            <strong>Tipp</strong> zeigt einen sinnvollen nächsten Zug, der Pfeil oben rechts nimmt
            Züge zurück.
          </li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
