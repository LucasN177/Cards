import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_KLONDIKE_OPTIONS, klondikeGame } from './klondike'

export default function KlondikeRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Lege alle 52 Karten auf die vier <strong>Ablagestapel</strong> – je Farbe einen, vom Ass
          bis zum König.
        </p>
      </RulesSection>

      <RulesSection title="Aufbau">
        <RulesList>
          <li>
            <strong>Sieben Reihen:</strong> Die erste Reihe hat eine Karte, die zweite zwei, bis zur
            siebten mit sieben Karten. Nur die jeweils unterste Karte liegt offen.
          </li>
          <li>
            <strong>Stapel:</strong> Die übrigen 24 Karten liegen verdeckt oben links. Daneben
            entsteht die offene Ablage.
          </li>
          <li>
            <strong>Ablagestapel:</strong> Die vier Felder oben rechts sind zu Beginn leer.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielzüge">
        <RulesList>
          <li>
            In den Reihen wird <strong>absteigend und in abwechselnden Farben</strong> angelegt: auf
            eine schwarze 9 passt eine rote 8, auf die rote 8 eine schwarze 7.
          </li>
          <li>
            Eine geordnete Folge offener Karten kann <strong>als Ganzes</strong> verschoben werden.
          </li>
          <li>
            Wird eine verdeckte Karte frei, wird sie <strong>automatisch aufgedeckt</strong>.
          </li>
          <li>
            In eine <strong>leere Reihe</strong> darf nur ein König (mit allem, was darauf liegt).
          </li>
          <li>
            Auf die Ablagestapel kommen einzelne Karten derselben Farbe in aufsteigender Folge: Ass,
            2, 3 … bis König. Eine Karte kann von dort auch zurück in eine Reihe geholt werden.
          </li>
          <li>
            Ein Tipp auf den <strong>Stapel</strong> deckt eine Karte (oder drei, siehe Varianten)
            auf die Ablage auf; nur die oberste ist spielbar. Ist der Stapel leer, wird die Ablage
            umgedreht und wieder zum Stapel – so oft du willst.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spielende">
        <p>
          Gewonnen hast du, sobald alle Karten auf den Ablagestapeln liegen. Sind alle Karten
          aufgedeckt und der Stapel leer, kannst du den Rest mit{' '}
          <strong>„Automatisch ablegen“</strong> erledigen lassen.
        </p>
        <p>
          Nicht jedes Spiel ist lösbar. Mit <strong>„Aufgeben“</strong> beendest du die Partie; sie
          zählt in der Statistik als Niederlage. Gewertet wird die Zahl der abgelegten Karten.
        </p>
        <p>
          Findet die App <strong>keinen sinnvollen Zug</strong> mehr – also nichts, das auf einen
          Ablagestapel kann, keine verdeckte Karte, die sich aufdecken lässt, und keine Karte aus
          dem Stapel, die irgendwo passt –, zeigt sie einen Hinweis. Du kannst dann Züge
          zurücknehmen und es anders versuchen oder direkt aufgeben.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Varianten in diesem Spiel' : 'Varianten'}>
        <VariantList
          fields={klondikeGame.optionFields ?? []}
          defaults={DEFAULT_KLONDIKE_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            <strong>Antippen</strong> legt eine Karte automatisch an den besten Platz – zuerst auf
            einen Ablagestapel, sonst auf eine passende Reihe. Geht nichts, blinkt die Karte rot.
          </li>
          <li>
            <strong>Ziehen</strong> legt sie genau dorthin, wo du sie loslässt. Ziehst du eine Karte
            aus der Mitte einer Reihe, wandern die Karten darauf mit.
          </li>
          <li>
            Karten auf den Ablagestapeln lassen sich nur durch Ziehen zurückholen, damit nichts aus
            Versehen passiert.
          </li>
          <li>Jeder Zug lässt sich mit dem Pfeil oben rechts zurücknehmen.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
