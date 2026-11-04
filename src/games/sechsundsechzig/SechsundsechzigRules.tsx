import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { sechsundsechzigGame } from './index'
import { DEFAULT_66_OPTIONS } from './sechsundsechzig'

export default function SechsundsechzigRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Sammle als Erster <strong>66 Augen</strong> durch Stiche und Meldungen. Wer eine Hand
          gewinnt, bekommt Gewinnpunkte; wer zuerst genug hat, gewinnt die Partie.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Augen">
        <RulesList>
          <li>Gespielt wird zu zweit mit 24 Karten (9 bis Ass), jeder bekommt sechs.</li>
          <li>
            Rangfolge und Augen: Ass 11, Zehn 10, König 4, Dame 3, Bube 2, Neun 0 – die Zehn steht
            also über dem König.
          </li>
          <li>
            Die oberste Karte nach dem Austeilen liegt offen unter dem Stapel und bestimmt den{' '}
            <strong>Trumpf</strong>.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>
            Solange der Stapel offen ist, muss man <strong>nicht bedienen</strong>. Den Stich
            gewinnt die höhere Karte der ausgespielten Farbe oder ein Trumpf.
          </li>
          <li>Nach jedem Stich zieht der Gewinner zuerst eine Karte, dann der andere.</li>
          <li>
            Ist der Stapel leer oder zugedreht, gilt <strong>Farb- und Stichzwang</strong>: Farbe
            bedienen und möglichst überstechen, sonst trumpfen, wenn möglich.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Melden, Tauschen, Zudrehen">
        <RulesList>
          <li>
            Wer ausspielt, darf König und Dame einer Farbe <strong>melden</strong>: 20 Augen, in
            Trumpf 40. Eine der beiden Karten wird dabei ausgespielt. Die Augen zählen erst, wenn
            man mindestens einen Stich hat.
          </li>
          <li>
            Wer ausspielt und die <strong>Trumpf-Neun</strong> hat, darf sie gegen die offene
            Trumpfkarte tauschen.
          </li>
          <li>
            <strong>Zudrehen:</strong> Wer ausspielt, kann den Stapel schließen. Ab dann gelten die
            strengen Regeln und niemand zieht mehr – man muss aber selbst 66 erreichen.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>
            Wer 66 Augen erreicht, gewinnt die Hand sofort: 1 Gewinnpunkt, 2 wenn der andere unter
            33 Augen hat („Schneider“), 3 wenn er keinen Stich hat („Schwarz“).
          </li>
          <li>
            Schafft der Zudreher keine 66, bekommt der andere 2 Gewinnpunkte (3, wenn er beim
            Zudrehen noch keinen Stich hatte).
          </li>
          <li>Erreicht niemand 66, gewinnt der letzte Stich – er zählt 10 Augen extra.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={sechsundsechzigGame.optionFields ?? []}
          defaults={DEFAULT_66_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
