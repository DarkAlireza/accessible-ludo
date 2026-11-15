/**
 * Ludo Accessible Web Application Controller
 * Connects window.LudoEngine and window.LudoAudio to provide a best-in-class
 * blind screen-reader accessible (NVDA, JAWS, VoiceOver) and high-contrast Ludo game.
 *
 * Exported as window.LudoApp (and module.exports for Node compatibility).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      typeof window !== 'undefined' ? window.LudoEngine : null,
      typeof window !== 'undefined' ? window.LudoAudio : null,
      typeof window !== 'undefined' ? window.LudoMultiplayer : null
    );
  } else {
    root.LudoApp = factory(root.LudoEngine, root.LudoAudio, root.LudoMultiplayer);
  }
})(typeof self !== 'undefined' ? self : this, function (LudoEngine, LudoAudio, LudoMultiplayer) {
  'use strict';

  // State container
  let state = null;
  let config = {
    aiSpeed: 'slow', // 'slow' (1400ms), 'normal' (850ms), 'fast' (350ms)
    theme: 'dark',
    filterOccupied: true,
    explorerIndex: 0,
    cursorRow: 6, // Default Red Start Track 1 (row 6, col 1)
    cursorCol: 1
  };

  let aiTurnTimer = null;
  let logHistory = [];
  let lastFocusedElement = null;

  // AI speed delay mappings (milliseconds)
  const AI_DELAYS = {
    slow: 1400,
    normal: 850,
    fast: 350
  };

  function getAIDelay() {
    return AI_DELAYS[config.aiSpeed] || 1000;
  }

  /**
   * Helper to get standard alphanumeric coordinate name (e.g. 'A7', 'B7')
   */
  function getSquareCoord(row, col) {
    if (LudoEngine && typeof LudoEngine.getCoordName === 'function') {
      return LudoEngine.getCoordName(row, col);
    }
    return String.fromCharCode(65 + col) + (row + 1);
  }

  /**
   * Safe Screen Reader Announcement Helper
   * Queues polite game updates into #sr-polite log without wiping prior speech,
   * updates #sr-assertive for immediate inspections/moves, speaks via self-voicing if enabled,
   * and appends to the chronological activity log.
   *
   * @param {string} text
   * @param {'polite'|'assertive'} priority
   * @param {boolean} addToLog
   */
  function announce(text, priority, addToLog) {
    if (!text) return;
    if (priority === undefined) priority = 'polite';
    if (addToLog === undefined) addToLog = true;

    if (typeof document !== 'undefined') {
      // 1. For polite updates (or whenever recorded in activity log), append child to #sr-polite log
      if (priority === 'polite' || addToLog === true) {
        const politeRegion = document.getElementById('sr-polite');
        if (politeRegion) {
          const item = document.createElement('div');
          item.textContent = text;
          politeRegion.appendChild(item);
          // Keep live log lean by pruning oldest nodes above 25
          while (politeRegion.children.length > 25) {
            politeRegion.removeChild(politeRegion.firstChild);
          }
        }
      }

      // 2. For assertive feedback (immediate inspections, errors, or square navigation)
      if (priority === 'assertive') {
        const assertiveRegion = document.getElementById('sr-assertive');
        if (assertiveRegion) {
          assertiveRegion.textContent = '';
          requestAnimationFrame(function () {
            assertiveRegion.textContent = text;
          });
        }
      }

      if (addToLog) {
        addLogEntry(text);
      }
    }

    // Optional self-voicing Web Speech API
    if (LudoAudio && typeof LudoAudio.speak === 'function' && LudoAudio.isSelfVoicing()) {
      LudoAudio.speak(text, priority === 'assertive');
    }
  }

  /**
   * Appends an entry to the Game Activity Log
   */
  function addLogEntry(text) {
    if (typeof document === 'undefined') return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logContainer = document.getElementById('game-log');

    logHistory.push({ time: timeStr, text: text });
    if (logHistory.length > 200) {
      logHistory.shift();
    }

    if (logContainer) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${escapeHtml(text)}</span>`;
      logContainer.appendChild(entry);
      // Auto-scroll to latest entry
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Read the last 3 log entries aloud
   */
  function readRecentLog() {
    if (!logHistory.length) {
      announce('Game log is currently empty.', 'assertive', false);
      return;
    }
    const recent = logHistory.slice(-3);
    const text = 'Recent activity: ' + recent.map(r => r.text).join(' Next: ');
    announce(text, 'assertive', false);
  }

  /**
   * Initializes or resets the Ludo Game
   */
  function initGame(playerConfigs) {
    if (!LudoEngine) {
      if (typeof window !== 'undefined' && window.LudoEngine) {
        LudoEngine = window.LudoEngine;
      }
    }
    if (!LudoAudio) {
      if (typeof window !== 'undefined' && window.LudoAudio) {
        LudoAudio = window.LudoAudio;
      }
    }
    if (!LudoMultiplayer) {
      if (typeof window !== 'undefined' && window.LudoMultiplayer) {
        LudoMultiplayer = window.LudoMultiplayer;
      }
    }

    if (aiTurnTimer) {
      clearTimeout(aiTurnTimer);
      aiTurnTimer = null;
    }

    state = LudoEngine.createGame(playerConfigs);
    logHistory = [];

    if (typeof document !== 'undefined') {
      const logContainer = document.getElementById('game-log');
      if (logContainer) logContainer.innerHTML = '';
    }

    const startMsg = 'New Ludo game started. Red to play. Press Space or R to roll the dice.';
    announce(startMsg, 'polite', true);

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && LudoMultiplayer.isHost()) {
      LudoMultiplayer.setCachedState(state);
      LudoMultiplayer.broadcastState({
        type: 'STATE_SYNC',
        state: state,
        message: 'Host started a new game.'
      });
    }

    render();
    checkTurn();
  }

  /**
   * Checks current turn and handles AI pacing or human focus
   */
  function checkTurn() {
    if (!state || state.gameOver) return;

    const currentPlayer = state.players[state.currentPlayer];
    if (!currentPlayer || currentPlayer.type === 'none') return;

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer()) {
      const localIdx = LudoMultiplayer.getLocalPlayerIndex();
      if (state.currentPlayer === localIdx) {
        if (state.phase === 'ROLL') {
          if (LudoAudio) {
            LudoAudio.playTurnStart(state.currentPlayer, true);
          }
          setTimeout(function () {
            const rollBtn = document.getElementById('roll-btn');
            if (rollBtn && document.activeElement !== rollBtn) {
              rollBtn.focus();
            }
          }, 100);
        }
      } else if (LudoMultiplayer.isHost() && currentPlayer.type === 'ai') {
        scheduleAITurn();
      }
      return;
    }

    if (currentPlayer.type === 'ai') {
      scheduleAITurn();
    } else {
      // Human turn: notify with chime if beginning of turn
      if (state.phase === 'ROLL') {
        if (LudoAudio) {
          LudoAudio.playTurnStart(state.currentPlayer, true);
        }
        // Focus the roll button so keyboard user is ready
        setTimeout(function () {
          const rollBtn = document.getElementById('roll-btn');
          if (rollBtn && document.activeElement !== rollBtn) {
            rollBtn.focus();
          }
        }, 100);
      }
    }
  }

  /**
   * Updates the 15x15 visual board cursor position, plays sound cue,
   * updates status bar, focuses active cell, and announces square details.
   */
  function updateBoardCursor(row, col, announceMove) {
    if (announceMove === undefined) announceMove = true;
    config.cursorRow = Math.max(0, Math.min(14, row));
    config.cursorCol = Math.max(0, Math.min(14, col));

    if (typeof document === 'undefined') return;

    const grid = document.getElementById('visual-board');
    let newActive = null;
    if (grid) {
      const prevActive = grid.querySelector('.board-cursor-active');
      if (prevActive) {
        prevActive.classList.remove('board-cursor-active');
        prevActive.setAttribute('tabindex', '-1');
      }
      newActive = grid.querySelector(`[data-row="${config.cursorRow}"][data-col="${config.cursorCol}"]`);
      if (newActive) {
        newActive.classList.add('board-cursor-active');
        newActive.setAttribute('tabindex', '0');
      }
    }

    if (!state || !LudoEngine || typeof LudoEngine.getCellInfo !== 'function') return;
    const cellInfo = LudoEngine.getCellInfo(state, config.cursorRow, config.cursorCol);

    if (newActive && cellInfo && cellInfo.speechSummary) {
      newActive.setAttribute('aria-label', cellInfo.speechSummary);
    }

    const cursorTextEl = document.getElementById('board-cursor-text');
    if (cursorTextEl) {
      const coordPrefix = cellInfo.coord ? `${cellInfo.coord} — ` : '';
      let desc = `${coordPrefix}${cellInfo.label}`;
      if (cellInfo.isOccupied && cellInfo.tokens && cellInfo.tokens.length > 0) {
        desc += ` — Occupied by: ${cellInfo.tokens.map(t => t.label).join(', ')}`;
      } else {
        desc += ' — Empty';
      }
      cursorTextEl.textContent = desc;
    }

    if (announceMove) {
      if (newActive && typeof newActive.focus === 'function') {
        newActive.focus({ preventScroll: true });
      }

      if (LudoAudio && typeof LudoAudio.playCursorMove === 'function') {
        LudoAudio.playCursorMove(cellInfo);
      }

      const cursorSr = document.getElementById('sr-board-cursor');
      if (cursorSr) {
        cursorSr.textContent = '';
        requestAnimationFrame(function () {
          cursorSr.textContent = cellInfo.speechSummary;
        });
      }

      announce(cellInfo.speechSummary, 'assertive', false);
    }
  }

  /**
   * Steps the board cursor sequentially backward (-1) or forward (+1) along the 52-square track.
   */
  function stepTrackCursor(delta) {
    if (!LudoEngine || !LudoEngine.TRACK_COORDS) return;
    const curIdx = LudoEngine.TRACK_COORDS.findIndex(
      c => c.row === config.cursorRow && c.col === config.cursorCol
    );
    let nextIdx = 0;
    if (curIdx === -1) {
      nextIdx = delta > 0 ? 0 : 51;
    } else {
      nextIdx = (curIdx + delta + 52) % 52;
    }
    const coord = LudoEngine.TRACK_COORDS[nextIdx];
    if (coord) {
      updateBoardCursor(coord.row, coord.col, true);
    }
  }

  /**
   * Enter key on the board cursor: if in MOVE phase and current human has a movable token
   * on that square, execute its move; otherwise announce full square details.
   */
  function handleBoardCursorEnter() {
    if (!state || !LudoEngine || typeof LudoEngine.getCellInfo !== 'function') return;
    const cellInfo = LudoEngine.getCellInfo(state, config.cursorRow, config.cursorCol);

    // If state.phase === 'MOVE' and cell contains a movable token belonging to current human
    if (state.phase === 'MOVE' && state.validMoves && state.validMoves.length > 0) {
      const movableToken = (cellInfo.tokens || []).find(function (t) {
        return t.playerIndex === state.currentPlayer && state.validMoves.some(function (m) {
          return m.tokenIndex === t.tokenIndex;
        });
      });

      if (movableToken) {
        handleHumanMove(movableToken.tokenIndex);
        return;
      }
    }

    announce(cellInfo.speechSummary, 'assertive', false);
    if (LudoAudio && typeof LudoAudio.playCursorMove === 'function') {
      LudoAudio.playCursorMove(cellInfo);
    }
  }

  /**
   * Updates the board cursor status bar text
   */
  function updateBoardCursorBar() {
    if (typeof document === 'undefined') return;
    const cursorTextEl = document.getElementById('board-cursor-text');
    if (!cursorTextEl || !state || !LudoEngine || typeof LudoEngine.getCellInfo !== 'function') return;

    const cellInfo = LudoEngine.getCellInfo(state, config.cursorRow, config.cursorCol);
    const coordPrefix = cellInfo.coord ? `${cellInfo.coord} — ` : `Row ${config.cursorRow + 1}, Col ${config.cursorCol + 1} — `;
    let desc = `${coordPrefix}${cellInfo.label}`;
    if (cellInfo.isOccupied && cellInfo.tokens && cellInfo.tokens.length > 0) {
      desc += ` — Occupied by: ${cellInfo.tokens.map(t => t.label).join(', ')}`;
    } else {
      desc += ' — Empty';
    }
    cursorTextEl.textContent = desc;
  }

  /**
   * Focuses the Multiplayer Lobby Card and announces status
   */
  function focusMultiplayerPanel() {
    const panel = document.getElementById('multiplayer-panel');
    if (!panel) return;
    panel.scrollIntoView({ behavior: 'smooth' });
    const inviteUrlInput = document.getElementById('mp-invite-url');
    const hostBtn = document.getElementById('host-mp-btn');
    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer()) {
      if (inviteUrlInput) inviteUrlInput.focus();
    } else {
      if (hostBtn) hostBtn.focus();
    }
    announce('Multiplayer lobby focused. Press C to copy invite link, or click Host to create a room.', 'polite', false);
  }

  /**
   * Copies the multiplayer room share link to clipboard
   */
  function copyMultiplayerInviteLink() {
    if (!LudoMultiplayer) return;
    LudoMultiplayer.copyInviteLink().then(function (res) {
      if (res && res.success) {
        if (LudoAudio && typeof LudoAudio.playMultiplayerEvent === 'function') {
          LudoAudio.playMultiplayerEvent('linkCopied');
        }
        announce(`Multiplayer invite link copied to clipboard: ${res.url}`, 'assertive', true);
      } else {
        announce('Please create or join a multiplayer room first to copy an invite link.', 'assertive', false);
      }
    }).catch(function () {
      announce('Unable to copy invite link.', 'assertive', false);
    });
  }

  /**
   * Hosts a new Multiplayer match
   */
  function handleHostMultiplayer() {
    if (!LudoMultiplayer) return;
    try {
      const hostConfigs = [
        { name: 'Red (Host)', type: 'human' },
        { name: 'Green', type: 'ai' },
        { name: 'Yellow', type: 'ai' },
        { name: 'Blue', type: 'ai' }
      ];
      initGame(hostConfigs);

      const res = LudoMultiplayer.hostRoom('Red (Host)');
      if (LudoAudio && typeof LudoAudio.playMultiplayerEvent === 'function') {
        LudoAudio.playMultiplayerEvent('join');
      }

      updateMultiplayerUI();
      announce(`Multiplayer room ${res.roomId} created. You are Red (Host). Share link copied to clipboard.`, 'assertive', true);

      LudoMultiplayer.copyInviteLink().catch(function () {});

      LudoMultiplayer.broadcastState({
        type: 'STATE_SYNC',
        state: state,
        message: `Host created room ${res.roomId}.`
      });
    } catch (e) {
      announce('Failed to host multiplayer room: ' + e.message, 'assertive', false);
    }
  }

  /**
   * Joins an existing Multiplayer room
   */
  function handleJoinMultiplayer(roomId) {
    if (!LudoMultiplayer) return;
    const cleanId = LudoMultiplayer.extractRoomId(roomId);
    if (!cleanId) {
      announce('Please enter a valid multiplayer room code or invite link.', 'assertive', false);
      return;
    }

    announce(`Connecting to multiplayer room ${cleanId}...`, 'assertive', true);
    updateMultiplayerStatus(`Connecting to ${cleanId}...`, 'connecting');

    LudoMultiplayer.joinRoom(cleanId, 'Guest')
      .then(function (res) {
        if (LudoAudio && typeof LudoAudio.playMultiplayerEvent === 'function') {
          LudoAudio.playMultiplayerEvent('join');
        }
        updateMultiplayerUI();
        const color = LudoMultiplayer.getLocalPlayerColor() || 'Guest';
        announce(`Connected to room ${cleanId}! You are playing as ${color}.`, 'assertive', true);
      })
      .catch(function (err) {
        announce(`Failed to join room ${cleanId}: ${err.message || err}`, 'assertive', false);
        updateMultiplayerStatus('Connection failed', 'error');
      });
  }

  function handleJoinMultiplayerFromInput() {
    const input = document.getElementById('mp-join-code');
    if (!input) return;
    handleJoinMultiplayer(input.value);
  }

  /**
   * Leaves current Multiplayer room and returns to local offline mode
   */
  function handleLeaveMultiplayer() {
    if (!LudoMultiplayer) return;
    LudoMultiplayer.leaveRoom();
    if (LudoAudio && typeof LudoAudio.playMultiplayerEvent === 'function') {
      LudoAudio.playMultiplayerEvent('leave');
    }
    updateMultiplayerUI();
    announce('Left multiplayer room. Returned to offline local play.', 'assertive', true);
    initGame();
  }

  /**
   * Updates Multiplayer UI badges, buttons, and players list
   */
  function updateMultiplayerUI() {
    if (typeof document === 'undefined') return;
    const isMp = LudoMultiplayer && LudoMultiplayer.isMultiplayer();
    const hostBtn = document.getElementById('host-mp-btn');
    const leaveBtn = document.getElementById('leave-mp-btn');
    const urlInput = document.getElementById('mp-invite-url');
    const statusText = document.getElementById('mp-status-text');
    const playersListEl = document.getElementById('mp-players-list');

    if (hostBtn) {
      hostBtn.classList.toggle('hidden', isMp);
    }
    if (leaveBtn) {
      leaveBtn.classList.toggle('hidden', !isMp);
    }
    if (urlInput) {
      urlInput.value = isMp ? LudoMultiplayer.getInviteUrl() : '';
    }

    if (statusText) {
      if (!isMp) {
        statusText.textContent = 'Offline / Local Mode';
        statusText.className = 'badge badge-mp-status';
      } else {
        const role = LudoMultiplayer.isHost() ? 'Host' : 'Guest';
        const color = LudoMultiplayer.getLocalPlayerColor() || 'Spectator';
        statusText.textContent = `Connected: ${LudoMultiplayer.getRoomId()} (You are ${color} - ${role})`;
        statusText.className = 'badge badge-mp-status connected';
      }
    }

    if (playersListEl) {
      playersListEl.innerHTML = '';
      const localIdx = LudoMultiplayer ? LudoMultiplayer.getLocalPlayerIndex() : 0;
      const colors = ['Red', 'Green', 'Yellow', 'Blue'];

      for (let i = 0; i < 4; i++) {
        const tag = document.createElement('span');
        const colorLower = colors[i].toLowerCase();
        tag.className = `mp-player-tag tag-${colorLower}`;
        if (isMp && i === localIdx) {
          tag.classList.add('current-peer');
        }

        let desc = `${colors[i]}: `;
        if (!state) {
          desc += (i === 0 ? 'Human' : 'AI');
        } else {
          const p = state.players[i];
          if (!p || p.type === 'none') {
            desc += 'Off';
          } else if (p.type === 'human') {
            desc += isMp && i === localIdx ? `${p.name} (You)` : p.name;
          } else {
            desc += 'AI (Computer)';
          }
        }
        tag.textContent = desc;
        playersListEl.appendChild(tag);
      }
    }
  }

  function updateMultiplayerStatus(text, statusClass) {
    const statusText = document.getElementById('mp-status-text');
    if (!statusText) return;
    statusText.textContent = text;
    statusText.className = `badge badge-mp-status ${statusClass || ''}`;
  }

  /**
   * Handles action sent from a remote guest to the host
   */
  function handleRemoteActionFromGuest(action) {
    if (!state || !LudoMultiplayer || !LudoMultiplayer.isHost()) return;
    if (!action) return;

    if (action.type === 'REMOTE_ROLL' || action.type === 'ROLL') {
      if (state.phase === 'ROLL' && state.currentPlayer === action.playerIndex) {
        const rollRes = LudoEngine.rollDice(state);
        if (LudoAudio) LudoAudio.playDiceRoll(rollRes.roll);
        render();
        announce(rollRes.message, 'assertive', true);

        LudoMultiplayer.broadcastState({
          type: 'STATE_SYNC',
          state: state,
          roll: rollRes.roll,
          message: rollRes.message,
          movingPlayer: state.currentPlayer
        });

        if (rollRes.tripleSix || rollRes.autoPassed) {
          scheduleAITurnOrHuman();
        }
      }
    } else if (action.type === 'REMOTE_MOVE' || action.type === 'MOVE') {
      if (state.phase === 'MOVE' && state.currentPlayer === action.playerIndex) {
        const movingPlayer = state.currentPlayer;
        const moveRes = LudoEngine.applyMove(state, action.tokenIndex);
        if (LudoAudio && moveRes.moveResult) {
          LudoAudio.playMove(movingPlayer, moveRes.moveResult);
        }
        render();
        announce(moveRes.message, 'assertive', true);

        LudoMultiplayer.broadcastState({
          type: 'STATE_SYNC',
          state: state,
          moveResult: moveRes.moveResult,
          message: moveRes.message,
          movingPlayer: movingPlayer
        });

        if (moveRes.gameOver) {
          if (LudoAudio) LudoAudio.playWin();
          announce('Game Over! ' + (moveRes.winner ? moveRes.winner.name : '') + ' wins the game!', 'assertive', true);
        } else if (!moveRes.bonusTurn) {
          scheduleAITurnOrHuman();
        }
      }
    }
  }

  /**
   * Initializes Multiplayer Module and listeners
   */
  function initMultiplayerModule() {
    if (!LudoMultiplayer) {
      if (typeof window !== 'undefined' && window.LudoMultiplayer) {
        LudoMultiplayer = window.LudoMultiplayer;
      }
    }
    if (!LudoMultiplayer || typeof LudoMultiplayer.init !== 'function') return;

    LudoMultiplayer.init({
      onStateSync: function (syncedState, msg) {
        const envelope = msg || syncedState;
        const nextState = (syncedState && syncedState.players) ? syncedState : (envelope && envelope.state ? envelope.state : null);
        if (nextState) {
          state = nextState;
        }
        if (envelope && envelope.roll && LudoAudio) {
          LudoAudio.playDiceRoll(envelope.roll);
        }
        if (envelope && envelope.moveResult && LudoAudio) {
          LudoAudio.playMove(envelope.movingPlayer !== undefined && envelope.movingPlayer !== null ? envelope.movingPlayer : state.currentPlayer, envelope.moveResult);
        }
        if (envelope && envelope.message) {
          announce(envelope.message, 'assertive', true);
        }
        render();
        updateMultiplayerUI();
        checkTurn();
      },
      onRemoteAction: function (action) {
        handleRemoteActionFromGuest(action);
      },
      onLobbyUpdate: function (playersList) {
        if (LudoMultiplayer.isHost() && state) {
          playersList.forEach(function (guest) {
            if (guest.playerIndex > 0 && guest.playerIndex < 4) {
              if (state.players[guest.playerIndex].type !== 'human') {
                state.players[guest.playerIndex].type = 'human';
                state.players[guest.playerIndex].name = guest.name || `${LudoEngine.COLORS[guest.playerIndex]} (Player)`;
                if (LudoAudio && typeof LudoAudio.playMultiplayerEvent === 'function') {
                  LudoAudio.playMultiplayerEvent('join');
                }
                announce(`${state.players[guest.playerIndex].name} joined the game as ${LudoEngine.COLORS[guest.playerIndex]}!`, 'assertive', true);
                LudoMultiplayer.broadcastState({
                  type: 'STATE_SYNC',
                  state: state,
                  message: `${state.players[guest.playerIndex].name} joined as ${LudoEngine.COLORS[guest.playerIndex]}!`
                });
              }
            }
          });
        }
        updateMultiplayerUI();
        renderScoreboard();
      },
      onConnectionStatus: function (status) {
        if (status === 'connected') {
          updateMultiplayerUI();
        } else if (status === 'disconnected') {
          updateMultiplayerUI();
        } else if (status === 'error') {
          updateMultiplayerStatus('Multiplayer Warning', 'error');
        }
      },
      onAnnouncement: function (msg, priority) {
        announce(msg, priority || 'polite', true);
      }
    });
  }

  /**
   * AI Turn Scheduler: ensures spaced pacing so screen readers can narrate AI actions
   */
  function scheduleAITurn() {
    if (aiTurnTimer) clearTimeout(aiTurnTimer);

    aiTurnTimer = setTimeout(function () {
      executeAITurnStep();
    }, getAIDelay());
  }

  /**
   * Single step of an AI Turn
   */
  function executeAITurnStep() {
    if (!state || state.gameOver) return;
    const player = state.players[state.currentPlayer];
    if (!player || player.type !== 'ai') return;

    // In multiplayer mode, only host executes AI steps
    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && !LudoMultiplayer.isHost()) {
      return;
    }

    if (state.phase === 'ROLL') {
      // Play audio turn cue
      if (LudoAudio) {
        LudoAudio.playTurnStart(state.currentPlayer, false);
      }

      // Roll dice
      const rollRes = LudoEngine.rollDice(state);
      if (LudoAudio) {
        LudoAudio.playDiceRoll(rollRes.roll);
      }

      render();
      announce(rollRes.message, 'polite', true);

      if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && LudoMultiplayer.isHost()) {
        LudoMultiplayer.broadcastState({
          type: 'STATE_SYNC',
          state: state,
          roll: rollRes.roll,
          message: rollRes.message,
          movingPlayer: state.currentPlayer
        });
      }

      if (rollRes.tripleSix || rollRes.autoPassed) {
        // Turn was forfeited or passed
        scheduleAITurnOrHuman();
      } else if (state.phase === 'MOVE') {
        // AI has valid moves: pause so user hears the roll before piece moves
        aiTurnTimer = setTimeout(function () {
          executeAIMoveStep();
        }, getAIDelay());
      }
    } else if (state.phase === 'MOVE') {
      executeAIMoveStep();
    }
  }

  /**
   * Executes AI Move
   */
  function executeAIMoveStep() {
    if (!state || state.phase !== 'MOVE') return;
    const player = state.players[state.currentPlayer];
    if (!player || player.type !== 'ai') return;

    // In multiplayer mode, only host executes AI steps
    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && !LudoMultiplayer.isHost()) {
      return;
    }

    const bestTokenIndex = LudoEngine.chooseAIMove(state);
    if (bestTokenIndex === null || bestTokenIndex === undefined) {
      return;
    }

    const movingPlayer = state.currentPlayer;
    const moveRes = LudoEngine.applyMove(state, bestTokenIndex);

    // Play procedural sound for the move
    if (LudoAudio && moveRes.moveResult) {
      LudoAudio.playMove(movingPlayer, moveRes.moveResult);
    }

    render();
    announce(moveRes.message, 'polite', true);

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && LudoMultiplayer.isHost()) {
      LudoMultiplayer.broadcastState({
        type: 'STATE_SYNC',
        state: state,
        moveResult: moveRes.moveResult,
        message: moveRes.message,
        movingPlayer: movingPlayer
      });
    }

    if (moveRes.gameOver) {
      if (LudoAudio) LudoAudio.playWin();
      announce('Game Over! ' + (moveRes.winner ? moveRes.winner.name : '') + ' wins the game!', 'assertive', true);
    } else {
      scheduleAITurnOrHuman();
    }
  }

  /**
   * Helper to schedule next turn after move/pass
   */
  function scheduleAITurnOrHuman() {
    if (!state || state.gameOver) return;
    const nextPlayer = state.players[state.currentPlayer];
    if (!nextPlayer) return;

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer()) {
      const localIdx = LudoMultiplayer.getLocalPlayerIndex();
      if (!LudoMultiplayer.isHost()) {
        if (state.currentPlayer === localIdx) {
          if (LudoAudio) {
            LudoAudio.playTurnStart(state.currentPlayer, true);
          }
          const prompt = `It is your turn (${nextPlayer.name})! Press Space or R to roll the dice.`;
          announce(prompt, 'polite', true);
          const isNavigatingBoard = document.activeElement && document.activeElement.classList.contains('cell');
          if (!isNavigatingBoard) {
            setTimeout(function () {
              const rollBtn = document.getElementById('roll-btn');
              if (rollBtn && !(document.activeElement && document.activeElement.classList.contains('cell'))) {
                rollBtn.focus();
              }
            }, 250);
          }
        } else {
          announce(`It is now ${nextPlayer.name}'s turn. Waiting for remote move.`, 'polite', true);
        }
        return;
      } else {
        // Host mode
        if (nextPlayer.type === 'ai') {
          aiTurnTimer = setTimeout(function () {
            executeAITurnStep();
          }, getAIDelay());
          return;
        } else if (state.currentPlayer === localIdx) {
          if (LudoAudio) {
            LudoAudio.playTurnStart(state.currentPlayer, true);
          }
          const prompt = `It is your turn (${nextPlayer.name})! Press Space or R to roll the dice.`;
          announce(prompt, 'polite', true);
          const isNavigatingBoard = document.activeElement && document.activeElement.classList.contains('cell');
          if (!isNavigatingBoard) {
            setTimeout(function () {
              const rollBtn = document.getElementById('roll-btn');
              if (rollBtn && !(document.activeElement && document.activeElement.classList.contains('cell'))) {
                rollBtn.focus();
              }
            }, 250);
          }
          return;
        } else {
          announce(`It is now ${nextPlayer.name}'s turn. Waiting for remote player.`, 'polite', true);
          return;
        }
      }
    }

    // Local / Offline mode
    if (nextPlayer.type === 'ai') {
      aiTurnTimer = setTimeout(function () {
        executeAITurnStep();
      }, getAIDelay());
    } else {
      // Next is Human
      if (LudoAudio) {
        LudoAudio.playTurnStart(state.currentPlayer, true);
      }
      const prompt = `It is now ${nextPlayer.name}'s turn. Press Space or R to roll the dice.`;
      announce(prompt, 'polite', true);

      const isNavigatingBoard = document.activeElement && document.activeElement.classList.contains('cell');
      if (!isNavigatingBoard) {
        setTimeout(function () {
          const rollBtn = document.getElementById('roll-btn');
          if (rollBtn && !(document.activeElement && document.activeElement.classList.contains('cell'))) {
            rollBtn.focus();
          }
        }, 250);
      }
    }
  }

  /**
   * Handles Human Roll Dice Action
   */
  function handleHumanRoll() {
    if (!state || state.gameOver) {
      if (LudoAudio) LudoAudio.playError();
      return;
    }

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer()) {
      const localIdx = LudoMultiplayer.getLocalPlayerIndex();
      if (state.currentPlayer !== localIdx) {
        announce(`It is not your turn. Please wait for ${state.players[state.currentPlayer].name}.`, 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      if (state.phase !== 'ROLL') {
        announce('Dice already rolled. Please select a move.', 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      if (LudoAudio && typeof LudoAudio.init === 'function') {
        LudoAudio.init();
      }

      if (!LudoMultiplayer.isHost()) {
        LudoMultiplayer.sendAction({
          type: 'REMOTE_ROLL',
          playerIndex: localIdx
        });
        announce('Rolling dice...', 'assertive', false);
        return;
      }
    } else {
      const player = state.players[state.currentPlayer];
      if (!player || player.type !== 'human') {
        announce('Please wait for the computer to finish its turn.', 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      if (state.phase !== 'ROLL') {
        announce('Dice already rolled. Please select a move.', 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      // Initialize audio context on first user click/keypress
      if (LudoAudio && typeof LudoAudio.init === 'function') {
        LudoAudio.init();
      }
    }

    const rollRes = LudoEngine.rollDice(state);

    if (LudoAudio) {
      LudoAudio.playDiceRoll(rollRes.roll);
    }

    render();
    announce(rollRes.message, 'polite', true);

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && LudoMultiplayer.isHost()) {
      LudoMultiplayer.broadcastState({
        type: 'STATE_SYNC',
        state: state,
        roll: rollRes.roll,
        message: rollRes.message,
        movingPlayer: state.currentPlayer
      });
    }

    if (rollRes.tripleSix || rollRes.autoPassed) {
      // Turn forfeited or passed automatically
      scheduleAITurnOrHuman();
    } else if (state.phase === 'MOVE') {
      // Focus the first valid move button (unless user is navigating the board)
      const isNavigatingBoard = document.activeElement && document.activeElement.classList.contains('cell');
      if (!isNavigatingBoard) {
        setTimeout(function () {
          const movesList = document.getElementById('moves-list');
          const firstMoveBtn = movesList ? movesList.querySelector('button') : null;
          if (firstMoveBtn && !(document.activeElement && document.activeElement.classList.contains('cell'))) {
            firstMoveBtn.focus();
          }
        }, 250);
      }
    }
  }

  /**
   * Handles Human Move Selection for a specific Token Index (0..3)
   */
  function handleHumanMove(tokenIndex) {
    if (!state || state.gameOver) return;

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer()) {
      const localIdx = LudoMultiplayer.getLocalPlayerIndex();
      if (state.currentPlayer !== localIdx) {
        announce(`It is not your turn. Please wait for ${state.players[state.currentPlayer].name}.`, 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      if (state.phase !== 'MOVE') {
        announce('You need to roll the dice first.', 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      const move = (state.validMoves || []).find(m => m.tokenIndex === tokenIndex);
      if (!move) {
        announce(`Token ${tokenIndex + 1} has no valid move with a roll of ${state.lastRoll}.`, 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      if (!LudoMultiplayer.isHost()) {
        LudoMultiplayer.sendAction({
          type: 'REMOTE_MOVE',
          playerIndex: localIdx,
          tokenIndex: tokenIndex
        });
        announce(`Moving Token ${tokenIndex + 1}...`, 'assertive', false);
        return;
      }
    } else {
      const player = state.players[state.currentPlayer];
      if (!player || player.type !== 'human') return;

      if (state.phase !== 'MOVE') {
        announce('You need to roll the dice first.', 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }

      // Verify if this token is among valid moves
      const move = (state.validMoves || []).find(m => m.tokenIndex === tokenIndex);
      if (!move) {
        announce(`Token ${tokenIndex + 1} has no valid move with a roll of ${state.lastRoll}.`, 'assertive', false);
        if (LudoAudio) LudoAudio.playError();
        return;
      }
    }

    const movingPlayer = state.currentPlayer;
    const moveRes = LudoEngine.applyMove(state, tokenIndex);

    if (LudoAudio && moveRes.moveResult) {
      LudoAudio.playMove(movingPlayer, moveRes.moveResult);
    }

    render();
    announce(moveRes.message, 'polite', true);

    if (LudoMultiplayer && LudoMultiplayer.isMultiplayer() && LudoMultiplayer.isHost()) {
      LudoMultiplayer.broadcastState({
        type: 'STATE_SYNC',
        state: state,
        moveResult: moveRes.moveResult,
        message: moveRes.message,
        movingPlayer: movingPlayer
      });
    }

    if (moveRes.gameOver) {
      if (LudoAudio) LudoAudio.playWin();
      announce('Game Over! ' + (moveRes.winner ? moveRes.winner.name : '') + ' wins the game!', 'assertive', true);
    } else if (moveRes.bonusTurn) {
      // Human earned a bonus roll: focus roll button again (unless user is navigating the board)
      const isNavigatingBoard = document.activeElement && document.activeElement.classList.contains('cell');
      if (!isNavigatingBoard) {
        setTimeout(function () {
          const rollBtn = document.getElementById('roll-btn');
          if (rollBtn && !(document.activeElement && document.activeElement.classList.contains('cell'))) {
            rollBtn.focus();
          }
        }, 250);
      }
    } else {
      // Turn passed to next player
      scheduleAITurnOrHuman();
    }
  }

  /**
   * Keyboard Shortcuts Handler
   */
  function handleKeyDown(e) {
    // Ignore keystrokes when typing in form inputs, textareas, selects
    const tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
    const isInput = tag === 'input' || tag === 'select' || tag === 'textarea';

    // Allow Escape to close dialogs even in forms
    if (e.key === 'Escape') {
      closeAllDialogs();
      return;
    }

    if (isInput) return;

    // Ignore if Ctrl, Alt, or Meta (Command/Windows) is pressed to avoid hijacking browser shortcuts
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const code = e.code;
    const key = e.key;

    // 1. Shift + 1..4: Inspect individual token status
    if (e.shiftKey && (key === '!' || key === '@' || key === '#' || key === '$' || key === '1' || key === '2' || key === '3' || key === '4')) {
      e.preventDefault();
      let tIdx = 0;
      if (key === '1' || key === '!') tIdx = 0;
      else if (key === '2' || key === '@') tIdx = 1;
      else if (key === '3' || key === '#') tIdx = 2;
      else if (key === '4' || key === '$') tIdx = 3;

      if (state) {
        // Inspect human player's token (or current player if all AI)
        const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
          ? state.players.findIndex(p => p.type === 'human')
          : state.currentPlayer;
        const text = LudoEngine.getTokenStatusText(state, pIdx, tIdx);
        announce(text, 'assertive', false);
      }
      return;
    }

    // 2. Space or R: Roll Dice
    if (code === 'Space' || code === 'KeyR') {
      e.preventDefault();
      handleHumanRoll();
      return;
    }

    // 3. 1, 2, 3, 4: Select Move
    if (code === 'Digit1' || code === 'Numpad1') {
      e.preventDefault();
      handleHumanMove(0);
      return;
    }
    if (code === 'Digit2' || code === 'Numpad2') {
      e.preventDefault();
      handleHumanMove(1);
      return;
    }
    if (code === 'Digit3' || code === 'Numpad3') {
      e.preventDefault();
      handleHumanMove(2);
      return;
    }
    if (code === 'Digit4' || code === 'Numpad4') {
      e.preventDefault();
      handleHumanMove(3);
      return;
    }

    // 4. S: Game Status Summary
    if (code === 'KeyS') {
      e.preventDefault();
      if (state) {
        const status = LudoEngine.getGameStatusText(state);
        announce(status, 'assertive', false);
      }
      return;
    }

    // 5. T: My Tokens & Threats
    if (code === 'KeyT') {
      e.preventDefault();
      if (state) {
        const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
          ? state.players.findIndex(p => p.type === 'human')
          : state.currentPlayer;
        const summary = LudoEngine.getPlayerSummaryText(state, pIdx);
        // Include individual threats if any
        let threatDetails = [];
        for (let t = 0; t < 4; t++) {
          const step = state.players[pIdx].tokens[t];
          if (step >= 0 && step <= 50) {
            const abs = LudoEngine.getAbsoluteTrackIndex(pIdx, step);
            const threats = LudoEngine.getThreatsForSquare(state, pIdx, abs);
            if (threats.length > 0) {
              threatDetails.push(`Token ${t + 1} threatened by ${threats.join(', ')}`);
            }
          }
        }
        let full = summary;
        if (threatDetails.length > 0) {
          full += ' Alerts: ' + threatDetails.join('. ') + '.';
        } else {
          full += ' No immediate opponent capture threats.';
        }
        announce(full, 'assertive', false);
      }
      return;
    }

    // 6. O: Opponent Status
    if (code === 'KeyO') {
      e.preventDefault();
      if (state) {
        const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
          ? state.players.findIndex(p => p.type === 'human')
          : state.currentPlayer;
        const oppSummary = LudoEngine.getAllOpponentsSummaryText(state, pIdx);
        announce(oppSummary, 'assertive', false);
      }
      return;
    }

    // 7. L: Read Last 3 Log Entries
    if (code === 'KeyL') {
      e.preventDefault();
      readRecentLog();
      return;
    }

    // 8. B: Focus Board Explorer
    if (code === 'KeyB') {
      e.preventDefault();
      focusBoardExplorer();
      return;
    }

    // 9. M: Toggle Mute
    if (code === 'KeyM') {
      e.preventDefault();
      toggleMute();
      return;
    }

    // 10. V: Toggle Self-Voicing
    if (code === 'KeyV') {
      e.preventDefault();
      toggleSelfVoicing();
      return;
    }

    // 11. H or ?: Help Dialog
    if (code === 'KeyH' || key === '?') {
      e.preventDefault();
      openHelpDialog();
      return;
    }

    // 12. N: Setup Dialog (New Game)
    if (code === 'KeyN') {
      e.preventDefault();
      openSetupDialog();
      return;
    }

    // 13. P: Multiplayer Lobby / Host & Share Link
    if (code === 'KeyP') {
      e.preventDefault();
      focusMultiplayerPanel();
      return;
    }

    // 14. C: Copy Multiplayer Invite Link
    if (code === 'KeyC') {
      e.preventDefault();
      copyMultiplayerInviteLink();
      return;
    }

    // 15. Arrow Keys, Track Step [ / ], and Enter Navigation
    const isExplorerFocused = document.activeElement && (document.activeElement.id === 'explorer-list' || document.activeElement.classList.contains('explorer-item'));

    if (isExplorerFocused) {
      if (code === 'ArrowDown' || code === 'ArrowUp' || code === 'ArrowRight' || code === 'ArrowLeft' || code === 'Home' || code === 'End') {
        e.preventDefault();
        handleExplorerArrowKey(code);
        return;
      }
    } else {
      // Direct 15x15 Board Arrow-Key Navigation on Real Squares Only
      if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
        e.preventDefault();
        let dRow = 0, dCol = 0;
        if (code === 'ArrowUp') dRow = -1;
        else if (code === 'ArrowDown') dRow = 1;
        else if (code === 'ArrowLeft') dCol = -1;
        else if (code === 'ArrowRight') dCol = 1;

        let next = null;
        if (LudoEngine && typeof LudoEngine.findNextValidSquare === 'function') {
          next = LudoEngine.findNextValidSquare(config.cursorRow, config.cursorCol, dRow, dCol);
        }

        if (!next) {
          if (LudoAudio && typeof LudoAudio.playError === 'function') {
            LudoAudio.playError();
          }
          if (LudoEngine && typeof LudoEngine.getCellInfo === 'function') {
            const curInfo = LudoEngine.getCellInfo(state, config.cursorRow, config.cursorCol);
            const coordName = (curInfo && curInfo.coord) ? curInfo.coord : getSquareCoord(config.cursorRow, config.cursorCol);
            announce(`${coordName}. Board edge.`, 'assertive', false);
          }
        } else {
          updateBoardCursor(next.row, next.col, true);
        }
        return;
      }

      // [ and ] track step keys
      if (key === '[' || code === 'BracketLeft') {
        e.preventDefault();
        stepTrackCursor(-1);
        return;
      }
      if (key === ']' || code === 'BracketRight') {
        e.preventDefault();
        stepTrackCursor(1);
        return;
      }

      // Enter key: inspect or move piece at board cursor
      if (code === 'Enter' || key === 'Enter') {
        const active = document.activeElement;
        const isInteractive = active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SELECT' || active.tagName === 'INPUT');
        if (!isInteractive) {
          e.preventDefault();
          handleBoardCursorEnter();
          return;
        }
      }
    }
  }

  /**
   * Jump focus to Board Explorer
   */
  function focusBoardExplorer() {
    const list = document.getElementById('explorer-list');
    if (!list) return;
    const items = list.querySelectorAll('.explorer-item');
    if (items.length > 0) {
      const idx = Math.min(config.explorerIndex, items.length - 1);
      items[idx].focus();
      announceExplorerItem(idx);
    } else {
      list.focus();
      announce('Board Explorer list has no matching squares with current filter.', 'polite', false);
    }
  }

  /**
   * Arrow key navigation within the Board Explorer
   */
  function handleExplorerArrowKey(code) {
    if (!state || !LudoEngine) return;
    const allItems = LudoEngine.getBoardExplorerItems(state);
    if (!allItems.length) return;

    if (code === 'ArrowRight' || code === 'ArrowLeft') {
      // Step sequentially along board squares
      if (config.filterOccupied) {
        // Switch to All Board Squares while preserving current square location
        const occItems = allItems.filter(item => item.isOccupied);
        const currentItem = occItems[config.explorerIndex];
        let fullIdx = currentItem ? allItems.findIndex(it => it.id === currentItem.id) : 0;
        if (fullIdx === -1) fullIdx = 0;

        config.filterOccupied = false;

        const filterOccBtn = document.getElementById('filter-occupied-btn');
        const filterAllBtn = document.getElementById('filter-all-btn');
        if (filterOccBtn && filterAllBtn) {
          filterOccBtn.classList.remove('active');
          filterOccBtn.setAttribute('aria-pressed', 'false');
          filterAllBtn.classList.add('active');
          filterAllBtn.setAttribute('aria-pressed', 'true');
        }

        if (code === 'ArrowRight') {
          config.explorerIndex = (fullIdx + 1) % allItems.length;
        } else {
          config.explorerIndex = (fullIdx - 1 + allItems.length) % allItems.length;
        }
      } else {
        if (code === 'ArrowRight') {
          config.explorerIndex = (config.explorerIndex + 1) % allItems.length;
        } else {
          config.explorerIndex = (config.explorerIndex - 1 + allItems.length) % allItems.length;
        }
      }
    } else if (code === 'ArrowDown' || code === 'ArrowUp') {
      // Navigate between occupied squares
      if (!config.filterOccupied) {
        // Find next or previous occupied square in allItems
        let foundIdx = -1;
        for (let step = 1; step < allItems.length; step++) {
          const idx = code === 'ArrowDown'
            ? (config.explorerIndex + step) % allItems.length
            : (config.explorerIndex - step + allItems.length) % allItems.length;
          if (allItems[idx].isOccupied) {
            foundIdx = idx;
            break;
          }
        }
        if (foundIdx !== -1) {
          config.explorerIndex = foundIdx;
        }
      } else {
        const occItems = allItems.filter(item => item.isOccupied);
        if (occItems.length > 0) {
          if (code === 'ArrowDown') {
            config.explorerIndex = (config.explorerIndex + 1) % occItems.length;
          } else {
            config.explorerIndex = (config.explorerIndex - 1 + occItems.length) % occItems.length;
          }
        }
      }
    } else if (code === 'Home') {
      config.explorerIndex = 0;
    } else if (code === 'End') {
      const currentList = getFilteredExplorerItems();
      config.explorerIndex = Math.max(0, currentList.length - 1);
    }

    renderExplorer();
    const domItems = document.querySelectorAll('.explorer-item');
    if (domItems[config.explorerIndex]) {
      domItems[config.explorerIndex].focus();
    }
    announceExplorerItem(config.explorerIndex);
  }

  /**
   * Returns explorer items filtered according to config.filterOccupied
   */
  function getFilteredExplorerItems() {
    if (!state || !LudoEngine) return [];
    const all = LudoEngine.getBoardExplorerItems(state);
    if (!config.filterOccupied) return all;
    return all.filter(item => item.isOccupied);
  }

  /**
   * Screen reader announcement for the currently inspected square
   */
  function announceExplorerItem(index) {
    const items = getFilteredExplorerItems();
    const item = items[index];
    if (!item) return;

    let desc = `${item.label}. `;
    if (item.isSafe) desc += 'Safe square. ';
    if (item.tokens.length > 0) {
      const tokNames = item.tokens.map(t => t.label).join(', ');
      desc += `Occupied by: ${tokNames}.`;
    } else {
      desc += 'Empty square.';
    }

    // Check threats if on track
    if (item.type === 'track') {
      const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
        ? state.players.findIndex(p => p.type === 'human')
        : state.currentPlayer;
      const threats = LudoEngine.getThreatsForSquare(state, pIdx, item.trackIndex);
      if (threats.length > 0) {
        desc += ` Threat alert: vulnerable to ${threats.join(', ')}.`;
      }
    }

    // Update Focus Card
    const titleEl = document.getElementById('explorer-focus-label');
    const badgeEl = document.getElementById('explorer-focus-badge');
    const tokensEl = document.getElementById('explorer-focus-tokens');
    const threatsEl = document.getElementById('explorer-focus-threats');

    if (titleEl) titleEl.textContent = item.label;
    if (badgeEl) badgeEl.textContent = item.isSafe ? 'Safe Square ★' : 'Track Square';
    if (tokensEl) {
      tokensEl.textContent = item.tokens.length > 0
        ? 'Tokens present: ' + item.tokens.map(t => t.label).join(', ')
        : 'No tokens present.';
    }
    if (threatsEl) {
      if (item.type === 'track') {
        const threats = LudoEngine.getThreatsForSquare(state, state.currentPlayer, item.trackIndex);
        threatsEl.textContent = threats.length > 0 ? 'Threats: ' + threats.join(', ') : '';
      } else {
        threatsEl.textContent = '';
      }
    }

    announce(desc, 'polite', false);
  }

  /**
   * Sound Mute Toggle
   */
  function toggleMute() {
    if (!LudoAudio) return;
    const muted = LudoAudio.toggleMute();
    const label = document.getElementById('mute-label');
    const btn = document.getElementById('btn-mute');
    if (label) label.textContent = muted ? 'Audio: Muted' : 'Audio: On';
    if (btn) btn.setAttribute('aria-pressed', String(muted));
    announce(muted ? 'Sound effects muted.' : 'Sound effects unmuted.', 'assertive', false);
  }

  /**
   * Self-Voicing Speech Toggle
   */
  function toggleSelfVoicing() {
    if (!LudoAudio) return;
    const active = LudoAudio.toggleSelfVoicing();
    const label = document.getElementById('tts-label');
    const btn = document.getElementById('btn-tts');
    if (label) label.textContent = active ? 'Voice: On' : 'Voice: Off';
    if (btn) btn.setAttribute('aria-pressed', String(active));
    announce(active ? 'Self-voicing speech synthesis enabled.' : 'Self-voicing speech disabled.', 'assertive', false);
  }

  /**
   * Theme Toggle (Dark / Light)
   */
  function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      config.theme = 'light';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      config.theme = 'dark';
    }
    const label = document.getElementById('theme-btn-label');
    const btn = document.getElementById('theme-toggle-btn');
    if (label) label.textContent = config.theme === 'dark' ? 'Theme: Dark' : 'Theme: Light';
    if (btn) btn.setAttribute('aria-pressed', String(config.theme === 'light'));
    announce(`Switched to ${config.theme} theme.`, 'polite', false);
  }

  /**
   * Dialog Management (Accessible Dialogs)
   */
  function openSetupDialog() {
    lastFocusedElement = document.activeElement;
    const dialog = document.getElementById('setup-dialog');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      const firstSelect = dialog.querySelector('select');
      if (firstSelect) firstSelect.focus();
    }
  }

  function closeSetupDialog() {
    const dialog = document.getElementById('setup-dialog');
    if (dialog && dialog.open) {
      dialog.close();
      if (lastFocusedElement) lastFocusedElement.focus();
    }
  }

  function openHelpDialog() {
    lastFocusedElement = document.activeElement;
    const dialog = document.getElementById('help-dialog');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      const closeBtn = document.getElementById('close-help-btn');
      if (closeBtn) closeBtn.focus();
    }
  }

  function closeHelpDialog() {
    const dialog = document.getElementById('help-dialog');
    if (dialog && dialog.open) {
      dialog.close();
      if (lastFocusedElement) lastFocusedElement.focus();
    }
  }

  function closeAllDialogs() {
    closeSetupDialog();
    closeHelpDialog();
  }

  /**
   * Setup Form Submission
   */
  function handleSetupSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const p0 = document.getElementById('cfg-player-0').value;
    const p1 = document.getElementById('cfg-player-1').value;
    const p2 = document.getElementById('cfg-player-2').value;
    const p3 = document.getElementById('cfg-player-3').value;
    const speed = document.getElementById('cfg-ai-speed').value;
    const selfVoice = document.getElementById('cfg-self-voicing').checked;

    config.aiSpeed = speed;
    if (LudoAudio) {
      LudoAudio.setSelfVoicing(selfVoice);
      const ttsLabel = document.getElementById('tts-label');
      const ttsBtn = document.getElementById('btn-tts');
      if (ttsLabel) ttsLabel.textContent = selfVoice ? 'Voice: On' : 'Voice: Off';
      if (ttsBtn) ttsBtn.setAttribute('aria-pressed', String(selfVoice));
    }

    const configs = [
      { name: 'Red', type: p0 },
      { name: 'Green', type: p1 },
      { name: 'Yellow', type: p2 },
      { name: 'Blue', type: p3 }
    ];

    // Ensure at least 2 active players
    const activeCount = configs.filter(c => c.type !== 'none').length;
    if (activeCount < 2) {
      alert('Please activate at least 2 players to play Ludo.');
      return;
    }

    closeSetupDialog();
    initGame(configs);
  }

  /**
   * Renders the entire UI
   */
  function render() {
    if (!state) return;

    renderTurnCenter();
    renderVisualBoard();
    renderExplorer();
    renderScoreboard();
    updateMultiplayerUI();
  }

  /**
   * Renders the Turn & Action Center
   */
  function renderTurnCenter() {
    const player = state.players[state.currentPlayer];
    if (!player) return;

    const isMp = LudoMultiplayer && LudoMultiplayer.isMultiplayer();
    const localIdx = isMp ? LudoMultiplayer.getLocalPlayerIndex() : null;
    const isLocalTurn = isMp ? (state.currentPlayer === localIdx) : (player.type === 'human');

    const playerBadge = document.getElementById('player-badge');
    const phaseBadge = document.getElementById('phase-badge');
    const bonusBadge = document.getElementById('bonus-badge');
    const announcementEl = document.getElementById('turn-announcement');
    const diceVisual = document.getElementById('dice-visual');
    const diceValueText = document.getElementById('dice-value-text');
    const rollBtn = document.getElementById('roll-btn');
    const movesList = document.getElementById('moves-list');
    const movesPrompt = document.getElementById('moves-prompt');
    const movesCount = document.getElementById('moves-count');

    // Player Badge
    if (playerBadge) {
      playerBadge.className = `badge badge-player ${player.color.toLowerCase()}`;
      let roleDesc = player.type === 'human' ? 'Human' : 'AI';
      if (isMp) {
        if (state.currentPlayer === localIdx) {
          roleDesc = 'You';
        } else if (player.type === 'human') {
          roleDesc = 'Remote';
        }
      }
      playerBadge.textContent = `${player.name} (${roleDesc})`;
    }

    // Phase Badge & Announcement
    if (phaseBadge) {
      if (state.gameOver) {
        phaseBadge.textContent = 'Game Over';
      } else if (state.phase === 'ROLL') {
        phaseBadge.textContent = 'Roll Phase';
      } else if (state.phase === 'MOVE') {
        phaseBadge.textContent = 'Move Phase';
      }
    }

    if (bonusBadge) {
      const isBonus = state.consecutiveSixes > 0;
      bonusBadge.classList.toggle('hidden', !isBonus);
      if (isBonus) {
        bonusBadge.textContent = `Bonus Turn! (${state.consecutiveSixes} six${state.consecutiveSixes > 1 ? 'es' : ''})`;
      }
    }

    if (announcementEl) {
      if (state.gameOver) {
        const winner = state.winners.length ? state.players[state.winners[0]].name : '';
        announcementEl.textContent = `Game Over! ${winner} is victorious! Press N to start a new game.`;
      } else if (state.phase === 'ROLL') {
        if (isLocalTurn) {
          announcementEl.innerHTML = `<strong>Your Turn (${player.name}):</strong> Press <kbd>Space</kbd> or <kbd>R</kbd> or click below to roll the dice.`;
        } else {
          announcementEl.textContent = `${player.name} is taking their turn...`;
        }
      } else if (state.phase === 'MOVE') {
        if (isLocalTurn) {
          announcementEl.innerHTML = `<strong>Rolled a ${state.lastRoll}:</strong> Choose a token to move using keys <kbd>1</kbd>–<kbd>4</kbd>, click below, or press <kbd>Enter</kbd> on its square.`;
        } else {
          announcementEl.textContent = `${player.name} rolled a ${state.lastRoll} and is selecting a move...`;
        }
      }
    }

    // Dice Face
    if (diceVisual) {
      if (state.lastRoll) {
        diceVisual.setAttribute('data-val', String(state.lastRoll));
        diceVisual.className = 'dice-face';
      } else {
        diceVisual.removeAttribute('data-val');
        diceVisual.className = 'dice-face dice-empty';
      }
    }
    if (diceValueText) {
      diceValueText.textContent = state.lastRoll ? String(state.lastRoll) : '—';
    }

    // Roll Button State
    if (rollBtn) {
      const canRoll = !state.gameOver && state.phase === 'ROLL' && isLocalTurn;
      rollBtn.disabled = !canRoll;
      rollBtn.setAttribute('aria-disabled', String(!canRoll));
    }

    // Available Moves List
    if (movesList && movesCount && movesPrompt) {
      movesList.innerHTML = '';
      const moves = state.validMoves || [];
      movesCount.textContent = `(${moves.length})`;

      if (state.gameOver) {
        movesPrompt.textContent = 'Game concluded.';
      } else if (state.phase === 'ROLL') {
        movesPrompt.innerHTML = 'Roll the dice to see available moves. Then press <kbd>1</kbd>–<kbd>4</kbd> to move.';
      } else if (moves.length === 0) {
        movesPrompt.textContent = 'No valid moves available for this roll.';
      } else {
        movesPrompt.innerHTML = isLocalTurn
          ? `Select a move with keys <kbd>1</kbd>–<kbd>4</kbd>, click below, or press <kbd>Enter</kbd> on its square:`
          : `${player.name} is deciding...`;

        moves.forEach(function (m) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'move-btn';
          btn.dataset.tokenIndex = String(m.tokenIndex);
          btn.disabled = !isLocalTurn;

          let badgeHtml = '';
          if (m.isCapture) {
            badgeHtml = `<span class="move-badge capture">Capture!</span>`;
          } else if (m.toStep === 56) {
            badgeHtml = `<span class="move-badge home">Home Goal!</span>`;
          } else if (m.isSafeDestination) {
            badgeHtml = `<span class="move-badge safe">Safe Square</span>`;
          } else if (m.isExitYard) {
            badgeHtml = `<span class="move-badge yard">Exit Yard</span>`;
          }

          btn.innerHTML = `
            <span class="move-key-tag">${m.tokenIndex + 1}</span>
            <span class="move-summary-text">${escapeHtml(m.summary)}</span>
            ${badgeHtml}
          `;

          btn.addEventListener('click', function () {
            handleHumanMove(m.tokenIndex);
          });

          movesList.appendChild(btn);
        });
      }
    }
  }

  /**
   * Initializes the Authentic Classic Ludo Board Grid DOM structure (once)
   * Zero non-existent squares: only the 92 real playable Ludo squares exist:
   * - 4 authentic 6x6 Corner Yard Containers with white inner box and 4 circular slots (16 cells)
   * - 1 authentic 3x3 Center Home Container with 4 diagonal colored triangles and 4 Home Goals (4 cells)
   * - 52 Main Track cells (.cell.track-cell)
   * - 20 Home Stretch cells (.cell.stretch-cell)
   */
  function initVisualBoardGrid() {
    if (typeof document === 'undefined') return;
    const grid = document.getElementById('visual-board');
    if (!grid) return;

    grid.innerHTML = '';

    // Fallback coordinates if engine constants aren't resolved yet
    const fallbackYardCoords = [
      [{ row: 1, col: 1 }, { row: 1, col: 4 }, { row: 4, col: 1 }, { row: 4, col: 4 }],
      [{ row: 1, col: 10 }, { row: 1, col: 13 }, { row: 4, col: 10 }, { row: 4, col: 13 }],
      [{ row: 10, col: 10 }, { row: 10, col: 13 }, { row: 13, col: 10 }, { row: 13, col: 13 }],
      [{ row: 10, col: 1 }, { row: 10, col: 4 }, { row: 13, col: 1 }, { row: 13, col: 4 }]
    ];

    const fallbackGoalCoords = [
      { row: 7, col: 6 }, // Red
      { row: 6, col: 7 }, // Green
      { row: 7, col: 8 }, // Yellow
      { row: 8, col: 7 }  // Blue
    ];

    // 1. Render 4 authentic 6x6 Corner Yard Containers
    const YARDS = [
      { playerIndex: 0, color: 'red', gridRow: '1 / 7', gridCol: '1 / 7' },
      { playerIndex: 1, color: 'green', gridRow: '1 / 7', gridCol: '10 / 16' },
      { playerIndex: 2, color: 'yellow', gridRow: '10 / 16', gridCol: '10 / 16' },
      { playerIndex: 3, color: 'blue', gridRow: '10 / 16', gridCol: '1 / 7' }
    ];

    YARDS.forEach(function (yard) {
      const yardBox = document.createElement('div');
      yardBox.className = `ludo-yard-box yard-${yard.color}`;
      yardBox.style.gridRow = yard.gridRow;
      yardBox.style.gridColumn = yard.gridCol;

      const innerWhite = document.createElement('div');
      innerWhite.className = 'yard-inner-white';

      const slotCoords = (LudoEngine && LudoEngine.YARD_TOKEN_COORDS && LudoEngine.YARD_TOKEN_COORDS[yard.playerIndex])
        || fallbackYardCoords[yard.playerIndex];

      slotCoords.forEach(function (coord, slotIdx) {
        const slotCell = document.createElement('div');
        slotCell.className = `cell yard-slot yard-slot-${yard.color}`;
        slotCell.dataset.row = String(coord.row);
        slotCell.dataset.col = String(coord.col);
        slotCell.dataset.yardPlayer = String(yard.playerIndex);
        slotCell.dataset.yardSlot = String(slotIdx);
        slotCell.setAttribute('role', 'gridcell');
        slotCell.setAttribute('tabindex', '-1');

        const coordName = getSquareCoord(coord.row, coord.col);
        slotCell.innerHTML = `<span class="cell-coord" aria-hidden="true">${coordName}</span>`;

        slotCell.addEventListener('click', function () {
          updateBoardCursor(coord.row, coord.col, false);
          handleBoardCursorEnter();
        });

        innerWhite.appendChild(slotCell);
      });

      yardBox.appendChild(innerWhite);
      grid.appendChild(yardBox);
    });

    // 2. Render 1 authentic 3x3 Center Home Container with 4 diagonal colored triangles
    const centerHome = document.createElement('div');
    centerHome.className = 'ludo-center-home';
    centerHome.style.gridRow = '7 / 10';
    centerHome.style.gridColumn = '7 / 10';

    const svgTriangles = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgTriangles.setAttribute('viewBox', '0 0 100 100');
    svgTriangles.setAttribute('class', 'center-triangles-svg');
    svgTriangles.setAttribute('aria-hidden', 'true');
    svgTriangles.setAttribute('preserveAspectRatio', 'none');
    svgTriangles.innerHTML = `
      <polygon points="0,0 50,50 0,100" class="triangle-red" />
      <polygon points="0,0 100,0 50,50" class="triangle-green" />
      <polygon points="100,0 100,100 50,50" class="triangle-yellow" />
      <polygon points="0,100 100,100 50,50" class="triangle-blue" />
    `;
    centerHome.appendChild(svgTriangles);

    // 4 Real Home Goal cells positioned inside the 3x3 grid over their triangles
    const GOALS = [
      { playerIndex: 0, color: 'red', row: 7, col: 6, gridRow: 2, gridCol: 1 },
      { playerIndex: 1, color: 'green', row: 6, col: 7, gridRow: 1, gridCol: 2 },
      { playerIndex: 2, color: 'yellow', row: 7, col: 8, gridRow: 2, gridCol: 3 },
      { playerIndex: 3, color: 'blue', row: 8, col: 7, gridRow: 3, gridCol: 2 }
    ];

    GOALS.forEach(function (goal) {
      const goalCoord = (LudoEngine && LudoEngine.HOME_GOAL_COORDS && LudoEngine.HOME_GOAL_COORDS[goal.playerIndex])
        || fallbackGoalCoords[goal.playerIndex];

      const goalCell = document.createElement('div');
      goalCell.className = `cell goal-cell goal-${goal.color}`;
      goalCell.dataset.row = String(goalCoord.row);
      goalCell.dataset.col = String(goalCoord.col);
      goalCell.dataset.goalPlayer = String(goal.playerIndex);
      goalCell.style.gridRow = String(goal.gridRow);
      goalCell.style.gridColumn = String(goal.gridCol);
      goalCell.setAttribute('role', 'gridcell');
      goalCell.setAttribute('tabindex', '-1');

      const coordName = getSquareCoord(goalCoord.row, goalCoord.col);
      goalCell.innerHTML = `
        <span class="cell-coord" aria-hidden="true">${coordName}</span>
        <span class="goal-icon" aria-hidden="true">🏆</span>
      `;

      goalCell.addEventListener('click', function () {
        updateBoardCursor(goalCoord.row, goalCoord.col, false);
        handleBoardCursorEnter();
      });

      centerHome.appendChild(goalCell);
    });

    grid.appendChild(centerHome);

    // 3. Render ONLY the 52 Main Track cells
    const trackCoords = (LudoEngine && LudoEngine.TRACK_COORDS) || [];
    const safeIndices = (LudoEngine && LudoEngine.SAFE_INDICES) || [0, 8, 13, 21, 26, 34, 39, 47];
    const startIndices = (LudoEngine && LudoEngine.START_INDICES) || [0, 13, 26, 39];
    const startColors = ['red', 'green', 'yellow', 'blue'];

    trackCoords.forEach(function (coord, tIdx) {
      const cell = document.createElement('div');
      cell.className = 'cell track-cell';
      cell.dataset.row = String(coord.row);
      cell.dataset.col = String(coord.col);
      cell.dataset.trackIndex = String(tIdx);
      cell.style.gridRow = String(coord.row + 1);
      cell.style.gridColumn = String(coord.col + 1);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '-1');

      const coordName = getSquareCoord(coord.row, coord.col);
      const isSafe = safeIndices.indexOf(tIdx) !== -1;
      const startPIdx = startIndices.indexOf(tIdx);

      let markerHtml = '';
      if (startPIdx !== -1) {
        cell.classList.add(`start-${startColors[startPIdx]}`);
        markerHtml = `<span class="safe-star-icon" aria-hidden="true">★</span>`;
      } else if (isSafe) {
        cell.classList.add('safe-square');
        markerHtml = `<span class="safe-star-icon" aria-hidden="true">★</span>`;
      }

      // Home stretch entry turn arrows
      if (tIdx === 50) {
        cell.classList.add('stretch-entry-cell', 'entry-red');
        markerHtml = `<span class="entry-arrow" aria-hidden="true">→</span>`;
      } else if (tIdx === 11) {
        cell.classList.add('stretch-entry-cell', 'entry-green');
        markerHtml = `<span class="entry-arrow" aria-hidden="true">↓</span>`;
      } else if (tIdx === 24) {
        cell.classList.add('stretch-entry-cell', 'entry-yellow');
        markerHtml = `<span class="entry-arrow" aria-hidden="true">←</span>`;
      } else if (tIdx === 37) {
        cell.classList.add('stretch-entry-cell', 'entry-blue');
        markerHtml = `<span class="entry-arrow" aria-hidden="true">↑</span>`;
      }

      cell.innerHTML = `
        <span class="cell-coord" aria-hidden="true">${coordName}</span>
        ${markerHtml}
      `;

      cell.addEventListener('click', function () {
        updateBoardCursor(coord.row, coord.col, false);
        handleBoardCursorEnter();
      });

      grid.appendChild(cell);
    });

    // 4. Render ONLY the 20 Home Stretch cells
    const stretchCoords = (LudoEngine && LudoEngine.HOME_STRETCH_COORDS) || [];
    const colors = ['red', 'green', 'yellow', 'blue'];

    stretchCoords.forEach(function (coordsList, pIdx) {
      const color = colors[pIdx];
      coordsList.forEach(function (coord, sIdx) {
        const cell = document.createElement('div');
        cell.className = `cell stretch-cell stretch-${color}`;
        cell.dataset.row = String(coord.row);
        cell.dataset.col = String(coord.col);
        cell.dataset.stretchPlayer = String(pIdx);
        cell.dataset.stretchIndex = String(sIdx + 1);
        cell.style.gridRow = String(coord.row + 1);
        cell.style.gridColumn = String(coord.col + 1);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', '-1');

        const coordName = getSquareCoord(coord.row, coord.col);
        cell.innerHTML = `
          <span class="cell-coord" aria-hidden="true">${coordName}</span>
          <span class="stretch-num-label" aria-hidden="true">${sIdx + 1}</span>
        `;

        cell.addEventListener('click', function () {
          updateBoardCursor(coord.row, coord.col, false);
          handleBoardCursorEnter();
        });

        grid.appendChild(cell);
      });
    });

    // Set initial active highlight on the default cursor cell
    const initCell = grid.querySelector(`[data-row="${config.cursorRow}"][data-col="${config.cursorCol}"]`);
    if (initCell) {
      initCell.classList.add('board-cursor-active');
      initCell.setAttribute('tabindex', '0');
    }
  }

  /**
   * Updates visual tokens and accessible labels on the 15x15 board grid
   */
  function renderVisualBoard() {
    if (typeof document === 'undefined') return;
    const grid = document.getElementById('visual-board');
    if (!grid) return;

    // Remove existing tokens
    const existingTokens = grid.querySelectorAll('.token, .token-stack');
    existingTokens.forEach(el => el.remove());

    if (!state || !LudoEngine) return;

    // Map coordinates to tokens present
    const coordMap = new Map();

    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const p = state.players[pIdx];
      if (!p || p.type === 'none') continue;

      for (let t = 0; t < 4; t++) {
        const coord = LudoEngine.getTokenCoords(state, pIdx, t);
        const key = `${coord.row},${coord.col}`;

        if (!coordMap.has(key)) {
          coordMap.set(key, []);
        }
        coordMap.get(key).push({
          playerIndex: pIdx,
          color: p.color,
          tokenIndex: t,
          label: `${p.color[0]}${t + 1}`
        });
      }
    }

    // Place tokens into cells
    coordMap.forEach(function (tokens, key) {
      const parts = key.split(',');
      const r = parts[0];
      const c = parts[1];
      const cell = grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      if (!cell) return;

      if (tokens.length === 1) {
        const tok = tokens[0];
        const tokEl = document.createElement('div');
        tokEl.className = `token token-${tok.color.toLowerCase()}`;
        tokEl.title = `${tok.color} Token ${tok.tokenIndex + 1}`;
        tokEl.innerHTML = `<span>${tok.label}</span>`;
        cell.appendChild(tokEl);
      } else {
        const stackEl = document.createElement('div');
        stackEl.className = 'token-stack';
        tokens.forEach(function (tok) {
          const tokEl = document.createElement('div');
          tokEl.className = `token token-${tok.color.toLowerCase()}`;
          tokEl.title = `${tok.color} Token ${tok.tokenIndex + 1}`;
          tokEl.innerHTML = `<span>${tok.label}</span>`;
          stackEl.appendChild(tokEl);
        });
        cell.appendChild(stackEl);
      }
    });

    // Update accessible name (aria-label) and tabindex of all 92 cells
    const allCells = grid.querySelectorAll('.cell');
    const activeCell = grid.querySelector(`[data-row="${config.cursorRow}"][data-col="${config.cursorCol}"]`);

    allCells.forEach(function (cell) {
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      if (!isNaN(r) && !isNaN(c) && typeof LudoEngine.getCellInfo === 'function') {
        const info = LudoEngine.getCellInfo(state, r, c);
        if (info && info.speechSummary) {
          cell.setAttribute('aria-label', info.speechSummary);
        }
      }

      if (cell === activeCell) {
        cell.classList.add('board-cursor-active');
        cell.setAttribute('tabindex', '0');
      } else {
        cell.classList.remove('board-cursor-active');
        cell.setAttribute('tabindex', '-1');
      }
    });

    updateBoardCursorBar();
  }

  /**
   * Renders the Accessible Board Explorer List
   */
  function renderExplorer() {
    if (typeof document === 'undefined') return;
    const list = document.getElementById('explorer-list');
    const badge = document.getElementById('explorer-count-badge');
    if (!list) return;

    list.innerHTML = '';
    const items = getFilteredExplorerItems();

    if (badge) {
      badge.textContent = `${items.length} square${items.length === 1 ? '' : 's'}`;
    }

    if (items.length === 0) {
      list.innerHTML = '<div class="explorer-item empty-state">No matching squares for current filter.</div>';
      return;
    }

    if (config.explorerIndex >= items.length) {
      config.explorerIndex = 0;
    }

    items.forEach(function (item, idx) {
      const itemEl = document.createElement('div');
      itemEl.className = 'explorer-item';
      itemEl.role = 'option';
      itemEl.id = `explorer-opt-${idx}`;
      itemEl.tabIndex = idx === config.explorerIndex ? 0 : -1;
      itemEl.setAttribute('aria-selected', String(idx === config.explorerIndex));
      if (idx === config.explorerIndex) {
        itemEl.classList.add('focused');
      }

      let safeIcon = item.isSafe ? '<span class="item-safe-icon" title="Safe square">★</span>' : '<span></span>';
      let tokensTags = '';
      if (item.tokens.length > 0) {
        tokensTags = item.tokens
          .map(t => `<span class="item-token-tag ${t.color.toLowerCase()}">${t.color[0]}${t.tokenIndex + 1}</span>`)
          .join('');
      }

      itemEl.innerHTML = `
        ${safeIcon}
        <span class="item-label">${escapeHtml(item.label)}</span>
        <div class="item-tokens-tags">${tokensTags}</div>
      `;

      itemEl.addEventListener('click', function () {
        config.explorerIndex = idx;
        renderExplorer();
        itemEl.focus();
        announceExplorerItem(idx);
      });

      itemEl.addEventListener('keydown', function (e) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          announceExplorerItem(idx);
        }
      });

      list.appendChild(itemEl);
    });
  }

  /**
   * Renders the Scoreboard in Sidebar
   */
  function renderScoreboard() {
    if (typeof document === 'undefined') return;
    const scoreboard = document.getElementById('scoreboard');
    const turnCounter = document.getElementById('turn-counter-badge');
    if (!scoreboard || !state) return;

    if (turnCounter) {
      turnCounter.textContent = `Turn ${state.turnCount || 1}`;
    }

    scoreboard.innerHTML = '';

    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const p = state.players[pIdx];
      if (!p || p.type === 'none') continue;

      const card = document.createElement('div');
      card.className = `player-score-card ${pIdx === state.currentPlayer ? 'active-turn' : ''}`;

      const yardTokens = p.tokens.filter(s => s === -1).length;
      const trackTokens = p.tokens.filter(s => s >= 0 && s <= 50).length;
      const stretchTokens = p.tokens.filter(s => s >= 51 && s <= 55).length;
      const homeTokens = p.tokens.filter(s => s === 56).length;

      let rankTag = p.hasWon ? `<span class="badge badge-bonus">Rank #${p.rank}</span>` : '';
      let turnTag = pIdx === state.currentPlayer ? '<span class="badge badge-phase">Active</span>' : '';

      card.innerHTML = `
        <div class="score-card-header">
          <span class="score-player-name">
            <span class="color-dot ${p.color.toLowerCase()}"></span>
            ${escapeHtml(p.name)} (${p.type === 'human' ? 'Human' : 'AI'})
          </span>
          <div class="score-tags">${turnTag} ${rankTag}</div>
        </div>
        <div class="score-token-pills">
          <span class="token-status-pill yard">Yard: ${yardTokens}</span>
          <span class="token-status-pill track">Track: ${trackTokens}</span>
          <span class="token-status-pill stretch">Stretch: ${stretchTokens}</span>
          <span class="token-status-pill home">Home: ${homeTokens}/4</span>
        </div>
      `;

      scoreboard.appendChild(card);
    }
  }

  /**
   * Binds Event Listeners
   */
  function bindEvents() {
    if (typeof document === 'undefined') return;

    // Global Keydown
    window.addEventListener('keydown', handleKeyDown);

    // Primary Roll Button
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) {
      rollBtn.addEventListener('click', handleHumanRoll);
    }

    // Inspector Toolbar Buttons
    const btnStatus = document.getElementById('btn-status');
    if (btnStatus) {
      btnStatus.addEventListener('click', function () {
        if (state) announce(LudoEngine.getGameStatusText(state), 'assertive', false);
      });
    }

    const btnMyTokens = document.getElementById('btn-my-tokens');
    if (btnMyTokens) {
      btnMyTokens.addEventListener('click', function () {
        if (state) {
          const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
            ? state.players.findIndex(p => p.type === 'human')
            : state.currentPlayer;
          announce(LudoEngine.getPlayerSummaryText(state, pIdx), 'assertive', false);
        }
      });
    }

    const btnOpponents = document.getElementById('btn-opponents');
    if (btnOpponents) {
      btnOpponents.addEventListener('click', function () {
        if (state) {
          const pIdx = state.players.findIndex(p => p.type === 'human') !== -1
            ? state.players.findIndex(p => p.type === 'human')
            : state.currentPlayer;
          announce(LudoEngine.getAllOpponentsSummaryText(state, pIdx), 'assertive', false);
        }
      });
    }

    const btnRecentLog = document.getElementById('btn-recent-log');
    if (btnRecentLog) {
      btnRecentLog.addEventListener('click', readRecentLog);
    }

    const btnBoardExplorer = document.getElementById('btn-board-explorer');
    if (btnBoardExplorer) {
      btnBoardExplorer.addEventListener('click', focusBoardExplorer);
    }

    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      btnMute.addEventListener('click', toggleMute);
    }

    const btnTts = document.getElementById('btn-tts');
    if (btnTts) {
      btnTts.addEventListener('click', toggleSelfVoicing);
    }

    const btnRestartQuick = document.getElementById('btn-restart-quick');
    if (btnRestartQuick) {
      btnRestartQuick.addEventListener('click', openSetupDialog);
    }

    // Header actions
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    const openSetupBtn = document.getElementById('open-setup-btn');
    if (openSetupBtn) {
      openSetupBtn.addEventListener('click', openSetupDialog);
    }

    const closeSetupDialogBtn = document.getElementById('close-setup-dialog-btn');
    if (closeSetupDialogBtn) {
      closeSetupDialogBtn.addEventListener('click', closeSetupDialog);
    }

    const cancelSetupBtn = document.getElementById('cancel-setup-btn');
    if (cancelSetupBtn) {
      cancelSetupBtn.addEventListener('click', closeSetupDialog);
    }

    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
      setupForm.addEventListener('submit', handleSetupSubmit);
    }

    const openHelpBtn = document.getElementById('open-help-btn');
    if (openHelpBtn) {
      openHelpBtn.addEventListener('click', openHelpDialog);
    }

    const closeHelpDialogBtn = document.getElementById('close-help-dialog-btn');
    if (closeHelpDialogBtn) {
      closeHelpDialogBtn.addEventListener('click', closeHelpDialog);
    }

    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpBtn) {
      closeHelpBtn.addEventListener('click', closeHelpDialog);
    }

    // Board Explorer Filters
    const filterOccBtn = document.getElementById('filter-occupied-btn');
    const filterAllBtn = document.getElementById('filter-all-btn');

    if (filterOccBtn && filterAllBtn) {
      filterOccBtn.addEventListener('click', function () {
        config.filterOccupied = true;
        config.explorerIndex = 0;
        filterOccBtn.classList.add('active');
        filterOccBtn.setAttribute('aria-pressed', 'true');
        filterAllBtn.classList.remove('active');
        filterAllBtn.setAttribute('aria-pressed', 'false');
        renderExplorer();
        announce('Board Explorer filtered: Occupied Squares Only.', 'polite', false);
      });

      filterAllBtn.addEventListener('click', function () {
        config.filterOccupied = false;
        config.explorerIndex = 0;
        filterAllBtn.classList.add('active');
        filterAllBtn.setAttribute('aria-pressed', 'true');
        filterOccBtn.classList.remove('active');
        filterOccBtn.setAttribute('aria-pressed', 'false');
        renderExplorer();
        announce('Board Explorer filtered: All Board Squares.', 'polite', false);
      });
    }

    // Sidebar Log Controls
    const speakLogBtn = document.getElementById('speak-log-btn');
    if (speakLogBtn) {
      speakLogBtn.addEventListener('click', readRecentLog);
    }

    const clearLogBtn = document.getElementById('clear-log-btn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', function () {
        logHistory = [];
        const container = document.getElementById('game-log');
        if (container) container.innerHTML = '';
        announce('Game log cleared.', 'polite', false);
      });
    }

    // Multiplayer button and input bindings
    const openMpBtn = document.getElementById('open-mp-btn');
    if (openMpBtn) {
      openMpBtn.addEventListener('click', focusMultiplayerPanel);
    }

    const hostMpBtn = document.getElementById('host-mp-btn');
    if (hostMpBtn) {
      hostMpBtn.addEventListener('click', handleHostMultiplayer);
    }

    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', copyMultiplayerInviteLink);
    }

    const joinMpBtn = document.getElementById('join-mp-btn');
    if (joinMpBtn) {
      joinMpBtn.addEventListener('click', handleJoinMultiplayerFromInput);
    }

    const mpJoinCodeInput = document.getElementById('mp-join-code');
    if (mpJoinCodeInput) {
      mpJoinCodeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleJoinMultiplayerFromInput();
        }
      });
    }

    const leaveMpBtn = document.getElementById('leave-mp-btn');
    if (leaveMpBtn) {
      leaveMpBtn.addEventListener('click', handleLeaveMultiplayer);
    }
  }

  /**
   * Initializes the Application on DOMContentLoaded
   */
  function initApp() {
    if (typeof window !== 'undefined') {
      LudoEngine = window.LudoEngine || LudoEngine;
      LudoAudio = window.LudoAudio || LudoAudio;
      LudoMultiplayer = window.LudoMultiplayer || LudoMultiplayer;
    }

    initVisualBoardGrid();
    bindEvents();
    initMultiplayerModule();
    initGame();

    // Check URL for ?room= parameter to auto-join
    if (LudoMultiplayer && typeof LudoMultiplayer.getRoomFromUrl === 'function') {
      const roomParam = LudoMultiplayer.getRoomFromUrl();
      if (roomParam) {
        setTimeout(function () {
          handleJoinMultiplayer(roomParam);
        }, 300);
      }
    }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  // Public API
  return {
    initApp,
    initGame,
    handleHumanRoll,
    handleHumanMove,
    handleKeyDown,
    updateBoardCursor,
    stepTrackCursor,
    handleBoardCursorEnter,
    handleHostMultiplayer,
    handleJoinMultiplayer,
    handleLeaveMultiplayer,
    copyMultiplayerInviteLink,
    focusMultiplayerPanel,
    announce,
    readRecentLog,
    toggleMute,
    toggleSelfVoicing,
    toggleTheme,
    getState: function () { return state; },
    getConfig: function () { return config; }
  };
});
