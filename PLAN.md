# Blind Screen-Reader Accessible Web Ludo — Implementation Plan (Phase 2 Update)

## 1. Phase 2 Enhancements Overview
1. **Direct 15×15 Board Arrow-Key Navigation**:
   - Players can navigate the 15×15 Ludo board itself directly using the `Up`, `Down`, `Left`, and `Right` arrow keys (`cursorRow: 0..14`, `cursorCol: 0..14`), as well as `[` / `]` to step sequentially along the 52-square main track.
   - Pressing `Enter` on the currently highlighted board square inspects it in detail—or, during the `MOVE` phase when the square contains one of the current human player's movable tokens, executes that token's move directly from the board cursor!
2. **Distinct Audio Earcons for Empty vs. Occupied Squares (`audio.js`)**:
   - Every arrow-key step on the board triggers `LudoAudio.playCursorMove(cellInfo)`:
     - **Empty Squares**: Plays a crisp, hollow wooden/bamboo tap sound (with subtle pitch mapping by row/column and a gentle overtone if the empty square is a Safe Star or Home Goal).
     - **Occupied Squares (contains piece(s))**: Plays a distinct, resonant harmonic bell/plucked chord using the occupying piece's player signature frequency and waveform (Red, Green, Yellow, Blue)—or a stacked multi-note arpeggio if multiple pieces occupy that square—so blind players immediately distinguish empty squares from occupied squares by ear.
3. **High-Contrast Visual Board Cursor Highlight (`styles.css` & `app.js`)**:
   - The active board square at `(cursorRow, cursorCol)` displays a prominent `.board-cursor-active` highlight: a 4px high-contrast glowing gold/cyan outline, animated corner indicator, and elevated z-index that remains unmistakable over both empty and occupied squares in Dark and Light themes.
4. **Shareable Link Online Multiplayer (`multiplayer.js` + `index.html` + `app.js`)**:
   - Uses **PeerJS (WebRTC DataChannels)** (with `BroadcastChannel` fallback for same-machine multi-tab play) so it works 100% serverless on GitHub Pages.
   - **Host Flow**: Clicking **"Host Multiplayer / Share Link"** creates a room (`?room=<id>`), copies the invite link to the clipboard, and allows the host to start the match once friends join (with remaining seats configurable as AI or Off).
   - **Join Flow**: Opening a shared link (`https://darkalireza.github.io/accessible-ludo/?room=<id>`) automatically connects to the host, claims an available player color seat, announces the assigned color to the screen reader, and synchronizes all dice rolls, moves, audio earcons, and ARIA announcements in real time.

---

## 2. Phase 2 File Ownership & Module Contracts

| File | Owner Agent | Responsibility |
| :--- | :--- | :--- |
| `engine.js` & `tests.js` | `engine-2` | Add `getCellInfo(state, row, col)` to `LudoEngine` returning complete metadata for any `(row, col)` on the 15×15 grid (`type`, `label`, `trackIndex`, `isSafe`, `isOccupied`, `tokens`, `threats`, `speechSummary`), plus unit tests in `tests.js`. |
| `audio.js` | `audio-2` | Add `playCursorMove(cellInfo)` (distinct sounds for empty vs. occupied squares with piece color timbres) and `playMultiplayerEvent(type)` (`join`, `leave`, `linkCopied`) to `LudoAudio`. |
| `multiplayer.js` | `multiplayer` | Implement `window.LudoMultiplayer` managing WebRTC PeerJS connections + `BroadcastChannel` fallback, URL `?room=` parsing, invite link generation, lobby seat assignment, and real-time action/state synchronization. |
| `index.html`, `styles.css`, `app.js` | `ui-2` | Integrate 2D arrow-key board cursor navigation, `.board-cursor-active` visual highlight, `Enter`-to-move on cursor, and the accessible Multiplayer Lobby / Share Link UI. |
| Verification & GitHub Push | `verifier-2` | Run `node tests.js`, syntax-check all files, verify full integration across `engine.js`, `audio.js`, `multiplayer.js`, `index.html`, `styles.css`, `app.js`, and push to GitHub Pages. |

