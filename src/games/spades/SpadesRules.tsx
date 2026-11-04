import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { spadesGame } from './index'
import { DEFAULT_SPADES_OPTIONS } from './spades'

export default function SpadesRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Zwei Teams spielen gegeneinander: Du und dein Partner gegenüber gegen die beiden anderen.
          Sagt vor jeder Hand an, wie viele Stiche ihr macht – und schafft genau das.
        </p>
      </RulesSection>

      <RulesSection title="Ansagen">
        <RulesList>
          <li>Jeder bekommt 13 Karten und sagt nacheinander an, wie viele Stiche er erwartet.</li>
          <li>Die Ansagen beider Partner werden zur Teamansage zusammengezählt.</li>
          <li>
            <strong>Nil</strong> (0) heißt: Du willst keinen einzigen Stich machen. Das wird für
            dich allein gewertet.
          </li>
          <li>Beim Ansagen ist eine Schätzung für dein Blatt markiert.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>Links vom Geber wird ausgespielt; wer den Stich gewinnt, spielt neu aus.</li>
          <li>
            Die ausgespielte Farbe muss bedient werden. Wer nicht kann, darf beliebig abwerfen.
          </li>
          <li>
            <strong>Pik ist immer Trumpf</strong>: Der höchste Pik gewinnt, sonst die höchste Karte
            der ausgespielten Farbe.
          </li>
          <li>
            Pik darf erst ausgespielt werden, wenn es „gebrochen“ ist (jemand hat Pik abgeworfen) –
            außer man hat nur noch Pik.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>
            Ansage erfüllt: <strong>10 Punkte pro angesagtem Stich</strong>, jeder Überstich („Bag“)
            zählt 1 Punkt.
          </li>
          <li>Ansage verfehlt: 10 Punkte pro angesagtem Stich werden abgezogen.</li>
          <li>Nil geschafft: +100, Nil verfehlt: −100. Stiche eines verfehlten Nil sind Bags.</li>
          <li>Je 10 gesammelte Bags kosten 100 Punkte (abschaltbar).</li>
          <li>
            Gewonnen hat das Team, das zuerst das Ziel erreicht. Bei Gleichstand wird
            weitergespielt.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={spadesGame.optionFields ?? []}
          defaults={DEFAULT_SPADES_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
