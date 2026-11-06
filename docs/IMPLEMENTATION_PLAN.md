# Cards – Implementierungsplan

Abgeleitet aus der [README](../README.md). Ziel: eine rein clientseitige, statisch auf GitHub Pages gehostete
Kartenspiel-Plattform mit modularer Game Engine und austauschbaren KI-Gegnern.

## 1. Rahmenbedingungen

| Thema      | Entscheidung (aus README)                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| Plattform  | Browser, responsive (Desktop, Tablet, Mobile)                                                |
| Backend    | Keins für Single-Player; alles lokal                                                         |
| Persistenz | `localStorage` / IndexedDB (Settings, Statistiken, Spielstände)                              |
| Offline    | PWA (Service Worker)                                                                         |
| Hosting    | GitHub Pages, Build & Deploy über GitHub Actions                                             |
| Stack      | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, Framer Motion, Vitest, Playwright |

## 2. Architekturprinzipien

1. **Engine ist UI-frei.** Game Engine, Spiele und KI sind reines TypeScript ohne React-Abhängigkeit
   → vollständig mit Vitest testbar, später auch in einem Web Worker oder Server lauffähig.
2. **Spiele sind Plugins.** Jedes Spiel registriert sich über ein `GameDefinition`-Objekt in einer Registry.
   Neue Spiele erfordern keine Änderung am Engine-Kern.
3. **Unveränderlicher Zustand + Aktionen.** Spielzustand ist serialisierbar; Züge sind Aktionen
   (`applyAction(state, action) → state`). Das ermöglicht Undo, Replay, Speichern und KI-Simulation.
4. **Informationsmodell.** Jeder Spieler (Mensch oder KI) sieht nur eine `PlayerView` (verdeckte Karten maskiert).
   KI darf nicht schummeln.
5. **Deterministischer Zufall.** Seedbarer RNG für reproduzierbare Partien, Tests und Replays.

## 3. Ordnerstruktur

```text
src/
├── app/            App-Shell, Routing, Provider, Layout
├── components/
│   └── ui/         shadcn/ui-Komponenten (generiert)
├── engine/         Spielunabhängiger Kern
│   ├── core/       Typen, GameDefinition, Registry, Game Loop, RNG
│   ├── cards/      Karte, Farben/Ränge, Decks (52, 32 Skat, 24/48 Doko, …), Mischen
│   ├── players/    Spieler, Sitzplätze, Teams
│   └── scoring/    Gemeinsame Punktelogik, Match-Verwaltung
├── ai/             KI-Infrastruktur: Agent-Interface, Schwierigkeitsgrade,
│                   generische Strategien (Random, Heuristik, Monte-Carlo/ISMCTS)
├── games/          Ein Ordner pro Spiel: rules, state, actions, ai, ui, tests
├── features/       UI-Features: table, cards, settings, statistics, tutorial
├── stores/         Zustand-Stores (Settings, aktive Partie, Statistiken)
├── lib/            Hilfsfunktionen (cn, storage, …)
└── styles/         Tailwind / globale Styles
e2e/                Playwright-Tests
```

## 4. Kern-Schnittstellen (Entwurf – maßgeblich ist `src/engine/core/game.ts`)

```ts
interface GameDefinition<State, Action, Options> {
  id: string;                      // "mau-mau"
  name: string;
  players: { min: number; max: number };
  defaultOptions: Options;         // Regelvarianten
  setup(options: Options, seed: number, players: PlayerInfo[]): State;
  getPlayerView(state: State, playerId: PlayerId): PlayerView<State>;
  getLegalActions(state: State, playerId: PlayerId): Action[];
  applyAction(state: State, action: Action): State;
  getCurrentPlayer(state: State): PlayerId | null;
  isTerminal(state: State): boolean;
  getScores(state: State): Record<PlayerId, number>;
  createAi?(difficulty: Difficulty): AiAgent<State, Action>;
}

interface AiAgent<State, Action> {
  chooseAction(view: PlayerView<State>, legal: Action[], ctx: AiContext): Promise<Action>;
  explain?(...): string;           // optionale Begründung für Entscheidungen
}
```

