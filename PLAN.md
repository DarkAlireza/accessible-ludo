# Blind Screen-Reader Accessible Web Ludo — Implementation Plan

## 1. Overview & Accessibility Philosophy
This project implements a complete, standalone web-based **Ludo** game engineered specifically for **blind and screen-reader users** (NVDA, JAWS, VoiceOver, TalkBack) while also offering a high-contrast visual board for sighted/low-vision players.

## 2. Architecture & File Ownership

| File | Owner Agent | Responsibility | Global Export |
| :--- | :--- | :--- | :--- |
| `engine.js` | `engine` | Pure Ludo game state machine, board geometry, move validation, capture/safe rules, threat analysis, AI decision engine, and screen-reader description helpers. | `window.LudoEngine` (and `module.exports` for Node tests) |
| `tests.js` | `engine` | Automated Node.js test suite verifying all Ludo rules (yard exit on 6, safe squares, captures, triple-6 penalty, home stretch exact roll, win detection, AI moves). | CLI test runner (`node tests.js`) |
| `audio.js` | `audio` | Web Audio API procedural sound synthesizer (earcons for dice, steps, capture, safe square, home, win, error) + optional `speechSynthesis` self-voicing wrapper. | `window.LudoAudio` |
| `index.html` | `ui` | Semantic HTML5 structure, ARIA landmarks, dual live regions (`polite` & `assertive`), setup dialog, command toolbar, tactical move list, board explorer, and help modal. | DOM structure |
| `styles.css` | `ui` | WCAG AAA high-contrast styling, visible focus indicators, responsive 15×15 visual Ludo grid, and `.sr-only` utilities. | Stylesheet |
| `app.js` | `ui` | UI controller binding `LudoEngine` and `LudoAudio` to DOM, managing keyboard shortcuts, focus management, AI turn timers, and board explorer navigation. | `window.LudoApp` |

## 3. Shared Module Contracts

### 3.1 `window.LudoEngine` (`engine.js`)
- **Constants**:
  - `COLORS`: `['Red', 'Green', 'Yellow', 'Blue']`
  - `START_INDICES`: `[0, 13, 26, 39]` (0-based indices on the 52-square main track)
  - `SAFE_INDICES`: `[0, 8, 13, 21, 26, 34, 39, 47]` (4 start squares + 4 star squares)
- **Token Position Representation (`relativeStep`)**:
  - `-1`: In Yard (Base). Requires rolling a `6` to enter the track at `relativeStep = 0`.
  - `0..50`: On the 52-square main track. Absolute track index (0..51) is `(playerIndex * 13 + relativeStep) % 52`. Human-readable track square number is `absIndex + 1` (1..52).
  - `51..55`: In the player's colored Home Stretch (squares 1 to 5).
  - `56`: In Home Goal (finished). Requires an exact roll.
- **Core Methods**:
  - `createGame(playerConfigs)`: `playerConfigs` is an array of 4 objects `[{ name: 'Red', type: 'human'|'ai'|'none' }, ...]`. Defaults to Red=human, Green=ai, Yellow=ai, Blue=ai if omitted. Returns initial `state`.
  - `rollDice(state, forcedValue?)`: Rolls 1–6 (or uses `forcedValue` for tests), handles consecutive 6s (three 6s in a row forfeits turn and advances to next player), computes `validMoves`, and updates `state.phase` (`'MOVE'` if validMoves.length > 0, or advances turn and sets `'ROLL'` if no valid moves). Returns `{ state, roll, validMoves, tripleSix, autoPassed, message }`.
  - `getValidMoves(state, playerIndex, diceValue)`: Returns array of move objects:
    ```js
    {
      tokenIndex: 0..3, // 0-based index of token (displayed to user as Token 1..4)
      fromStep: number,
      toStep: number,
      fromDesc: string,
      toDesc: string,
      isExitYard: boolean,
      isCapture: boolean,
      capturedTokens: [{ playerIndex, tokenIndex, color }],
      isSafeDestination: boolean,
      isHomeEntry: boolean,
      isHomeStretch: boolean,
      threatsBefore: string[],
      threatsAfter: string[],
      summary: string // Full screen-reader friendly label for the move button
    }
    ```
  - `applyMove(state, tokenIndex)`: Executes the chosen valid move for `state.currentPlayer`, updates positions, sends any captured opponent tokens to `-1` (Yard), awards bonus roll on `6`, capture, or reaching Home (`56`), checks for player win / game over (`state.phase = 'GAME_OVER'`), or advances to the next active player (`state.phase = 'ROLL'`). Returns `{ state, moveResult, bonusTurn, gameOver, winner, message }`.
  - `chooseAIMove(state)`: Selects and returns the best `tokenIndex` from `state.validMoves` using tactical heuristics (capture > reach home > exit yard > land on safe square > escape threat > advance furthest token).
  - `getTokenStatusText(state, playerIndex, tokenIndex)`: Detailed human-readable description of a single token including position, steps to Home, and nearby threats.
  - `getPlayerSummaryText(state, playerIndex)`: Summary of all 4 tokens for a given player.
  - `getAllOpponentsSummaryText(state, currentPlayerIndex)`: Summary of all active opponent players' tokens and positions.
  - `getGameStatusText(state)`: Overall game summary (current turn, phase, last roll, rankings, tokens home per active player).
  - `getBoardExplorerItems(state)`: Ordered list of board locations (`Yard`s, `Track 1..52`, `Home Stretch`es, `Home Goal`s) with metadata `{ id, label, tokens, isOccupied, isSafe, coords }` for the keyboard Board Explorer.

### 3.2 `window.LudoAudio` (`audio.js`)
- `init()`: Initializes/resumes `AudioContext` on user interaction.
- `playDiceRoll(value)`: Plays tactile dice roll sound followed by pitch cue for `value` (1–6).
- `playMove(playerIndex, moveResult)`: Plays appropriate earcon based on `moveResult` (`isExitYard`, `isCapture`, `isHomeEntry`, `isSafeDestination`, or standard step).
- `playTurnStart(playerIndex, isHuman)`: Plays distinct turn notification chime.
- `playWin()`: Plays victory fanfare.
- `playError()`: Plays gentle boundary/invalid action tone.
- `setMuted(bool)` / `isMuted()`: Controls sound effect mute state.
- `setSelfVoicing(bool)` / `isSelfVoicing()` / `speak(text, interrupt)`: Optional `window.speechSynthesis` integration.
