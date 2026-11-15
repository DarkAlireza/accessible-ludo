# Accessible Web Ludo

A modern, standalone web implementation of classic **Ludo** engineered specifically for **blind and screen-reader users** (NVDA, JAWS, VoiceOver, TalkBack) while simultaneously offering a high-contrast visual board for sighted and low-vision players.

Live Demo: [https://darkalireza.github.io/accessible-ludo/](https://darkalireza.github.io/accessible-ludo/)

---

## 🌟 Key Accessibility Features

- **Semantic HTML5 & ARIA Landmarks:** Full `<header role="banner">`, `<main role="main">`, `<aside>`, and `<footer role="contentinfo">` with skip navigation links and clean heading hierarchy.
- **Dual ARIA Live Regions:** Structured `#sr-polite` and `#sr-assertive` regions announce dice rolls, tactical moves, capture warnings, and turn changes cleanly without audio clipping.
- **Procedural Web Audio API Earcons:** Zero external audio files. Synthesized in real-time:
  - **Dice Rolls:** Tactile wooden rattle followed by 1–6 counting pitch intervals (with a triumphant chord on a roll of 6).
  - **Yard Exit:** Rising bright arpeggio.
  - **Capture:** Snappy percussive impact with dramatic pitch drop.
  - **Safe Square:** Warm harmonic shimmer chord.
  - **Home Goal:** Triumphant brass and bell fanfare upon finishing a token.
  - **Standard Steps:** Pitched tactile piece tap with distinct frequency signatures for each color (Red, Green, Yellow, Blue).
- **Optional Web Speech API Self-Voicing:** Built-in speech synthesis (Key `V`) narrates game events automatically for players without an external screen reader.
- **Accessible Board Explorer:** Roving-tabindex, arrow-key navigable list of all board squares and occupied locations. Use `Up`/`Down` to jump between occupied squares, and `Left`/`Right` to step sequentially along the 52-square track.
- **WCAG AAA High-Contrast Themes:** Dark and Light mode presets with >7:1 text contrast ratios, 3px `:focus-visible` keyboard rings, and distinct token geometric shapes and initials (Red Circle, Green Square, Yellow Diamond, Blue Rounded Octagon).

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| <kbd>Space</kbd> or <kbd>R</kbd> | **Roll Dice** | Rolls the dice during your turn. |
| <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd> | **Choose Move** | Selects and moves Token 1, 2, 3, or 4. |
| <kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>4</kbd> | **Inspect Token** | Reads position, steps to Home Goal, and nearby threats. |
| <kbd>S</kbd> | **Game Status** | Summarizes turn number, current player, and standings. |
| <kbd>T</kbd> | **My Tokens & Threats** | Tactical analysis of your tokens and active opponent threats. |
| <kbd>O</kbd> | **Opponent Status** | Summarizes opponent token locations. |
| <kbd>L</kbd> | **Read Recent Log** | Reads the last 3 activity log entries aloud. |
| <kbd>B</kbd> | **Focus Board Explorer** | Jumps keyboard focus directly into the Board Explorer. |
| <kbd>Up</kbd> / <kbd>Down</kbd> | **Explorer: Occupied** | Navigates between occupied squares in Board Explorer. |
| <kbd>Left</kbd> / <kbd>Right</kbd> | **Explorer: Step** | Steps sequentially along the 52-square board track. |
| <kbd>M</kbd> | **Toggle Audio Mute** | Mutes or unmutes procedural sound effects. |
| <kbd>V</kbd> | **Toggle Self-Voicing** | Toggles Web Speech API TTS narration. |
| <kbd>H</kbd> or <kbd>?</kbd> | **Help & Rules** | Opens the keyboard shortcuts and rules dialog modal. |
| <kbd>N</kbd> | **New Game Setup** | Opens game setup dialog to configure Human/AI players. |
| <kbd>Escape</kbd> | **Close Dialog** | Closes any open dialog modal and returns focus. |

---

## 📜 Rules of Ludo

1. **Starting Yard:** All 4 tokens begin in the Yard. Rolling a **6** is required to move a token out of the Yard onto your starting square on the main track.
2. **Bonus Rolls:** Players receive a bonus roll whenever they:
   - Roll a **6** (three consecutive 6s forfeits the turn).
   - **Capture** an opponent's token.
   - Move a token into the **Home Goal** (square 56).
3. **Captures:** Landing on a square occupied by an opponent sends their token back to their Yard and earns you a bonus turn.
4. **Safe Squares:** Star squares (★) and player starting squares are safe zones where multiple tokens of different colors peacefully coexist.
5. **Home Stretch & Goal:** After completing a full circuit of the 52-square track, tokens enter the 5-square colored Home Stretch. The central Home Goal requires an **exact roll** (overshooting is illegal).
6. **Winning:** The first player to bring all 4 tokens into the central Home Goal wins!

---

## 📁 Architecture & Code Structure

- `engine.js` (`window.LudoEngine`): Pure JavaScript Ludo game state machine, 15×15 grid coordinate mapping, move validation, capture rules, threat evaluation, AI heuristics, and screen-reader status text generators.
- `audio.js` (`window.LudoAudio`): Procedural Web Audio API synthesizer for tactile dice rattles, distinct pitch melodies, earcons, and optional Web Speech API TTS.
- `index.html`: Semantic HTML5 structure, ARIA landmarks, dual live regions (`#sr-polite`, `#sr-assertive`), accessible dialog modals, and 15×15 visual board.
- `styles.css`: WCAG AAA dark/light high-contrast styling, thick focus indicators, and responsive grid layouts.
- `app.js` (`window.LudoApp`): UI controller binding the engine and audio modules, handling keyboard shortcuts, managing focus, and pacing AI turns.
- `tests.js`: Automated Node.js test suite with 27 unit and integration tests verifying all rules and coordinates (`node tests.js`).

---

## 🚀 Running Locally & Tests

Run tests in Node.js:
```bash
node tests.js
```

To run the web app locally, open `index.html` in any modern web browser or serve it with any static server:
```bash
npx serve .
# or
python -m http.server 8000
```