## 5. Phasen

### Phase 0 – Projekt-Setup ✅

- Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui-Konfiguration, Pfad-Alias `@/`
- Zustand, Framer Motion installiert
- Vitest (+ Testing Library, jsdom) und Playwright eingerichtet
- Linting (oxlint) und Formatierung (Prettier)
- GitHub-Actions-Workflows: CI (Lint, Typecheck, Tests, Build) und Deploy auf GitHub Pages
- PWA: installierbar, Offline-Cache per Service Worker (vite-plugin-pwa), Update-Hinweis statt Auto-Reload, App-Icons
- Leere Ordnerstruktur gemäß Abschnitt 3

### Phase 1 – Engine-Fundament ✅

- **M1 – Karten & Zufall:** Kartenmodell (französisches Blatt intern, deutsches Blatt ist nur ein
  Darstellungsstil), Joker, Deck-Presets (52, 36, 32, 24, Doppelkopf 48, Rommé/Canasta),
  seedbarer RNG mit serialisierbarem Zustand, Mischen, Geben
- **M2 – Spielmodell:** `GameDefinition`-Vertrag, `PlayerView`, Game Registry, Sitzreihenfolge
- **M3 – Game Session:** Zugsteuerung und -validierung, KI-Züge über `AiAgent`, Aktionshistorie,
  Undo, Speichern/Laden per deterministischem Replay, Simulation (KI gegen KI), `RandomAgent`
- Hohe Testabdeckung (Vitest), inkl. Simulationstests mit einem Test-Spiel

### Phase 2 – UI-Fundament ✅

- **M4 – App-Shell ✅:** Routing (Spielauswahl → Konfiguration → Tisch), Settings-Store mit
  Persistenz, Light/Dark-Theme, erste shadcn/ui-Komponenten
- **M5 – Tisch & Karten ✅:** Kartenkomponente (SVG, mehrere Deck-Stile), Hand, Stapel, Tisch-Layout,
  Anbindung `GameSession` ↔ React, Animationen mit Framer Motion, Drag & Drop, Spielgeschwindigkeit

### Phase 3 – Erstes Spiel end-to-end: **Mau-Mau** ✅

- **M6 – Mau-Mau spielbar ✅:** Regeln mit Varianten (7 ziehen, 7 auf 7, 8 aussetzen,
  9 Richtungswechsel, Bube wünschen, Bube auf Bube, 5–7 Karten), Strafpunkte, Patt-Regel;
  Regelwerk zum Nachlesen (eigene Seite und im Spiel); Regeloptionen im Setup (generisch über
  `optionFields`); Playwright-E2E: komplette Partie gegen KI auf Desktop und Handy
- KI-Stufen: Anfänger (zufällige passende Karte), Fortgeschritten (Heuristik), Experte
  (Determinization + Monte-Carlo-Rollouts mit Gegnermodell aus öffentlichen Zügen)
- Gemessene Gewinnquoten zu zweit (je 400–1000 Partien): Anfänger 36 % und Experte ~59 % gegen
  Fortgeschritten
- Offen für Phase 4: Statistiken; Phase 6: KI-Berechnung in einen Web Worker verlagern

### Phase 4 – Statistiken & Persistenz ✅

- **Optional über die Einstellungen** („Daten & Fortschritt“): „Statistik aufzeichnen“ und
  „Laufende Partien speichern“ (beide standardmäßig an), „Statistik löschen“ mit Bestätigung
- Match-Historie in IndexedDB (`idb`): Ergebnis, Platzierung, Punkte, Gegnerzahl und -stärke,
  Regeloptionen, Dauer, Züge und spielspezifische Kennzahlen (`GameDefinition.statFields` /
  `summarize`, z. B. gespielte/gezogene Karten bei Mau-Mau)
