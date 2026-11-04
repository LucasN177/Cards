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

## 4. Kern-Schnittstellen (Entwurf)

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

### Phase 0 – Projekt-Setup ✅ (dieser Schritt)

- Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui-Konfiguration, Pfad-Alias `@/`
- Zustand, Framer Motion installiert
- Vitest (+ Testing Library, jsdom) und Playwright eingerichtet
- Linting (oxlint) und Formatierung (Prettier)
- GitHub-Actions-Workflows: CI (Lint, Typecheck, Tests, Build) und Deploy auf GitHub Pages
- Leere Ordnerstruktur gemäß Abschnitt 3

### Phase 1 – Engine-Fundament

- Kartenmodell, Deck-Factories, seedbarer RNG, Mischen
- `GameDefinition`, Game Registry, Game Runner (Turn-Loop, Mensch/KI-Zug, Aktionshistorie)
- `PlayerView`-Maskierung, Undo/Redo auf Aktionshistorie
- Hohe Testabdeckung (Vitest)

### Phase 2 – UI-Fundament

- App-Shell, Routing (Spielauswahl → Konfiguration → Tisch)
- Kartenkomponente (SVG, mehrere Deck-Stile), Hand, Stapel, Tisch-Layout
- Animationen mit Framer Motion, Drag & Drop, Spielgeschwindigkeit
- Light/Dark-Theme, Settings-Store mit Persistenz

### Phase 3 – Erstes Spiel end-to-end: **Mau-Mau**

- Bewusst einfach: validiert Engine, UI, KI-Interface und Statistik in einem Durchstich
- KI: Random (Anfänger) + Heuristik (Fortgeschritten)
- Regelvarianten (7 ziehen, 8 aussetzen, Bube wünschen …)
- Playwright-E2E: komplette Partie gegen KI

### Phase 4 – Statistiken & Persistenz

- Match-Historie, Siege/Niederlagen, spielspezifische Kennzahlen (IndexedDB)
- Laufende Partie speichern/fortsetzen
- Statistik-Dashboard

### Phase 5 – Weitere Spiele (nach Komplexität)

1. Patience-Familie: Klondike, FreeCell, Spider (Single-Player, keine KI nötig, Undo wichtig)
2. Blackjack, Crazy Eights, Schwimmen (31), Durak, President
3. Stichspiele: Hearts, Spades, 66, Euchre, Wizard
4. Komplexe Spiele: Skat, Doppelkopf (mit Regelsätzen), Schafkopf, Bridge
5. Ablegespiele: Rommé, Gin Rummy, Canasta, Cribbage
6. Texas Hold'em Poker

### Phase 6 – Fortgeschrittene KI

- Generisches Determinization / Information-Set-MCTS für Stichspiele
- Hand-Evaluation, Wahrscheinlichkeiten, Gegnermodellierung
- KI-Persönlichkeiten, adaptive Schwierigkeit, Erklärungen
- KI-Berechnung in Web Worker auslagern (UI bleibt flüssig)

### Phase 7 – Komfort & Feinschliff

- Tutorials/Regelerklärungen, Übungsmodus, Replays
- Sound & Musik, Tischhintergründe, Avatare
- Achievements, Challenge-/Turniermodus, lokaler Multiplayer (Hot-Seat)
- PWA / Offline-Support

### Später (außerhalb des Initial-Scopes)

- Online-Multiplayer, private Räume, Leaderboards, Daily Challenges → erfordert Backend

## 6. Qualität

- Engine- und Spielregeln: Unit-Tests mit Vitest, inkl. Property-/Simulationstests (KI gegen KI, tausende Partien ohne Regelverstoß)
- UI-Flows: Playwright
- CI muss für jeden PR grün sein (Lint, Typecheck, Tests, Build)

## 7. Offene Fragen

- Routing-Bibliothek (Vorschlag: React Router oder TanStack Router)
- Kartengrafiken: eigene SVGs vs. freie Sets (Lizenz prüfen)
- i18n (Deutsch/Englisch) – für deutsche Spiele sinnvoll, früh entscheiden
