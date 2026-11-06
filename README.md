
# Cards

**Classic card games. Smarter opponents. Endless fun.**

Cards is a modern, browser-based card game platform where players can enjoy a variety of classic and popular card games against intelligent computer opponents.

The goal is to bring multiple card games together in one application, featuring configurable game rules, different AI difficulty levels and a clean, intuitive gaming experience.

From traditional trick-taking games to strategic card games, Cards aims to provide a versatile platform for casual games and challenging AI opponents.

▶️ **Play it:** [lucasn177.github.io/Cards](https://lucasn177.github.io/Cards/) – installable as an app (PWA) on phone and desktop, works offline.

> 🚧 **Work in Progress** – The engine, the app shell, the card table, statistics and the first games (**Mau-Mau**, **Crazy Eights**, **Hearts**, **Blackjack**, **Schwimmen**, **President**, **Durak**, **Spades**, **Sechsundsechzig**, **Euchre**, **Wizard**, **Skat**, **Doppelkopf**, **Schafkopf**, **Bridge**, **Rommé**, **Gin Rummy**, **Canasta**, **Texas Hold'em**, **Solitaire**, **FreeCell** and **Spider**) are done. More games follow step by step. Checked items below are implemented; everything else is the roadmap. The detailed plan lives in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

---

## 🃏 Games

### ♠️ Classic Card Games

Traditional card games that are easy to learn but offer plenty of strategic depth.

- [x] Poker (Texas Hold'em) – no-limit for 2–9 players with play chips, blinds (rising by half every ten hands, optional), minimum raise, side pots and split pots, showdown with hand names, play until one player has all chips or for 30/60 hands, quick bet sizes (min, ½ pot, pot, all-in) and a slider, three AI levels
- [x] Blackjack – chips over 5/10/20 rounds, double, split, 3:2 blackjacks, one or six decks, optional dealer hit on soft 17, basic-strategy hint
- [x] Solitaire – draw one or three, tap to auto-move, drag whole runs, hint button, auto-finish, dead-end hint, give up
- [x] Spider Solitaire – one, two or four suits, finished runs are put away automatically
- [x] FreeCell – run moves limited by free cells and empty piles, safe cards go to the foundations by themselves (optional)
- [x] Mau-Mau – single games or matches over 3/5/10 rounds, with variants (7 draws two, 7 on 7, 8 skips, 9 reverses, jack wishes, jack on jack, 5–7 cards) and a full rules text in the app
- [x] Crazy Eights – 52 cards, wild eights, draw until a card fits, optional twos/queens/aces (shares its rules engine with Mau-Mau)
- [x] Hearts – 3–5 players (with three or five the left-over cards go face down into a pot for the winner of the last trick), 52 cards or 32 cards (7–Ace; queen of spades worth 8), passing (left, right, across, none), hands opened in turn clockwise (or by the lowest club), hearts may be led any time, the queen of spades must be discarded as soon as you cannot follow suit, Durchmarsch (all penalty cards; worth 16 when playing to 51), optional jack of diamonds, play to 50/51/100 points or a single hand; the queen of spades carries a black pig that runs grunting across the table when she is played
- [x] Spades – two partnerships, bids 0–13 with optional nil, spades always trump and only led once broken, bags with optional 10-bag penalty, play to 250/500 or one hand, bid estimate, three AI levels
- [x] Bridge – Chicago for four, auction with double and redouble, declarer plays the open dummy, duplicate-style scoring with vulnerability, bidding box, three AI levels

### 🎴 German Card Games

Popular card games with regional rules and variations.

- [x] Skat – three players, bidding in three stages, Skat pickup and discard or Hand, suit games, Grand and Null (Hand/ouvert), matadors, Schneider/Schwarz (announced in Hand games), overbidding, standard or Seeger-Fabian scoring, minimum value shown per game when declaring, three AI levels
- [x] Doppelkopf – 48 cards with or 40 without nines, Re vs. Kontra, silent wedding, solos (queens, jacks, suit, fleischlos), Re/Kontra and absagen down to schwarz, DDV-style scoring with Fuchs, Doppelkopf and Karlchen, three AI levels
- [x] Schafkopf – Sauspiel with a called ace (incl. running away), Wenz and suit solos, throwing in when all pass, tariff 10/50 with Schneider, Schwarz and Laufende, three AI levels
- [ ] Doppelkopf with different rule sets
- [x] Schwimmen (31) – 2–9 players, swap one or all cards, pass (new middle when everybody passes), knock, 31 ends the round ("Feuer"), 2–4 lives plus swimming, three AI levels
- [x] Durak – 2–6 players, 36 cards, trump from the stock, attack and defend card by card, throw-ins by everybody or only the attacker, at most six attack cards, refill to six, three AI levels
- [x] Rommé – 2–6 players, 110 cards with jokers, sets and runs, first lay-out of 40 (or 30) points, laying off, Hand-Rommé doubles, penalty points over 1/3/5 rounds, staging groups before laying out, three AI levels
- [x] Canasta – classic rules for 2–4 players (four: partnerships), 108 cards, jokers and twos wild, red threes as bonus cards, black threes block the pile, first-meld minimum by score (15/50/90/120), taking the (frozen) pile, natural and mixed canastas, going out (concealed), play to 5000/2500 or a single hand, optional "pile always frozen", hints explaining what a meld still needs, three AI levels

### 🏆 Competitive & Strategic Games

Games that focus on tactics, planning and decision-making.

- [x] Gin Rummy – two players, knock with up to 10 deadwood, laying off, gin (+25), big gin (+31), undercut (+25), void hand at two stock cards, play to 100/250 or a single hand with game, box and shutout bonuses, optional Oklahoma (upcard sets the knock limit, spades double), hand arranged into melds automatically, three AI levels
- [ ] Cribbage
- [x] Euchre – two partnerships, 24 cards, right and left bower, two bidding rounds, dealer picks up, stick the dealer, going alone, march and euchre scoring, play to 5 or 10, three AI levels
- [x] President / Asshole – 3–7 players, singles to quads, passing sits out the trick, titles from President to Bettler, card exchange from round 2, 3/5/10 rounds, three AI levels
- [x] Wizard – 3–6 players, 60 cards with wizards and jesters, round n deals n cards, trump from the turned card (dealer chooses on a wizard), exact bids with optional "bids must not add up", full/half/five rounds, bid estimate, three AI levels
- [x] 66 (Sechsundsechzig) – two players, 24 cards, marriages 20/40, trump-nine exchange, closing the stock, strict rules once the stock is gone, 1–3 game points per hand, match to 7, three AI levels

---

## 🤖 AI Opponents

Play against computer-controlled opponents with different strategies and difficulty levels.

- [x] Multiple AI difficulty levels
- [x] Beginner, intermediate and expert opponents
- [ ] Different AI personalities and play styles
- [x] Game-specific AI strategies
- [x] Strategic decision-making – the expert simulates many possible deals and plays each move out (determinized Monte-Carlo rollouts)
- [x] Card probability and hand evaluation – hidden cards are sampled consistently with everything that has been seen
- [x] Opponent behavior analysis – the expert remembers which suits an opponent could not serve, using only public moves (no cheating)
- [ ] Adaptive AI difficulty
- [x] Configurable AI opponents – number of opponents and difficulty per game
- [ ] Optional AI explanations for decisions

Every game brings its own AI through a common `AiAgent` interface. Computer opponents think in a **web worker**, so even the expert's simulations never make animations or taps stutter; the game stays fully deterministic (the worker continues the session's random sequence) and falls back to the main thread where workers are unavailable. Measured in Mau-Mau (two players, hundreds of games): beginner wins 36 % and expert ~59 % against the intermediate level. In Hearts (against three intermediate players, fair share 6.5 points per hand): beginner 13.8, intermediate 7.4, expert 5.9 points per hand. In Rommé (against two intermediate players, 5000 rounds, penalty points per round): beginner 27.7, intermediate 17.3, expert 14.9 – the expert uses every joker when building melds, counts cards, avoids feeding the next player and plays its next turns ahead with sampled draws, weighing the penalty in hand by a measured model of how fast opponents go out (about 6 ms per move). In Gin Rummy (head to head against the intermediate level, 2000 hands): beginner wins 40 % (−4.8 points per hand), expert 51 % (+0.9) – here too the expert is only slightly ahead. In Canasta (partnerships against an intermediate pair, per hand): beginners win 4 % of the hands (−1264 points), intermediate 53 % (+36), experts 55 % (+99). In Texas Hold'em (six players, 30 hands, 1000 chips, against five intermediates): beginner −574 chips per game, expert +257 – Monte-Carlo equity against narrowed ranges after raises, value bets by the pot, push-or-fold when short.

---

## 🎮 Gameplay Features

### Game Experience

- [x] Interactive card tables
- [x] Smooth card animations
- [x] Drag-and-drop card interactions
- [x] Responsive layouts for desktop, tablet and mobile – portrait and landscape; in Mau-Mau the first tap lifts a card and the second plays it, in solitaire a tap makes the best move
- [x] Configurable game speed
- [x] Abandon a running game (✕ in the table bar, with confirmation) – it is neither saved nor counted in the statistics; the arrow keeps it for later
- [ ] Undo and replay where game rules allow it – undo ✓, replays planned
- [ ] Game tutorials and rule explanations – rule explanations ✓ (own page and in-game), tutorials planned
- [ ] Practice mode
- [x] Customizable card designs
- [x] Multiple card deck styles – French and German suits
- [ ] Sound effects and optional background music – sound effects ✓ (synthesized, no audio files), music planned

### Game Configuration

- [x] Select the number of AI opponents
- [x] Choose AI difficulty
- [x] Configure game rules and variations
- [x] Select card deck styles
- [ ] Configure scoring systems – totals over several rounds ✓, alternative scoring planned
- [x] Set match length and game modes – rounds per match for games that support it
- [x] Save preferred game settings

---

## 📊 Statistics & Progress

Track performance and improve over time. Recording can be switched off in the settings.

- [x] Match history
- [x] Win/loss statistics
- [x] Game-specific statistics – e.g. cards played/drawn and jacks in Mau-Mau
- [x] Average scores and performance metrics
- [x] AI opponent statistics – results per difficulty level
- [ ] Achievement system
- [x] Personal records – longest winning streak, best score, fastest win
- [x] Progress tracking – current streak, total playing time
- [x] Statistics dashboards

---

## 🧩 Additional Features

### Game Modes

- [x] Single-player mode
- [ ] Local multiplayer
- [ ] Team-based games
- [ ] Tournament mode
- [x] Quick matches
- [x] Custom matches – rule variants, opponents and difficulty per game
- [ ] Challenge mode

### Customization

- [x] Light and dark themes
- [x] App bar at the top or bottom on phones (portrait and landscape), stored on the device
- [x] Multiple card designs
- [ ] Custom table backgrounds
- [x] Configurable animations – also follows the system's "reduce motion" setting
- [x] Adjustable sound settings – on/off and volume
- [ ] Custom player names and avatars – names ✓, avatars planned

### Future Possibilities

- [ ] Online multiplayer
- [ ] Friends and private game rooms
- [ ] Leaderboards
- [ ] Daily challenges
- [ ] AI-generated challenges
- [x] New games through a modular game system

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React 19 | User interface |
| TypeScript 7 | Type-safe development |
| Vite 8 | Development and build tooling |
| Tailwind CSS 4 | Styling |
| shadcn/ui (Radix) | UI components |
| React Router (hash routing) | Navigation that works on GitHub Pages and offline |
| Zustand | State management (settings, running match, statistics) |
| Framer Motion | Card animations |
| Web Audio API | Synthesized sound effects (no audio files) |
| vite-plugin-pwa (Workbox) | Installable app, offline cache, update prompt |
| IndexedDB (`idb`) | Local match history |
| Vitest + Testing Library | Unit and component tests |
| Playwright | End-to-end tests on desktop and phone (portrait/landscape) |
| oxlint + Prettier | Linting and formatting |

---

## 🏗️ Architecture

Cards is built around a modular game architecture. The engine is plain TypeScript without React, so rules and AI are fully testable and could later run in a web worker or on a server.

```text
src
├── engine/        UI-free core
│   ├── cards/     Card model, deck presets (52, 36, 32, 24, Doppelkopf, Rommé, Canasta), dealing
│   ├── core/      GameDefinition contract, GameSession (turns, validation, AI moves, undo,
│   │              save/restore by replay), seedable RNG, registry, simulation
│   ├── players/   Seating order
│   └── scoring/   Series of rounds: totals, standings, winners
├── ai/            Shared AI building blocks (random agent) and the AI web worker
├── games/         One folder per game: rules, AI, table UI, rules text, tests
│   ├── mau-mau/   (also the rules engine of crazy-eights/)
│   ├── crazy-eights/
│   ├── doppelkopf/
│   ├── hearts/
│   ├── spades/
│   ├── blackjack/
│   ├── bridge/
│   ├── schafkopf/
│   ├── schwimmen/
│   ├── sechsundsechzig/
│   ├── skat/
│   ├── president/
│   ├── romme/
│   ├── gin-rummy/
│   ├── canasta/
│   ├── texas-holdem/
│   ├── durak/
│   ├── euchre/
│   ├── klondike/  (shown as "Solitär")
│   ├── freecell/
│   ├── spider/
│   └── wizard/
├── features/      App features: card rendering, table, solitaire board pieces, setup, rules,
│                  statistics, settings, sound
├── stores/        Zustand stores: settings, running match, statistics
├── components/    Shared UI components (shadcn/ui)
└── app/           App shell, routing, layout, theme, PWA prompt
```

Key ideas:

- **Games are plugins.** A game implements `GameDefinition` (setup, legal actions, apply action, player view, result, optional rule options, AI and statistics) and is registered in `src/games/index.ts`. The engine never changes for a new game.
- **Immutable state + actions.** Every move is an action; a game is fully defined by its seed and its action list. That powers undo, saved games and reproducible tests.
- **Fair information.** Players and AI only ever see a `PlayerView` with hidden cards removed.
- **Rule variants are data.** Games describe their options (`optionFields`); the setup screen renders them automatically.

### Adding a game

1. Create `src/games/<id>/` with the rules as a `GameDefinition` (see `mau-mau/mauMau.ts`).
2. Add an AI via `createAgent(difficulty)` and a table component (see `MauMauTable.tsx`).
3. Write the rules text (see `MauMauRules.tsx`) and register everything in `src/games/index.ts`, `tables.ts` and `rules.ts`.
4. Add rule tests and a simulation test (thousands of AI games must never break a rule).

---

## 🔒 Privacy & Storage

Everything runs in the browser.

- [x] No mandatory user registration
- [x] Local game settings
- [x] Local statistics storage – IndexedDB, can be deleted in the settings
- [x] Persistent game progress – a running game survives reloads and closing the app (optional)
- [x] Offline support
- [x] No backend required for single-player games

---

## 💻 Development

Requires Node.js 24 or newer.

```bash
npm install
npm run dev          # start the dev server (includes a test game and a card gallery at #/dev/cards)
npm test             # unit tests
npm run test:e2e     # end-to-end tests (first run: npx playwright install chromium)
npm run lint         # oxlint
npm run typecheck    # TypeScript
npm run format       # Prettier
npm run build        # production build into dist/
npm run generate:icons  # regenerate PWA icons from public/favicon.svg
```

The app version lives in `package.json` (`version`) and is shown in the footer of every menu page ("Cards v… · by Lucas Nagelsmann"); bump it with each release.

---

## 🚀 Deployment

Cards is hosted as a static web application on **GitHub Pages**.

GitHub Actions run lint, formatting, type checks, unit tests, the build and the end-to-end tests on every push and pull request (`.github/workflows/ci.yml`), and deploy `main` to GitHub Pages (`.github/workflows/deploy.yml`).

The focus is single-player gameplay against computer opponents, without any server infrastructure.

---

## 🎯 Project Goals

Cards is a personal development project focused on building an extensible game platform and exploring AI-driven decision-making.

The main objectives are:

- Build a collection of classic card games in one application.
- Develop a reusable and modular game engine.
- Implement intelligent computer opponents.
- Explore game theory, probability and strategic decision-making.
- Create a polished and responsive gaming experience.
- Learn and apply modern React and TypeScript development practices.

---

## 📌 Project Status

| Phase | Status |
|---|---|
| 0 – Project setup, CI/CD, PWA | ✅ |
| 1 – Engine (cards, RNG, game contract, session, simulation) | ✅ |
| 2 – UI (app shell, settings, theme, card table, animations) | ✅ |
| 3 – First game: Mau-Mau with AI and rules | ✅ |
| 4 – Statistics, match history and saved games | ✅ |
| 5 – More games | in progress – Solitaire, FreeCell, Spider, Hearts, Crazy Eights, Blackjack, Schwimmen, President, Durak, Spades, Sechsundsechzig, Euchre, Wizard, Skat, Doppelkopf, Schafkopf, Bridge, Rommé, Gin Rummy, Canasta, Texas Hold'em ✓; next: Cribbage |
| 6 – Advanced AI | in progress – web worker ✓, next: personalities, adaptive difficulty, explanations |
| 7 – Polish (tutorials, sound, achievements, local multiplayer) | planned |

**Built for the love of cards and strategy.**