---

## 3. Detailed Interface Specifications

### 3.1 `LudoEngine.getCellInfo(state, row, col)` (`engine.js`)
Returns an object for any `row` (`0..14`) and `col` (`0..14`):
```js
{
  row: 0..14,
  col: 0..14,
  type: 'track' | 'homeStretch' | 'homeGoal' | 'yardNest' | 'yardArea' | 'centerArea',
  label: string,         // e.g. "Track 1 (Red Start, Safe)", "Red Yard Nest 1", "Green Home Stretch 3"
  trackIndex: number|null, // 0..51 if on main track, else null
  playerIndex: number|null, // 0..3 if owned by a player color (yard, stretch, goal, start)
  isSafe: boolean,
  isOccupied: boolean,
  tokens: [              // All tokens currently at (row, col)
    { playerIndex, tokenIndex, color, step, label: "Red Token 1" }
  ],
  threats: string[],     // Active opponent threats if this is a track square
  speechSummary: string  // Complete screen-reader announcement for this square
}
```

### 3.2 `LudoAudio.playCursorMove(cellInfo)` (`audio.js`)
- When `cellInfo.isOccupied === true`:
  - Plays a resonant, melodic bell/chord tone unmistakable from an empty square.
  - Uses the `PLAYER_SIGNATURES[token.playerIndex]` base frequency (in a bright octave) for each token on the square (if multiple tokens are stacked, plays a fast 50ms staggered arpeggio of their respective color pitches!).
- When `cellInfo.isOccupied === false`:
  - Plays a short, dry, low-mid wooden tap (`playNoiseBurst` + short filtered sine/triangle tick) whose pitch shifts subtly with `row`/`col` so the player feels movement across empty squares.
  - If `cellInfo.isSafe` (e.g. Safe Star or Start square) or `type === 'homeGoal'`, adds a subtle high overtone tick so empty special squares are also identifiable.
- `LudoAudio.playMultiplayerEvent(eventType)`:
  - `'join'`: Welcoming ascending two-note chime.
  - `'leave'`: Descending two-note chime.
  - `'linkCopied'`: Crisp confirmation ping.

### 3.3 `window.LudoMultiplayer` (`multiplayer.js`)
- `init(callbacks)`: Accepts callbacks `{ onStateSync, onRemoteRoll, onRemoteMove, onLobbyUpdate, onConnectionStatus, onAnnouncement }`.
- `hostRoom(hostName)`: Generates room ID, initializes PeerJS host (`window.Peer` if available) AND `BroadcastChannel('ludo-room-' + roomId)` fallback, updates browser URL `?room=<roomId>` via `history.replaceState`, assigns host to seat 0 (Red), and returns `{ roomId, inviteUrl }`.
- `joinRoom(roomId, guestName)`: Connects to host room via PeerJS and/or `BroadcastChannel`, requests seat assignment (`1..3`), and syncs game state.
- `getRoomFromUrl()`: Parses `?room=` from `window.location.search`.
- `getInviteUrl()`: Returns full shareable URL containing `?room=<roomId>`.
- `copyInviteLink()`: Copies `getInviteUrl()` to clipboard (`navigator.clipboard.writeText` with textarea fallback).
- `isMultiplayer()` / `isHost()` / `getLocalPlayerIndex()` / `getRoomId()` / `getConnectedPlayers()`.
- `sendAction(actionObj)`: If client, sends `{ type: 'ROLL' }` or `{ type: 'MOVE', tokenIndex }` to host; if host, processes and broadcasts `{ type: 'STATE_UPDATE', state, soundEvent, announcement, moveResult, roll, movingPlayer }` to all connected peers.
- `broadcastState(payload)`: Host sends state/event payload to all peers.
- `leaveRoom()`: Closes connections, removes `?room=` from URL, and returns to offline mode.