- Laufende Partie wird nach jedem Zug in `localStorage` gesichert (Seed + Zugliste) und beim
  Öffnen per Replay fortgesetzt; nicht abspielbare Stände werden verworfen. „Partie fortsetzen“
  im Setup, „Läuft“-Badge im Katalog
- Statistik-Seite: Kennzahlen (Partien, Siegquote, längste/aktuelle Serie, Spielzeit), je Spiel
  Durchschnitte, Bestwerte, schnellster Sieg, Ergebnisse nach Gegnerstärke, Spieldetails, Verlauf
- Nicht aufgezeichnet werden abgebrochene Partien; Mehrrunden-Matches folgen mit dem ersten
  Spiel, das sie braucht

### Phase 5 – Weitere Spiele (nach Komplexität)

1. Patience-Familie: Klondike, FreeCell, Spider (Single-Player, keine KI nötig, Undo wichtig)
   - **M7 – Solitär (Klondike-Regeln) ✅:** 1 oder 3 Karten ziehen, Tippen = bester Zug, Kartenreihen
     ziehen, automatisches Ablegen am Ende, Sackgassen-Hinweis, Aufgeben (zählt als Niederlage), Regelwerk;
     Hochformat: Stapel/Ablagen über den Reihen, Querformat: seitlich, damit die Reihen Platz haben
   - **M8 – FreeCell ✅:** freie Zellen, Mehrfachzüge nach (freie Zellen + 1) × 2^(leere Reihen),
     sichere Karten automatisch auf die Ablagen (abschaltbar, mit Undo), Tipp, Sackgasse
   - **M9 – Spider ✅:** 1, 2 oder 4 Farben, Folgen nur in einer Farbe, fertige König-bis-Ass-Folgen
     werden abgelegt, Austeilen nur ohne leere Reihe, Tipp, Sackgasse
   - Gemeinsame Bausteine in `features/solitaire` (Reihen mit mitziehenden Folgen, Ablageflächen,
     Tipp-Markierung, Statuszeile, Layout für Hoch- und Querformat); ein Regressionstest stellt
     sicher, dass reines Tipp-Folgen in keiner Patience im Kreis läuft
2. Blackjack, Crazy Eights, Schwimmen (31), Durak, President ✅
   - **M15 – Durak ✅:** 2–6 Spieler, 36 Karten, offener Trumpf unter dem Stapel, niedrigster
     Trumpf beginnt, Angriff und Verteidigung Karte für Karte, Beilegen durch alle oder nur den
     Angreifer, höchstens 6 Angriffskarten (erster Angriff optional 5), Aufnehmen überspringt den
     Verteidiger, Auffüllen auf 6; Durak ist der Letzte mit Karten; KI in drei Stufen
   - **M14 – President ✅:** 3–7 Spieler, 52 Karten (3 niedrig, 2 hoch), eine bis vier gleiche
     Karten, Passen setzt bis Stichende aus, Titel Präsident/Vize/Bürger/Vize-Bettler/Bettler,
     Punkte nach Platz, Kartentausch ab Runde 2 (abschaltbar), 3/5/10 Runden; KI in drei Stufen
   - **M13 – Schwimmen (31) ✅:** 2–9 Spieler, 32 Karten, Tauschen (eine/alle), Schieben (neue
     Mitte, wenn alle schieben), Klopfen (jeder noch ein Zug), 31 = Feuer (verliert der
     Niedrigste oder alle anderen), 2–4 Leben plus Schwimmen, Ende sobald alle Menschen raus
     sind; KI in drei Stufen (Tausch-Bewertung, Klopf-Schwelle)
   - **M12 – Blackjack ✅:** Chips (Start 100), Einsatz 5/10/25, 5/10/20 Runden, Karte, Stehen,
     Verdoppeln, Teilen (geteilte Asse nur eine Karte), Blackjack 3:2, ein oder sechs Decks,
     Bank zieht optional auf weiche 17, Tipp nach Grundstrategie
   - **M11 – Crazy Eights ✅:** nutzt die Mau-Mau-Regeln mit eigenem Regelsatz (52 Karten, 8 wild,
     Ziehen bis es passt, 2/Dame/Ass als Varianten, eigene Punktwertung); Mau-Mau-Regeln dafür
     über interne Felder (Blatt, Sonderränge, Wertung) parametrisiert
