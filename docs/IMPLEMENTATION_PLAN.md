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
2. Blackjack, Crazy Eights, Schwimmen (31), Durak, President
   - **M12 – Blackjack ✅:** Chips (Start 100), Einsatz 5/10/25, 5/10/20 Runden, Karte, Stehen,
     Verdoppeln, Teilen (geteilte Asse nur eine Karte), Blackjack 3:2, ein oder sechs Decks,
     Bank zieht optional auf weiche 17, Tipp nach Grundstrategie
   - **M11 – Crazy Eights ✅:** nutzt die Mau-Mau-Regeln mit eigenem Regelsatz (52 Karten, 8 wild,
     Ziehen bis es passt, 2/Dame/Ass als Varianten, eigene Punktwertung); Mau-Mau-Regeln dafür
     über interne Felder (Blatt, Sonderränge, Wertung) parametrisiert
3. Stichspiele: Hearts, Spades, 66, Euchre, Wizard
   - **M10 – Hearts ✅:** vier Spieler, Weitergeben (links, rechts, gegenüber, keine), Kreuz 2
     beginnt, keine Punkte im ersten Stich, Herz brechen, Shoot the Moon (26 für die anderen
     oder −26), Karo-Bube −10 (Variante), Partie bis 50/100 Punkte oder eine Hand; KI Anfänger,
     Fortgeschritten (Heuristik), Experte (Determinization mit Fehlfarben und bekannten
     weitergegebenen Karten); Zwischenwertung nach jeder Hand (KI pausiert solange);
     Auswahlmodus der Hand zum Weitergeben
4. Komplexe Spiele: Skat, Doppelkopf (mit Regelsätzen), Schafkopf, Bridge
5. Ablegespiele: Rommé, Gin Rummy, Canasta, Cribbage
6. Texas Hold'em Poker

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
