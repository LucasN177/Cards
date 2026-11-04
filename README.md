
# Cards

**Classic card games. Smarter opponents. Endless fun.**

Cards is a modern, browser-based card game platform where players can enjoy a variety of classic and popular card games against intelligent computer opponents.

The goal is to bring multiple card games together in one application, featuring configurable game rules, different AI difficulty levels and a clean, intuitive gaming experience.

From traditional trick-taking games to strategic card games, Cards aims to provide a versatile platform for casual games and challenging AI opponents.

> 🚧 **Work in Progress** – Cards is currently in the planning and development stage. Features and games listed below represent the project roadmap.

---

## 🃏 Planned Games

### ♠️ Classic Card Games

Traditional card games that are easy to learn but offer plenty of strategic depth.

- [ ] Poker (Texas Hold'em)
- [ ] Blackjack
- [ ] Solitaire / Klondike
- [ ] Spider Solitaire
- [ ] FreeCell
- [x] Mau-Mau
- [ ] Crazy Eights
- [ ] Hearts
- [ ] Spades
- [ ] Bridge

### 🎴 German Card Games

Popular card games with regional rules and variations.

- [ ] Skat
- [ ] Doppelkopf
- [ ] Schafkopf
- [ ] Doppelkopf with different rule sets
- [ ] Schwimmen (31)
- [ ] Durak
- [ ] Rommé
- [ ] Canasta

### 🏆 Competitive & Strategic Games

Games that focus on tactics, planning and decision-making.

- [ ] Gin Rummy
- [ ] Cribbage
- [ ] Euchre
- [ ] President / Asshole
- [ ] Wizard
- [ ] 66 (Sechsundsechzig)

---

## 🤖 AI Opponents

Play against computer-controlled opponents with different strategies and difficulty levels.

- [ ] Multiple AI difficulty levels
- [ ] Beginner, intermediate and expert opponents
- [ ] Different AI personalities and play styles
- [ ] Game-specific AI strategies
- [ ] Strategic decision-making
- [ ] Card probability and hand evaluation
- [ ] Opponent behavior analysis
- [ ] Adaptive AI difficulty
- [ ] Configurable AI opponents
- [ ] Optional AI explanations for decisions

The AI architecture should be modular, allowing each game to implement its own decision-making logic.

---

## 🎮 Gameplay Features

### Game Experience

- [ ] Interactive card tables
- [ ] Smooth card animations
- [ ] Drag-and-drop card interactions
- [ ] Responsive layouts for desktop, tablet and mobile
- [ ] Configurable game speed
- [ ] Undo and replay where game rules allow it
- [ ] Game tutorials and rule explanations
- [ ] Practice mode
- [ ] Customizable card designs
- [ ] Multiple card deck styles
- [ ] Sound effects and optional background music

### Game Configuration

- [ ] Select the number of AI opponents
- [ ] Choose AI difficulty
- [ ] Configure game rules and variations
- [ ] Select card deck styles
- [ ] Configure scoring systems
- [ ] Set match length and game modes
- [ ] Save preferred game settings

---

## 📊 Statistics & Progress

Track performance and improve over time.

- [ ] Match history
- [ ] Win/loss statistics
- [ ] Game-specific statistics
- [ ] Average scores and performance metrics
- [ ] AI opponent statistics
- [ ] Achievement system
- [ ] Personal records
- [ ] Progress tracking
- [ ] Statistics dashboards

---

## 🧩 Additional Features

### Game Modes

- [ ] Single-player mode
- [ ] Local multiplayer
- [ ] Team-based games
- [ ] Tournament mode
- [ ] Quick matches
- [ ] Custom matches
- [ ] Challenge mode

### Customization

- [ ] Light and dark themes
- [ ] Multiple card designs
- [ ] Custom table backgrounds
- [ ] Configurable animations
- [ ] Adjustable sound settings
- [ ] Custom player names and avatars

### Future Possibilities

- [ ] Online multiplayer
- [ ] Friends and private game rooms
- [ ] Leaderboards
- [ ] Daily challenges
- [ ] AI-generated challenges
- [ ] New games through a modular game system

---

## 🛠️ Technology Stack

The application is planned around a modern TypeScript-based frontend architecture.

| Technology | Purpose |
|---|---|
| React | User interface |
| TypeScript | Type-safe development |
| Vite | Development and build tooling |
| Tailwind CSS | Styling |
| shadcn/ui | UI components |
| Zustand | State management |
| Framer Motion | Card animations |
| Vitest | Unit testing |
| Playwright | End-to-end testing |

Additional technologies may be introduced as the project evolves.

---

## 🏗️ Architecture

Cards is designed around a modular game architecture.

Each game should be implemented independently while sharing common components such as card rendering, player management, game state handling and AI infrastructure.

```text
Cards
│
├── Frontend
│   ├── React
│   ├── UI Components
│   ├── Game Table
│   └── Card Animations
│
├── Game Engine
│   ├── Game State
│   ├── Turn Management
│   ├── Rules & Validation
│   ├── Scoring
│   └── Game Flow
│
├── Games
│   ├── Poker
│   ├── Blackjack
│   ├── Skat
│   ├── Hearts
│   └── More Games
│
├── AI Engine
│   ├── Decision Making
│   ├── Difficulty Levels
│   ├── Strategy Evaluation
│   └── Game-specific AI
│
└── Shared Components
    ├── Card Deck
    ├── Playing Cards
    ├── Player System
    ├── Statistics
    └── Settings
```

The architecture should make it easy to add new card games without modifying the core game engine.

---

## 🔒 Privacy & Storage

The initial version is planned to work entirely in the browser.

- [ ] No mandatory user registration
- [ ] Local game settings
- [ ] Local statistics storage
- [ ] Persistent game progress
- [ ] Offline support
- [ ] No backend required for single-player games

---

## 🚀 Deployment

Cards is intended to be hosted as a static web application using **GitHub Pages**.

GitHub Actions will handle automated builds and deployments.

The initial release will focus on single-player gameplay against computer opponents, without requiring server infrastructure.

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

Cards is currently under active development.

More games, features and documentation will be added as the project evolves.

**Built for the love of cards and strategy.**