3. Stichspiele: Hearts, Spades, 66, Euchre, Wizard ✅
   - **M19 – Wizard ✅:** 3–6 Spieler, 60 Karten (52 + 4 Zauberer + 4 Narren als Sonderkarten
     der Engine), Runde n mit n Karten, aufgedeckter Trumpf (Narr: kein Trumpf, Zauberer: Geber
     wählt), Ansagen 0–n (optional „dürfen nicht aufgehen“), Bedienpflicht mit Zauberer/Narr
     immer erlaubt, erster Zauberer gewinnt, 20 + 10 pro Stich bzw. −10 pro Abweichung; alle,
     halbe oder 5 Runden; Schätzung fürs Ansagen; KI in drei Stufen
   - **M18 – Euchre ✅:** vier Spieler in zwei Teams, 24 Karten, rechter und linker Bube, zwei
     Reizrunden (aufgedeckte Karte bestellen, dann andere Farbe), Geber nimmt auf und legt ab,
     „Geber muss wählen“ oder neu geben, Alleinspiel, 1/2/4 Punkte und Euchre (2 für die
     Gegner), Partie bis 5 oder 10; KI in drei Stufen
   - **M17 – Sechsundsechzig ✅:** zwei Spieler, 24 Karten, offener Trumpf, ohne Bedienpflicht
     bis der Stapel leer oder zugedreht ist (dann Farb- und Stichzwang), Melden 20/40 (zählt ab
     dem ersten Stich), Trumpf-Neun tauschen, Zudrehen (abschaltbar), 1–3 Gewinnpunkte
     (Schneider/Schwarz), letzter Stich +10, Partie bis 7 oder eine Hand; KI in drei Stufen
   - **M16 – Spades ✅:** vier Spieler in zwei Teams (gegenüber), Ansage 0–13 mit Nil (±100,
     abschaltbar), Pik immer Trumpf und erst nach dem Brechen ausspielbar, 10 Punkte pro
     angesagtem Stich, Überstiche als Bags (je 10 kosten 100, abschaltbar), Partie bis 250/500
     oder eine Hand; Schätzung fürs Ansagen; KI in drei Stufen (Experte vermeidet Bags, schützt
     Nil)
   - **M10 – Hearts ✅:** drei bis fünf Spieler (Standard vier; zu dritt/fünft kommen die
     übrigen Karten verdeckt in einen Topf für den Gewinner des letzten Stichs, Weitergeben
     ohne „gegenüber“), 52 oder 32 Karten (7 bis Ass, je 8), Weitergeben (links,
     rechts, gegenüber, keine), Hände werden reihum im Uhrzeigersinn eröffnet (Einstellung: stattdessen niedrigste ausgeteilte Kreuz), Herz jederzeit spielbar (kein Brechen),
     Pik-Dame-Pflicht (wer nicht bedienen kann, muss sie abwerfen), Pik-Dame 13 bzw. mit 32
     Karten 8 Punkte, Durchmarsch (alle Strafpunkte – 26 bzw. 16 – für die anderen oder abgezogen; beim
     Spiel bis 51 immer 16), Karo-Bube −10 (Variante), Partie bis 50/51/100 Punkte oder eine Hand;
     KI Anfänger,
     Fortgeschritten (Heuristik), Experte (Determinization mit Fehlfarben und bekannten
     weitergegebenen Karten); Zwischenwertung nach jeder Hand (KI pausiert solange);
     Auswahlmodus der Hand zum Weitergeben
