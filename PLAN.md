# Blind Screen-Reader Accessible Web Ludo — Phase 3 Implementation Plan

## 1. Objectives & User Requirements
1. **Remove All Non-Existent / Invented Squares**:
   - Eliminate all fake squares (`Red Yard Border`, `Red Yard Area`, `Center Area`, etc.) from both the 15×15 interactive board and the Board Browse (Explorer) window.
   - Only the **92 real playable Ludo squares** exist:
     - **52 Main Track squares** (`Track 1`..`Track 52`)
     - **20 Home Stretch squares** (`Red`, `Green`, `Yellow`, `Blue` Home Stretch `1`..`5`)
     - **4 Home Goal squares** (`Red Home Goal`, `Green Home Goal`, `Yellow Home Goal`, `Blue Home Goal`)
     - **16 Yard Token Slots** (`Red Yard 1`..`4`, `Green Yard 1`..`4`, `Yellow Yard 1`..`4`, `Blue Yard 1`..`4`)
   - Arrow-key navigation (`Up`, `Down`, `Left`, `Right`) moves **exclusively** between real Ludo squares via `LudoEngine.findNextValidSquare(row, col, dRow, dCol)`.
2. **Authentic Classic Ludo Board Visual Appearance**:
   - Render the 4 corner Yards as true **6×6 Ludo base boxes** (`.ludo-yard-box`), each containing a crisp white inner box with 4 large colored circular token nests—no grid lines or fake cells inside the yards.
   - Render the 3×3 center as an authentic **4-triangle Ludo Home** (diagonal Red, Green, Yellow, and Blue triangles meeting at the center) with the 4 Home Goal squares positioned on their respective colored triangles.
   - Display `A`–`O` column headers and `1`–`15` row labels around the board frame, directional entry arrows on home-stretch turns, bold stars (`★`) on safe squares, and 3D-styled tokens.
3. **Alphanumeric Grid Coordinates (`A7`, `B7`, etc.) Read by Screen Readers**:
   - Every square has a standard coordinate name (`coord`: column letter `A`–`O` + row number `1`–`15`, e.g. `A7`, `B7`, `C7`).
   - Moving onto any square with the arrow keys immediately announces its coordinate name first (e.g., `"B7, Track 1 (Red Start, Safe). Occupied by Red Token 1."` or `"A7, Track 52. Empty."`).
4. **Native NVDA Screen-Reader Automatic Game Updates & Square Reading**:
   - Remove competing `aria-live` attributes from visual badges/headers (`#dice-value-text`, `.turn-summary-box`, `#bonus-badge`, `#board-cursor-bar`, `#explorer-focus-card`, `#mp-players-list`).
   - Use an append-only live log (`#sr-polite` with `role="log" aria-live="polite" aria-atomic="false" aria-relevant="additions text"`) where each game update (`announce(text, 'polite')`) appends a new `<div>` node (pruning old nodes above 30) instead of wiping `textContent = ''`. This guarantees NVDA queues and reads every dice roll, AI turn, capture, and turn transition on its own without clipping or cancelling speech.
   - Use `#sr-assertive` (`aria-live="assertive" aria-atomic="true"`) for immediate square navigation announcements and user-triggered inspector hotkeys (`S`, `T`, `O`, `L`).
   - Also update each real `.cell`'s `aria-label` to `"${cellInfo.speechSummary}"` and move DOM focus to the `.cell` when the user is navigating inside `#visual-board`.

---

## 2. Detailed Module Contracts

### 2.1 `engine.js` & `tests.js` (`engine-3`)
- `getCoordName(row, col)`:
  - For `row` (`0..14`) and `col` (`0..14`), returns `String.fromCharCode(65 + col) + (row + 1)` (e.g. `row=6, col=0` -> `'A7'`, `row=6, col=1` -> `'B7'`).
- `isValidSquare(row, col)`:
  - Returns `true` ONLY for the 92 real playable Ludo squares:
    - 52 `TRACK_COORDS`
    - 20 `HOME_STRETCH_COORDS`
    - 4 `HOME_GOAL_COORDS`
    - 16 `YARD_TOKEN_COORDS`
  - Returns `false` for all other coordinates (yard borders, yard background areas, unused center corners `(6,6), (6,8), (8,6), (8,8), (7,7)`).
- `getCellInfo(state, row, col)`:
  - Includes `coord: getCoordName(r, c)` (e.g. `'A7'`, `'B7'`) and `isValidSquare: true | false`.
  - For non-existent coordinates (`!isValidSquare`), returns `isValidSquare: false, type: null, label: '', speechSummary: ''`.
  - For all 92 valid squares:
    - `type`: `'track' | 'homeStretch' | 'homeGoal' | 'yardNest'` (never `'yardArea'` or `'centerArea'`).
    - `label`: e.g. `'Track 1 (Red Start, Safe)'`, `'Red Yard 1'`, `'Red Home Stretch 1'`, `'Red Home Goal'`.
    - `speechSummary`: `${coord}, ${label}. ${occupancyText}` (e.g. `"B7, Track 1 (Red Start, Safe). Occupied by Red Token 1."` or `"A7, Track 52. Empty."`).
- `findNextValidSquare(row, col, dRow, dCol)`:
  - Given current `(row, col)` and step direction `(dRow, dCol)` (where `dRow` is `-1, 0, 1` and `dCol` is `-1, 0, 1`), returns `{ row, col }` of the next valid Ludo square in that direction, or `null` if no valid square exists in that direction:
    1. If `isValidSquare(row + dRow, col + dCol)` is `true`, return `{ row: row + dRow, col: col + dCol }`.
    2. Otherwise, search all 92 valid squares `(vr, vc)`:
       - Must lie strictly in the requested direction (`dCol > 0 ? vc > col : dCol < 0 ? vc < col : dRow > 0 ? vr > row : vr < row`).
       - Let `primaryDist = Math.abs(dCol !== 0 ? vc - col : vr - row)` and `perpDist = Math.abs(dCol !== 0 ? vr - row : vc - col)`.
       - Pick the candidate minimizing `primaryDist + perpDist * 2.5` (preferring candidates with `perpDist === 0` first if `primaryDist <= 5`, so moving across a Yard from `B2` to `E2` or from `B5` to `B7` stays on the same row/column!).
- `getBoardExplorerItems(state)`:
  - Returns ONLY real playable Ludo squares:
    - 16 Yard Token Slots (`Red Yard 1`..`4` with their `coord` `B2, E2, B5, E5`, etc.) OR 4 Yards + 52 Track squares + 20 Home Stretch squares + 4 Home Goals, each with `coord` (`A7`, `B7`, etc.) and `label` prefixed with `coord` (e.g. `"B7 — Track 1 (Red Start, Safe)"`).
