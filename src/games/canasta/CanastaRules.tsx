import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { canastaRules, DEFAULT_CANASTA_OPTIONS } from './canasta'

export default function CanastaRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Sammle Punkte, indem du Karten gleichen Werts meldest und daraus <strong>Canastas</strong>{' '}
          (Meldungen aus mindestens sieben Karten) baust. Zu viert spielst du mit dem Partner
          gegenüber zusammen, zu zweit oder dritt jeder für sich. Gespielt wird, bis eine Seite die
          Zielpunktzahl erreicht.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>108 Karten: zwei Blätter mit je 52 Karten und vier Joker.</li>
          <li>
            Zu viert bekommt jeder 11 Karten und zieht eine pro Zug; zu dritt 13, zu zweit 15 Karten
            – dann zieht man zwei Karten und braucht zwei Canastas zum Ausmachen.
          </li>
          <li>
            <strong>Joker und Zweien</strong> sind wild und ersetzen jede Karte.
          </li>
          <li>
            <strong>Rote Dreien</strong> sind Bonuskarten: Sie werden sofort offen ausgelegt, du
            bekommst Ersatz vom Stapel (je 100 Punkte, alle vier 800).
          </li>
          <li>
            <strong>Schwarze Dreien</strong> sperren den Ablagestapel für den nächsten Spieler.
            Melden darfst du sie nur beim Ausmachen.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Melden">
        <RulesList>
          <li>
            Eine Meldung besteht aus mindestens drei Karten <strong>gleichen Werts</strong>, davon
            mindestens zwei natürliche und höchstens drei wilde Karten. Folgen gibt es nicht.
          </li>
          <li>Jede Seite hat pro Wert nur eine Meldung; weitere Karten werden angelegt.</li>
          <li>
            Die <strong>erste Meldung</strong> einer Seite braucht Punkte nach ihrem Stand: unter 0
            Punkten 15, bis 1495 Punkte 50, bis 2995 Punkte 90, sonst 120.
          </li>
          <li>
            Ein <strong>Canasta</strong> hat sieben oder mehr Karten: rein (ohne wilde Karten) 500,
            gemischt 300 Punkte.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ein Zug">
        <RulesList>
          <li>Zieh vom Stapel – oder nimm den ganzen Ablagestapel auf.</li>
          <li>
            Den <strong>Ablagestapel</strong> nimmst du, wenn du die oberste Karte sofort melden
            kannst: mit zwei passenden Karten aus der Hand (eine natürliche und eine wilde genügen)
            oder durch Anlegen an eure Meldung dieses Werts. Die erste Meldung muss dabei die
            Mindestpunkte erreichen.
          </li>
          <li>
            <strong>Eingefroren</strong> ist der Stapel, solange deine Seite noch nichts gemeldet
            hat oder eine wilde Karte darin liegt: Dann brauchst du zwei natürliche Karten zur
            obersten Karte. Liegt eine schwarze Drei oder eine wilde Karte oben, geht es gar nicht.
          </li>
          <li>Melde und lege an, so viel du willst, und leg zum Schluss eine Karte ab.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ausmachen und Wertung">
        <RulesList>
          <li>
            Du machst aus, wenn du deine letzte Karte meldest oder ablegst – das geht erst, wenn
            deine Seite genug Canastas hat. Ausmachen bringt 100 Punkte, <strong>verdeckt</strong>{' '}
            (deine Seite hatte vorher nichts gemeldet) 200.
          </li>
          <li>
            Jede Seite bekommt die Werte ihrer gemeldeten Karten plus Canastas, rote Dreien und
            Ausmachen – und verliert die Werte der Karten, die ihre Spieler noch auf der Hand haben.
            Hat eine Seite nichts gemeldet, zählen ihre roten Dreien minus.
          </li>
          <li>
            Kartenwerte: Joker 50, Zwei und Ass 20, König bis Acht 10, Sieben bis Vier und schwarze
            Drei 5.
          </li>
          <li>Ist der Stapel aufgebraucht, endet die Hand ohne Ausmachen.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={canastaRules.optionFields ?? []}
          defaults={DEFAULT_CANASTA_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>
            Wähle Karten eines Werts (wilde Karten dazu) und tippe „vormerken“ – oder tippe eure
            Meldung an, um sie dort anzulegen. Vorgemerkte Karten sind blau umrandet.
          </li>
          <li>
            „Auslegen“ meldet alles Vorgemerkte auf einmal; vor dem Ziehen nimmt „Ablage aufnehmen“
            den Ablagestapel mit den vorgemerkten Karten auf. Ein Hinweis sagt dir, was noch fehlt.
          </li>
          <li>Zum Ablegen genau eine Karte wählen und „ablegen“ tippen.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