4. Komplexe Spiele: Skat, Doppelkopf (mit Regelsätzen), Schafkopf, Bridge ✅
   - **M23 – Bridge ✅:** Chicago mit vier Spielern (Süd/Nord gegen Ost/West), Reizung 1–7 in
     ♣ ♦ ♥ ♠ SA mit Passe, Kontra, Rekontra, Alleinspieler und Dummy (offen nach dem Ausspiel,
     der Alleinspieler spielt beide Hände), Wertung im Turnierstil (Teil-/Vollspiel, Schlemm,
     Überstiche, Faller kontriert/rekontriert), Gefahrenlage nach Chicago, 4/8/12 Austeilungen;
     KI reizt nach Figuren- und Längenpunkten mit Fit-Suche und spielt mit Trumpfziehen, Ausspiel
     von Sequenzen und Zählen der höchsten Karten
   - **M22 – Schafkopf ✅:** vier Spieler, 32 Karten mit bayerischen Namen, Sauspiel mit gerufener
     Sau (Sau muss auf die gesuchte Farbe, darf nicht abgeworfen werden, davonlaufen ab vier),
     Wenz (abschaltbar) und Farbsolo, höheres Spiel sticht niedrigeres, Zusammenwerfen, Tarif
     10/50 mit Schneider, Schwarz und Laufenden; 4/8/12 Spiele; KI in drei Stufen
   - **M21 – Doppelkopf ✅:** vier Spieler, 48 Karten mit oder 40 ohne Neunen, Re (Kreuz-Damen)
     gegen Kontra, stille Hochzeit, Vorbehalt mit Damen-, Buben-, Farb- und fleischlosem Solo,
     Ansagen Re/Kontra und Absagen bis schwarz (mit Kartenfristen), Ziele nach Ansage, Wertung
     nach DDV-Muster (gegen die Alten, keine 90/60/30, schwarz, Ansagen) mit Sonderpunkten
     (Fuchs, Doppelkopf, Karlchen), Solist ×3; 4/8/12 Spiele; KI in drei Stufen
   - **M20 – Skat ✅:** drei Spieler, 32 Karten, Reizen in drei Stufen (Mittelhand reizt Vorhand,
     Hinterhand den Sieger, sonst darf Vorhand 18 spielen; alle passen → neu geben), Skat
     aufnehmen und drücken oder Hand, Farbspiele, Grand, Null (Hand/ouvert), Spitzen mit/ohne,
     Schneider/Schwarz (angesagt nur im Handspiel), Überreizen, Wertung als Spielwert oder
     Seeger-Fabian; 3/6/12 Spiele; Anzeige des Mindestwerts je Spiel beim Ansagen; KI in drei
     Stufen (Reizgrenze aus Blattstärke, Drücken über alle Kartenpaare, Stichspiel mit Schmieren)
