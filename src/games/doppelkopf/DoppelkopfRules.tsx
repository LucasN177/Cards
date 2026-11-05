import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_DOPPELKOPF_OPTIONS } from './doppelkopf'
import { doppelkopfGame } from './index'

export default function DoppelkopfRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Vier Spieler in zwei Parteien: <strong>Re</strong> (wer eine Kreuz-Dame hat) gegen{' '}
          <strong>Kontra</strong>. Wer zu wem gehört, zeigt sich erst im Lauf des Spiels. Re braucht
          121 der 240 Augen, Kontra gewinnt schon mit 120.
        </p>
      </RulesSection>

      <RulesSection title="Karten">
        <RulesList>
          <li>
            Jede Karte gibt es zweimal: 48 Karten mit Neunen (je 12) oder 40 ohne Neunen (je 10).
          </li>
          <li>Augen: Ass 11, Zehn 10, König 4, Dame 3, Bube 2, Neun 0.</li>
          <li>
            <strong>Trümpfe</strong> von hoch nach niedrig: Herz-10 („Dulle“), die Damen (Kreuz,
            Pik, Herz, Karo), die Buben (Kreuz, Pik, Herz, Karo), dann Karo-Ass, Karo-10,
            Karo-König, Karo-9.
          </li>
          <li>
            Fehlfarben: Kreuz und Pik mit Ass, 10, König, 9 – Herz nur mit Ass, König, 9 (die
            Herz-10 ist Trumpf).
          </li>
          <li>Von zwei gleichen Karten gewinnt die zuerst gespielte.</li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Vorbehalt und Soli">
        <RulesList>
          <li>
            Vor dem Spiel sagt jeder „Gesund“ oder ein <strong>Solo</strong> an. Der Solist spielt
            allein gegen drei, kommt heraus und bekommt das Dreifache.
          </li>
          <li>
            Damensolo: nur Damen sind Trumpf. Bubensolo: nur Buben. Farbsolo: wie normal, aber mit
            der gewählten Farbe statt Karo. Fleischloser: kein Trumpf.
          </li>
          <li>
            Hat ein Spieler beide Kreuz-Damen und sagt nichts, spielt er eine{' '}
            <strong>stille Hochzeit</strong> – allein, wie ein Solo, ohne dass die anderen es
            wissen.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel und Ansagen">
        <RulesList>
          <li>Links vom Geber wird ausgespielt. Farbe bzw. Trumpf muss bedient werden.</li>
          <li>
            Wer seine Partei kennt, kann <strong>Re</strong> bzw. <strong>Kontra</strong> ansagen –
            solange er noch mindestens 11 Karten hat (ohne Neunen 9). Danach sind Absagen möglich:
            „keine 90“, „keine 60“, „keine 30“, „schwarz“ (je eine Karte später).
          </li>
          <li>
            Eine Absage erhöht das eigene Ziel (z. B. „keine 90“: 151 Augen) – die Gegner gewinnen
            dann schon mit 90.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>Gewonnen 1 Punkt, gegen die Alten (Kontra gewinnt im Normalspiel) +1.</li>
          <li>
            Je +1, wenn die Verlierer unter 90, 60 bzw. 30 Augen bleiben oder keinen Stich haben.
          </li>
          <li>Re oder Kontra angesagt je +2, jede Absage +1.</li>
          <li>
            Sonderpunkte im Normalspiel: Fuchs gefangen (Karo-Ass der Gegner), Doppelkopf (Stich mit
            mindestens 40 Augen), Karlchen (Kreuz-Bube gewinnt den letzten Stich) – je +1.
          </li>
          <li>Die Gewinner bekommen die Punkte, die Verlierer verlieren sie (Solist ×3).</li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={doppelkopfGame.optionFields ?? []}
          defaults={DEFAULT_DOPPELKOPF_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
