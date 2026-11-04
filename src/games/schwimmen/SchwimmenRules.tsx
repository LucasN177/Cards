import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { schwimmenGame } from './index'
import { DEFAULT_SCHWIMMEN_OPTIONS } from './schwimmen'

export default function SchwimmenRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Sammle drei Karten mit möglichst hohem Wert – am besten <strong>31</strong>. Wer am Ende
          einer Runde den niedrigsten Wert hat, verliert ein Leben. Wer zuletzt noch im Spiel ist,
          gewinnt.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Werte">
        <RulesList>
          <li>Gespielt wird mit 32 Karten (7 bis Ass).</li>
          <li>
            Ass zählt 11, Zehn, Bube, Dame und König je 10, die übrigen Karten ihren Augenwert.
          </li>
          <li>
            Gezählt werden nur Karten <strong>einer Farbe</strong>: Pik-Ass, Pik-König und Herz-7
            sind 21.
          </li>
          <li>
            Drei gleiche Karten (z. B. drei Damen) zählen <strong>30½</strong>.
          </li>
          <li>Das Beste ist 31: Ass und zwei Zehnerkarten derselben Farbe.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ablauf">
        <RulesList>
          <li>Jeder bekommt drei Karten, drei weitere liegen offen in der Mitte.</li>
          <li>
            Wer dran ist, macht genau einen Zug:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <strong>Tauschen:</strong> eine eigene Karte gegen eine aus der Mitte,
              </li>
              <li>
                <strong>Alle tauschen:</strong> alle drei Karten gegen die Mitte,
              </li>
              <li>
                <strong>Schieben:</strong> nichts tun. Schieben alle hintereinander, kommen drei
                neue Karten vom Stapel in die Mitte,
              </li>
              <li>
                <strong>Klopfen:</strong> du bist zufrieden. Jeder andere hat noch genau einen Zug,
                dann wird gewertet.
              </li>
            </ul>
          </li>
          <li>
            Hat jemand nach seinem Zug 31 („<strong>Feuer</strong>“), endet die Runde sofort.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Leben und Schwimmen">
        <RulesList>
          <li>
            Wer am Rundenende den niedrigsten Wert hat, verliert ein Leben (bei Gleichstand alle).
          </li>
          <li>
            Ohne Leben <strong>schwimmt</strong> man: Man spielt weiter, verliert man aber noch
            einmal, scheidet man aus.
          </li>
          <li>
            Würden alle Übrigen gleichzeitig untergehen, scheidet niemand aus und es geht weiter.
          </li>
          <li>Bist du ausgeschieden, endet das Spiel für dich.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={schwimmenGame.optionFields ?? []}
          defaults={DEFAULT_SCHWIMMEN_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