5. Ablegespiele: Rommé, Gin Rummy, Canasta, Cribbage
   - **M24 – Rommé ✅:** 2–6 Spieler, 110 Karten (zwei Blätter, sechs Joker), Sätze und Folgen
     (Ass unten oder oben, Joker für jede Karte), erstes Auslegen ab 40 bzw. 30 Punkten in einem
     Zug, Anlegen, abgelegte Ablagekarte nicht sofort zurück, Hand-Rommé doppelt, Strafpunkte über
     1/3/5 Runden; Gruppen vormerken und gemeinsam auslegen; KI mit Meld-Suche (beste disjunkte
     Kombinationen), Anlegen und Abwurf nach Nutzen; Experte nutzt alle Joker beim Auslegen
     (auch zwei pro Kombination und als vierte Karte eines Satzes) und kommt so früher auf die
     40 Punkte, zählt Karten, füttert den nächsten Spieler nicht und spielt seine nächsten Züge
     im Kopf durch: Für die drei besten Abwürfe (und für Ablagestapel oder Stapel) zieht er
     24-mal zufällige ungesehene Karten, spielt zehn Züge wie der Fortgeschrittene weiter und
     gewichtet die Strafpunkte auf der Hand mit der Chance, dass ein Gegner vorher fertig wird
     (Markov-Modell aus gemessenen Partien: wer ausgelegt hat, geht mit 1 Karte zu 40 %, mit 2–3
     Karten zu 16 % pro Zug raus); Ausgehen zählt zusätzlich die halben geschätzten Strafpunkte
     der Gegner. Ein unbrauchbarer Joker (zwei Karten auf der Hand, nichts zum Anlegen) wird
     abgeworfen, sonst konnte die Runde nie enden. Gemessen (gegen zwei Fortgeschrittene, 5000
     Runden, Strafpunkte pro Runde): Anfänger 27,7, Fortgeschritten 17,3, Experte 14,9 (der alte
     Experte ohne Vorausschau 16,3); im Zweierspiel ≈ +0,8 Punkte pro Runde gegenüber dem
     Fortgeschrittenen; ≈ 6 ms pro Zug. Vollständige Rollouts mit zufälligen Gegnerhänden
     brachten keinen Gewinn – das Gegnermodell als Ausstiegs-Wahrscheinlichkeit dagegen schon
   - **M25 – Gin Rummy ✅:** zwei Spieler, 52 Karten, je zehn; erste Ablagekarte (Nicht-Geber,
     dann Geber, sonst Stapel), Ass immer niedrig, Klopfen mit höchstens 10 Totholz, Gegner legt
     an (nicht bei Gin), Gin +25, Big Gin +31 (abschaltbar), Unterschneiden +25, Hand zählt nicht
     bei zwei Karten im Stapel, Gewinner gibt; Partie bis 100/250 oder eine Hand, Spiel-, Linien-
     und Shutout-Bonus (abschaltbar), Oklahoma (Ablagekarte als Klopfgrenze, Pik doppelt);
     exakte Meld-Suche für Totholz und Anlegen (auch Ketten); Hand automatisch nach Kombinationen
     sortiert, Klopf-Knopf zeigt das Totholz, Handübersicht mit beiden Händen; KI in drei Stufen
     (Experte zählt Karten und wirft defensiv ab). Gemessen gegen Fortgeschritten (2000 Hände):
     Anfänger 40 % Siege (−4,8 Punkte pro Hand), Experte 51 % (+0,9); späteres Klopfen,
     Vorausschau auf den nächsten Zug und stärkere Defensive brachten keinen messbaren Gewinn
   - **M26 – Canasta ✅:** klassische Regeln für 2–4 Spieler (zu viert Partner gegenüber, 11
     Karten, eine ziehen, ein Canasta zum Ausmachen; zu dritt 13, zu zweit 15 Karten, zwei ziehen,
     zwei Canastas), 108 Karten, Joker und Zweien wild (höchstens drei pro Meldung, mindestens
     zwei natürliche Karten), rote Dreien als Bonus (100, alle vier 800, ohne Meldung minus),
     schwarze Dreien sperren den Stapel und werden nur beim Ausmachen gemeldet, eine Meldung pro
     Wert und Seite, Mindestwert der ersten Meldung nach Punktestand (15/50/90/120), Ablagestapel
     aufnehmen (eingefroren ohne eigene Meldung oder mit wilder Karte darin), reiner Canasta 500,
     gemischter 300, Ausmachen 100, verdeckt 200, Hand endet bei leerem Stapel; Partie bis
     5000/2500 oder eine Hand, Variante „Stapel immer eingefroren“; Gruppen vormerken, Hinweis
     zeigt, was einer Meldung noch fehlt (neue Session-Methode `whyNot`); KI in drei Stufen
     (Experte hält Paare für den Stapel zurück, wirft defensiv ab). Gemessen zu viert gegen ein
     fortgeschrittenes Paar: Anfänger gewinnen 4 % der Hände (−1264 Punkte), Fortgeschrittene 53 %
     (+36), Experten 55 % (+99)
