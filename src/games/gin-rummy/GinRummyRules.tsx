import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_GIN_OPTIONS, ginRules } from './gin'

export default function GinRummyRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Gin Rummy ist ein Rommé für zwei. Ordne deine zehn Karten zu <strong>Sätzen</strong> und{' '}
          <strong>Folgen</strong> und halte das übrige <strong>Totholz</strong> klein. Wer zuerst
          klopft und weniger Totholz hat als der Gegner, bekommt den Unterschied als Punkte.
          Gespielt wird, bis jemand die Zielpunktzahl erreicht.
        </p>
      </RulesSection>

      <RulesSection title="Karten und Kombinationen">
        <RulesList>
          <li>52 Karten, jeder bekommt zehn. Die nächste Karte wird als Ablage aufgedeckt.</li>
          <li>
            <strong>Satz:</strong> drei oder vier Karten gleichen Werts. <strong>Folge:</strong>{' '}
            mindestens drei Karten einer Farbe in Reihe. Das Ass ist immer die niedrigste Karte
            (A-2-3, aber nicht D-K-A).
          </li>
          <li>
            Jede Karte zählt nur in einer Kombination. Die App ordnet deine Hand automatisch so,
            dass das Totholz am kleinsten ist – Karten in Kombinationen sind markiert.
          </li>
          <li>
            <strong>Totholz</strong> sind die Karten außerhalb von Kombinationen: Ass 1, Zahlen
            ihren Wert, Bube, Dame und König 10.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Ein Zug">
        <RulesList>
          <li>
            Zu Beginn einer Hand darf zuerst der Nicht-Geber die aufgedeckte Karte nehmen, dann der
            Geber. Passen beide, zieht der Nicht-Geber vom Stapel.
          </li>
          <li>
            Danach ziehst du jeden Zug eine Karte – vom Stapel oder die oberste Ablage – und legst
            eine ab. Die gerade aufgenommene Ablagekarte darfst du nicht gleich wieder ablegen.
          </li>
          <li>
            <strong>Klopfen:</strong> Hast du nach dem Ablegen höchstens 10 Punkte Totholz, darfst
            du klopfen. Beide Hände werden aufgedeckt.
          </li>
          <li>
            Der Gegner legt seine Kombinationen und darf Totholz an deine Kombinationen{' '}
            <strong>anlegen</strong> – außer du hast Gin.
          </li>
          <li>
            Liegen nur noch zwei Karten im Stapel und niemand hat geklopft, zählt die Hand nicht und
            wird neu gegeben.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>
            <strong>Klopfen:</strong> Wer klopft, bekommt den Unterschied der beiden Totholz-Werte.
          </li>
          <li>
            <strong>Gin</strong> (kein Totholz): das Totholz des Gegners plus 25.{' '}
            <strong>Big Gin</strong> (alle elf Karten in Kombinationen, ohne abzulegen): plus 31.
          </li>
          <li>
            <strong>Unterschneiden:</strong> Hat der Gegner nach dem Anlegen höchstens so viel
            Totholz wie der Klopfende, bekommt er den Unterschied plus 25.
          </li>
          <li>Wer eine Hand gewinnt, gibt die nächste.</li>
          <li>
            Am Ende (mit Bonuspunkten): Der Sieger bekommt 100 Punkte Spielbonus, jeder 25 Punkte
            pro gewonnener Hand. Hat der Verlierer keine Hand gewonnen, zählen die Punkte des
            Siegers doppelt.
          </li>
          <li>
            <strong>Oklahoma:</strong> Die erste aufgedeckte Karte bestimmt, mit wie viel Totholz
            man klopfen darf (Bilder 10, Ass: nur Gin). Ist sie ein Pik, zählt die Hand doppelt.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={ginRules.optionFields ?? []}
          defaults={DEFAULT_GIN_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>

      <RulesSection title="Bedienung">
        <RulesList>
          <li>Tippe auf den Stapel oder die Ablage, um zu ziehen.</li>
          <li>
            Tippe eine Karte an und dann auf „ablegen“ oder „Klopfen“ – der Knopf zeigt dir, wie
            viel Totholz danach bleibt.
          </li>
          <li>Nach jeder Hand siehst du beide Hände aufgedeckt und den Zwischenstand.</li>
        </RulesList>
      </RulesSection>
    </div>
  )
}
