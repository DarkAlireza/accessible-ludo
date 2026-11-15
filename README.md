# Accessible Web Ludo

A modern, standalone web implementation of classic **Ludo** engineered specifically for **blind and screen-reader users** (NVDA, JAWS, VoiceOver, TalkBack) while simultaneously offering a high-contrast visual board for sighted and low-vision players.

Live Demo: [https://darkalireza.github.io/accessible-ludo/](https://darkalireza.github.io/accessible-ludo/)

---

## 🌟 Key Accessibility & Gameplay Features

- **Direct 15×15 Board Arrow-Key Navigation:**
  - Navigate the entire 15×15 Ludo board directly using <kbd>Up</kbd>, <kbd>Down</kbd>, <kbd>Left</kbd>, and <kbd>Right</kbd> arrow keys without needing mouse interaction.
  - Step sequentially along the 52-square main track with <kbd>[</kbd> and <kbd>]</kbd>.
  - Pressing <kbd>Enter</kbd> on a square inspects it in full detail—or, during your move phase, immediately executes that token's move directly from the cursor!
- **Tactile Earcons for Empty vs. Occupied Squares:**
  - **Empty Squares:** Procedural wooden/bamboo tap sound with spatial pitch mapping based on grid row/column, plus a gentle high shimmer when landing on safe stars or home stretch/goals.
  - **Occupied Squares:** Resonant melodic bell chord synthesized using the occupying piece's color signature frequency (Red, Green, Yellow, Blue), or a multi-note arpeggio when multiple pieces coexist on safe squares.
- **High-Contrast Visual Board Cursor Highlight:**
  - The currently focused square on the 15×15 visual grid is highlighted with a 4px high-contrast glowing outline (`.board-cursor-active`), elevated z-index, and a pulsating corner indicator for low-vision and sighted players.
- **Serverless Shareable-Link Online Multiplayer:**
  - Play with friends across devices over the internet with **zero server setup** using WebRTC DataChannels (PeerJS) with an instant `BroadcastChannel` multi-tab fallback.
  - Click **"Host & Create Shareable Link"** (or press <kbd>P</kbd>) to instantly create a room and copy the link (`?room=<id>`).
  - Friends opening the link automatically join the room, are assigned a player seat and color, and enjoy 100% synchronized dice rolls, moves, audio earcons, and screen-reader announcements.
- **Semantic HTML5 & ARIA Landmarks:** Full `<header role="banner">`, `<main role="main">`, `<aside>`, and `<footer role="contentinfo">` with skip navigation links and clean heading hierarchy.
- **Dual ARIA Live Regions:** Structured `#sr-polite` and `#sr-assertive` regions announce dice rolls, tactical moves, capture warnings, and turn changes cleanly without audio clipping.
- **Procedural Web Audio API Earcons:** Zero external audio files. Synthesized in real-time:
  - **Dice Rolls:** Tactile wooden rattle followed by 1–6 counting pitch intervals (with a triumphant chord on a roll of 6).
  - **Yard Exit:** Rising bright arpeggio.
  - **Capture:** Snappy percussive impact with dramatic pitch drop.
  - **Safe Square:** Warm harmonic shimmer chord.
  - **Home Goal:** Triumphant brass and bell fanfare upon finishing a token.
  - **Standard Steps:** Pitched tactile piece tap with distinct frequency signatures for each color (Red, Green, Yellow, Blue).
  - **Multiplayer Chimes:** Distinct chimes for player joins, departures, and link copying.
- **Optional Web Speech API Self-Voicing:** Built-in speech synthesis (Key <kbd>V</kbd>) narrates game events automatically for players without an external screen reader.
- **Accessible Board Explorer:** Roving-tabindex, arrow-key navigable list of all board squares and occupied locations. Use <kbd>Up</kbd>/<kbd>Down</kbd> to jump between occupied squares, and <kbd>Left</kbd>/<kbd>Right</kbd> to step sequentially along the 52-square track.
- **WCAG AAA High-Contrast Themes:** Dark and Light mode presets with >7:1 text contrast ratios, 3px `:focus-visible` keyboard rings, and distinct token geometric shapes and initials (Red Circle, Green Square, Yellow Diamond, Blue Rounded Octagon).

---

## 🌐 Shareable-Link Multiplayer Instructions

1. **Hosting a Match:**
   - Click the **"Multiplayer / Share Link"** button in the header (or press <kbd>P</kbd>).
   - Click **"Host & Create Shareable Link"**.
   - Your shareable room URL (`https://darkalireza.github.io/accessible-ludo/?room=ludo-xxxxxx`) is generated and automatically copied to your clipboard (or press <kbd>C</kbd> to copy it anytime).
   - As host, you control Seat 0 (Red). Any unassigned seats will automatically be played by the AI engine!
2. **Joining a Match via Shareable Link:**
   - Simply open the invite link in any modern web browser.
   - The game detects the `?room=` parameter and automatically connects to the host room.
   - You are assigned the next available color seat (Green, Yellow, or Blue) and announced by the screen reader.
   - When it is your turn, roll and move using standard keyboard shortcuts (<kbd>Space</kbd>, <kbd>1</kbd>–<kbd>4</kbd>, or cursor <kbd>Enter</kbd>). The action is validated by the host and broadcast to all connected players in real time!
3. **Manual Room Code Entry:**
   - You can also paste an invite URL or 6-character room code into the "Join Existing Room" input and click "Join Room".

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| <kbd>Space</kbd> or <kbd>R</kbd> | **Roll Dice** | Rolls the dice during your turn. |
| <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd> | **Choose Move** | Selects and moves Token 1, 2, 3, or 4. |
| <kbd>Up</kbd> / <kbd>Down</kbd> / <kbd>Left</kbd> / <kbd>Right</kbd> | **15×15 Board Cursor** | Navigates the active cursor across all squares on the 15×15 visual grid. |
| <kbd>[</kbd> / <kbd>]</kbd> | **Track Step** | Steps cursor backward/forward sequentially along the 52-square track. |
| <kbd>Enter</kbd> | **Cursor Action** | Inspects current cursor square or executes move if your token is on it. |
| <kbd>P</kbd> | **Multiplayer Lobby** | Opens the Multiplayer / Share Link lobby dialog. |
| <kbd>C</kbd> | **Copy Invite Link** | Copies active multiplayer room invite URL to clipboard. |
| <kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>4</kbd> | **Inspect Token** | Reads position, steps to Home Goal, and nearby threats. |
| <kbd>S</kbd> | **Game Status** | Summarizes turn number, current player, and standings. |
| <kbd>T</kbd> | **My Tokens & Threats** | Tactical analysis of your tokens and active opponent threats. |
| <kbd>O</kbd> | **Opponent Status** | Summarizes opponent token locations. |
| <kbd>L</kbd> | **Read Recent Log** | Reads the last 3 activity log entries aloud. |
| <kbd>B</kbd> | **Focus Board Explorer** | Jumps keyboard focus directly into the Board Explorer. |
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

- `engine.js` (`window.LudoEngine`): Pure JavaScript Ludo game state machine, 15×15 grid coordinate mapping, `getCellInfo(state, row, col)` cell introspection, move validation, capture rules, threat evaluation, AI heuristics, and screen-reader status text generators.
- `audio.js` (`window.LudoAudio`): Procedural Web Audio API synthesizer for tactile dice rattles, pitch-mapped board cursor movements (`playCursorMove`), distinct piece color harmonics, event earcons, and Web Speech API TTS.
- `multiplayer.js` (`window.LudoMultiplayer`): Serverless P2P WebRTC DataChannel connection manager (PeerJS) with HTML5 `BroadcastChannel` multi-tab fallback, URL `?room=` parameter handling, clipboard invite link sharing, lobby seat assignment, and real-time state synchronization.
- `index.html`: Semantic HTML5 structure, ARIA landmarks, dual live regions (`#sr-polite`, `#sr-assertive`), multiplayer lobby panel, accessible dialog modals, and 15×15 visual board.
- `styles.css`: WCAG AAA dark/light high-contrast styling, thick focus indicators, responsive grid layouts, and `.board-cursor-active` 4px glowing active square highlight.
- `app.js` (`window.LudoApp`): UI controller binding engine, audio, and multiplayer modules, managing 15×15 arrow-key board navigation, keyboard shortcuts, focus restoration, and AI pacing.
- `tests.js`: Automated Node.js test suite with 43 comprehensive unit and integration tests verifying all game mechanics, grid cell introspection, audio synthesis, and multiplayer networking (`node tests.js`).

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
