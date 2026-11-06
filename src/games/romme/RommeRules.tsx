import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { rommeGame } from './index'
import { DEFAULT_ROMME_OPTIONS } from './romme'

export default function RommeRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Werde als Erster alle Karten los, indem du sie in <strong>Sätzen</strong> und{' '}
          <strong>Folgen</strong> auslegst. Die anderen bekommen die Werte ihrer übrigen Karten als
          Strafpunkte – wer am Ende die wenigsten hat, gewinnt.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>110 Karten: zwei Blätter mit je 52 Karten und sechs Joker.</li>
          <li>Jeder bekommt 13 Karten; wer beginnt, bekommt 14 und zieht im ersten Zug nicht.</li>
          <li>
            <strong>Satz:</strong> drei oder vier Karten gleichen Werts in verschiedenen Farben.
          </li>
          <li>
            <strong>Folge:</strong> mindestens drei Karten einer Farbe in lückenloser Reihe. Das Ass
            darf unten (A-2-3) oder oben (D-K-A) stehen, aber nicht „um die Ecke“ (K-A-2).
          </li>
          <li>
            Der <strong>Joker</strong> ersetzt jede Karte – höchstens so viele Joker wie echte
            Karten in einer Kombination.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ein Zug">
        <RulesList>
          <li>Zieh eine Karte vom Stapel oder nimm die oberste Karte der Ablage.</li>
          <li>
            Leg Kombinationen aus und – wenn du schon ausgelegt hast – leg Karten an alle
            Kombinationen auf dem Tisch an.
          </li>
          <li>
            Leg zum Schluss eine Karte ab. Die gerade von der Ablage genommene Karte darfst du nicht
            sofort wieder ablegen.
          </li>
          <li>
            Beim <strong>ersten Auslegen</strong> müssen deine Kombinationen zusammen mindestens 40
            Punkte bringen (einstellbar). Werte: 2–9 nach Zahl, 10/Bube/Dame/König 10, Ass 11 (in
            A-2-3 nur 1), Joker wie die Karte, die er ersetzt.
          </li>
          <li>In der App merkst du Gruppen vor und legst sie dann gemeinsam aus.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Rundenende">
        <RulesList>
          <li>Wer seine letzte Karte auslegt, anlegt oder ablegt, beendet die Runde.</li>
          <li>Strafpunkte der anderen: Joker 20, Ass 11, 10 bis König 10, sonst der Zahlenwert.</li>
          <li>
            <strong>Hand-Rommé:</strong> Wer alle Karten in einem einzigen Zug loswird, ohne vorher
            ausgelegt zu haben, verdoppelt die Strafpunkte der anderen.
          </li>
          <li>Ist der Stapel leer, wird die Ablage (bis auf die oberste Karte) neu gemischt.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={rommeGame.optionFields ?? []}
          defaults={DEFAULT_ROMME_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