6. Texas Hold'em Poker ✅
   - **M27 – Texas Hold'em ✅:** No Limit für 2–9 Spieler mit Spielchips (1000/2000/5000), Blinds
     10/20 mit wanderndem Dealer-Button (heads-up setzt der Dealer den Small Blind und spricht vor
     dem Flop zuerst), optional alle zehn Hände um die Hälfte steigend; Mindesterhöhung (unvoll-
     ständige All-in-Erhöhungen öffnen nicht neu), Neben- und geteilte Pots (übriger Chip an den
     ersten Gewinner links vom Button), Showdown mit direkter 7-Karten-Bewertung, Spielende wenn
     einer alle Chips hat, der Mensch ausscheidet oder nach 30/60 Händen; Tisch mit Board, Pot,
     eigener Hand, Schnellbeträgen (Min, ½ Pot, Pot, All-in) und Schieberegler, Übersicht nach
     jeder Hand; KI in drei Stufen über Monte-Carlo-Equity (Anfänger geht zu oft mit, Fortge-
     schritten vergleicht Equity und Pot-Odds, Experte rechnet nach Erhöhungen mit stärkeren
     Händen, setzt nach Pot-Größe, blufft selten, spielt kurz gestapelt Push-or-Fold). Gemessen
     zu sechst, 30 Hände, gegen fünf Fortgeschrittene: Anfänger −574 Chips pro Partie, Experte
     +257; heads-up Experte +369

### Zwischenschritt – Lücken geschlossen ✅

- **Sounds:** per Web Audio API synthetisiert (Karte, Ziehen, Mischen, Fehler, Sieg/Niederlage),
  keine Audiodateien; Einstellung an/aus und Lautstärke; generisch aus dem Zugverlauf abgeleitet
- **Mehrere Runden:** `engine/scoring` (Gesamtwertung, Rangfolge, Sieger); Spiele aktivieren es
  mit `supportsSeries` (Mau-Mau); Spiellänge 1/3/5/10 Runden im Setup; Zwischenstand und
  „Nächste Runde“ im Ergebnis-Dialog; Serienstand übersteht Neuladen
- **Leiste unten (Handy):** Einstellung „Leiste auf dem Handy: Oben/Unten“ für App- und
  Tisch-Leiste, gespeichert auf dem Gerät; greift auf Handys hoch und quer, Safe Areas wandern mit
- **Solitär-Tipp:** markiert den sinnvollsten nächsten Zug; teilt sich die Logik mit der
  Sackgassen-Erkennung

### Phase 6 – Fortgeschrittene KI (in Arbeit)

- Generisches Determinization / Information-Set-MCTS für Stichspiele
- Hand-Evaluation, Wahrscheinlichkeiten, Gegnermodellierung
- KI-Persönlichkeiten, adaptive Schwierigkeit, Erklärungen
- ✅ KI-Berechnung im Web Worker (`src/ai/worker`): alle Spiele-KIs laufen automatisch dort;
  der Worker setzt die Zufallsfolge der Session fort (Partien bleiben reproduzierbar), Agenten
  bleiben zwischen Zügen erhalten (für KIs mit Gedächtnis), Rückfall auf den Haupt-Thread bei
  fehlendem oder abgestürztem Worker

### Phase 7 – Komfort & Feinschliff

- Tutorials/Regelerklärungen, Übungsmodus, Replays
- Sound & Musik, Tischhintergründe, Avatare
- Achievements, Challenge-/Turniermodus, lokaler Multiplayer (Hot-Seat)

### Später (außerhalb des Initial-Scopes)

- Online-Multiplayer, private Räume, Leaderboards, Daily Challenges → erfordert Backend

## 6. Qualität

- Engine- und Spielregeln: Unit-Tests mit Vitest, inkl. Property-/Simulationstests (KI gegen KI, tausende Partien ohne Regelverstoß)
- UI-Flows: Playwright
- CI muss für jeden PR grün sein (Lint, Typecheck, Tests, Build)

## 7. Offene Fragen

- ~~Routing-Bibliothek~~ → React Router mit Hash-Routing (läuft auf GitHub Pages und offline ohne Rewrites)
- Kartengrafiken: eigene SVGs vs. freie Sets (Lizenz prüfen)
- i18n (Deutsch/Englisch) – Oberfläche vorerst auf Deutsch; Texte bei Bedarf später auslagern
