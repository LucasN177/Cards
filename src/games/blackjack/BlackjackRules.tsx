import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { blackjackGame, DEFAULT_BLACKJACK_OPTIONS, STARTING_CHIPS } from './blackjack'

export default function BlackjackRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Komm mit deinen Karten näher an <strong>21</strong> als die Bank, ohne darüber zu gehen.
          Du startest mit {STARTING_CHIPS} Chips; gewonnen hast du, wenn du am Ende mehr hast.
        </p>
      </RulesSection>

      <RulesSection title="Kartenwerte">
        <RulesList>
          <li>2 bis 10 zählen ihren Augenwert, Bube, Dame und König je 10.</li>
          <li>
            Das <strong>Ass</strong> zählt 11 oder 1 – je nachdem, was besser ist. Zählt es 11,
            heißt die Hand „weich“.
          </li>
          <li>
            <strong>Blackjack</strong> ist ein Ass plus eine Zehnerkarte mit den ersten beiden
            Karten.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ablauf einer Runde">
        <RulesList>
          <li>Setze 5, 10 oder 25 Chips.</li>
          <li>Du und die Bank bekommen je zwei Karten; eine Karte der Bank bleibt verdeckt.</li>
          <li>
            <strong>Karte</strong> nimmt eine weitere Karte, <strong>Stehen</strong> beendet deine
            Hand. Über 21 hast du dich überkauft und verlierst sofort.
          </li>
          <li>
            <strong>Verdoppeln:</strong> Mit den ersten beiden Karten verdoppelst du den Einsatz und
            bekommst genau eine weitere Karte.
          </li>
          <li>
            <strong>Teilen:</strong> Zwei gleichwertige Karten werden zu zwei Händen mit je eigenem
            Einsatz. Geteilte Asse bekommen nur noch je eine Karte; eine 21 aus einer geteilten Hand
            zählt nicht als Blackjack.
          </li>
          <li>
            Danach deckt die Bank auf und zieht, bis sie mindestens 17 hat (siehe Einstellungen zur
            weichen 17).
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Auszahlung">
        <RulesList>
          <li>Höher als die Bank oder die Bank überkauft sich: Einsatz 1 : 1 gewonnen.</li>
          <li>Blackjack: 3 : 2 (bei 10 Chips Einsatz gibt es 15).</li>
          <li>Gleichstand: Du bekommst deinen Einsatz zurück.</li>
          <li>
            Hat die Bank Blackjack, endet die Runde sofort – außer du hast selbst Blackjack
            (Gleichstand).
          </li>
        </RulesList>
        <p>
          Das Spiel endet nach der eingestellten Zahl an Runden, wenn dir die Chips ausgehen oder du
          „Aufhören“ wählst.
        </p>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={blackjackGame.optionFields ?? []}
          defaults={DEFAULT_BLACKJACK_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Tipp">
        <p>
          Der Knopf <strong>Tipp</strong> zeigt, was die mathematische <em>Grundstrategie</em> für
          deine Hand gegen die offene Karte der Bank empfiehlt. Wer sich daran hält, verliert auf
          Dauer am wenigsten.
        </p>
      </RulesSection>
    </div>
  )
}
