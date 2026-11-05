import { type RulesProps, RulesList, RulesSection, VariantList } from '@/features/rules/RulesText'
import { DEFAULT_BRIDGE_OPTIONS } from './bridge'
import { bridgeGame } from './index'

export default function BridgeRules({ options }: RulesProps) {
  return (
    <div className="space-y-6">
      <RulesSection title="Ziel">
        <p>
          Zwei Paare spielen gegeneinander: du (Süd) mit deinem Partner (Nord) gegen Ost und West.
          In der <strong>Reizung</strong> legt ihr fest, wie viele der 13 Stiche ihr in welcher
          Trumpffarbe schaffen wollt – danach müsst ihr das auch erfüllen.
        </p>
      </RulesSection>

      <RulesSection title="Reizung">
        <RulesList>
          <li>Der Geber beginnt, dann geht es im Uhrzeigersinn reihum.</li>
          <li>
            Ein Gebot besteht aus einer Stufe (1 bis 7) und einer Farbe oder SA (Sans Atout, ohne
            Trumpf). Stufe 1 heißt sieben Stiche, Stufe 7 alle dreizehn.
          </li>
          <li>
            Jedes Gebot muss höher sein als das vorige: erst die Stufe, bei gleicher Stufe die Farbe
            in der Reihenfolge ♣ &lt; ♦ &lt; ♥ &lt; ♠ &lt; SA.
          </li>
          <li>
            Statt zu bieten kann man passen, ein Gebot der Gegner <strong>kontrieren</strong> oder
            ein Kontra der Gegner <strong>rekontrieren</strong>.
          </li>
          <li>
            Nach drei Pässen hintereinander steht der Kontrakt. Passen alle vier sofort, wird neu
            gegeben.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Spiel">
        <RulesList>
          <li>
            <strong>Alleinspieler</strong> ist, wer vom erfolgreichen Paar die Kontraktfarbe zuerst
            geboten hat. Links von ihm wird ausgespielt.
          </li>
          <li>
            Danach legt sein Partner, der <strong>Dummy</strong>, seine Karten offen auf den Tisch.
            Der Alleinspieler spielt sie für ihn.
          </li>
          <li>
            Farbe muss bedient werden. Den Stich gewinnt der höchste Trumpf, sonst die höchste Karte
            der ausgespielten Farbe.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title="Wertung">
        <RulesList>
          <li>
            Stichwert je Stich über sechs: ♣/♦ 20, ♥/♠ 30, SA 40 für den ersten und 30 für jeden
            weiteren. Kontra verdoppelt, Rekontra vervierfacht.
          </li>
          <li>
            Ab 100 Stichwert ist es ein <strong>Vollspiel</strong> (3 SA, 4 ♥/♠, 5 ♣/♦): +300, in
            Gefahr +500. Sonst +50 für das Teilspiel.
          </li>
          <li>Kleinschlemm (Stufe 6) +500 (in Gefahr 750), Großschlemm (Stufe 7) +1000 (1500).</li>
          <li>
            Überstiche zählen ihren Stichwert; kontriert 100 (in Gefahr 200), rekontriert doppelt.
            Für einen erfüllten kontrierten Kontrakt gibt es 50, rekontriert 100 extra.
          </li>
          <li>
            Faller: je 50 (in Gefahr 100). Kontriert: 100, 200, 200, dann je 300 – in Gefahr 200,
            dann je 300. Rekontriert doppelt so viel. Die Punkte bekommen die Gegner.
          </li>
          <li>
            Gefahrenlage nach Chicago: In der ersten von vier Austeilungen ist niemand in Gefahr, in
            der zweiten und dritten die Seite des Gebers, in der vierten beide.
          </li>
        </RulesList>
      </RulesSection>

      <RulesSection title={options ? 'Einstellungen in diesem Spiel' : 'Einstellungen'}>
        <VariantList
          fields={bridgeGame.optionFields ?? []}
          defaults={DEFAULT_BRIDGE_OPTIONS as unknown as Record<string, unknown>}
          options={options}
        />
      </RulesSection>
    </div>
  )
}
