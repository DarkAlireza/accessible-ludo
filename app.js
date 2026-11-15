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
      typeof window !== 'undefined' ? window.LudoAudio : null
    );
  } else {
    root.LudoApp = factory(root.LudoEngine, root.LudoAudio);
  }
})(typeof self !== 'undefined' ? self : this, function (LudoEngine, LudoAudio) {
  'use strict';

  // State container
  let state = null;
  let config = {
    aiSpeed: 'slow', // 'slow' (1400ms), 'normal' (850ms), 'fast' (350ms)
    theme: 'dark',
    filterOccupied: true,
    explorerIndex: 0
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
   * Safe Screen Reader Announcement Helper
   * Updates polite or assertive live regions, speaks via self-voicing if enabled,
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
      const regionId = priority === 'assertive' ? 'sr-assertive' : 'sr-polite';
      const region = document.getElementById(regionId);
      if (region) {
        // Clear briefly then set so repeated identical texts re-trigger screen reader speech
        region.textContent = '';
        setTimeout(function () {
          region.textContent = text;
        }, 50);
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
      announce(prompt, 'assertive', true);

      setTimeout(function () {
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) rollBtn.focus();
      }, 100);
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

    const rollRes = LudoEngine.rollDice(state);

    if (LudoAudio) {
      LudoAudio.playDiceRoll(rollRes.roll);
    }

    render();
    announce(rollRes.message, 'assertive', true);

    if (rollRes.tripleSix || rollRes.autoPassed) {
      // Turn forfeited or passed automatically
      scheduleAITurnOrHuman();
    } else if (state.phase === 'MOVE') {
      // Focus the first valid move button immediately so keyboard user can act seamlessly
      setTimeout(function () {
        const movesList = document.getElementById('moves-list');
        const firstMoveBtn = movesList ? movesList.querySelector('button') : null;
        if (firstMoveBtn) {
          firstMoveBtn.focus();
        }
      }, 50);
    }
  }

  /**
   * Handles Human Move Selection for a specific Token Index (0..3)
   */
  function handleHumanMove(tokenIndex) {
    if (!state || state.gameOver) return;

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

    const movingPlayer = state.currentPlayer;
    const moveRes = LudoEngine.applyMove(state, tokenIndex);

    if (LudoAudio && moveRes.moveResult) {
      LudoAudio.playMove(movingPlayer, moveRes.moveResult);
    }

    render();
    announce(moveRes.message, 'assertive', true);

    if (moveRes.gameOver) {
      if (LudoAudio) LudoAudio.playWin();
      announce('Game Over! ' + (moveRes.winner ? moveRes.winner.name : '') + ' wins the game!', 'assertive', true);
    } else if (moveRes.bonusTurn) {
      // Human earned a bonus roll: focus roll button again
      setTimeout(function () {
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) rollBtn.focus();
      }, 50);
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

    // 13. Arrow Keys Navigation in Board Explorer when list is focused or active
    if (document.activeElement && (document.activeElement.id === 'explorer-list' || document.activeElement.classList.contains('explorer-item'))) {
      if (code === 'ArrowDown' || code === 'ArrowUp' || code === 'ArrowRight' || code === 'ArrowLeft' || code === 'Home' || code === 'End') {
        e.preventDefault();
        handleExplorerArrowKey(code);
        return;
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
  }

  /**
   * Renders the Turn & Action Center
   */
  function renderTurnCenter() {
    const player = state.players[state.currentPlayer];
    if (!player) return;

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
      playerBadge.textContent = `${player.name} (${player.type === 'human' ? 'Human' : 'AI'})`;
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
        if (player.type === 'human') {
          announcementEl.innerHTML = `<strong>Your Turn (${player.name}):</strong> Press <kbd>Space</kbd> or <kbd>R</kbd> or click below to roll the dice.`;
        } else {
          announcementEl.textContent = `${player.name} (AI) is taking its turn...`;
        }
      } else if (state.phase === 'MOVE') {
        if (player.type === 'human') {
          announcementEl.innerHTML = `<strong>Rolled a ${state.lastRoll}:</strong> Choose a token to move using keys <kbd>1</kbd>–<kbd>4</kbd> or click an available move below.`;
        } else {
          announcementEl.textContent = `${player.name} (AI) rolled a ${state.lastRoll} and is selecting a move...`;
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
      const canRoll = !state.gameOver && state.phase === 'ROLL' && player.type === 'human';
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
        movesPrompt.innerHTML = player.type === 'human'
          ? `Select a move with keys <kbd>1</kbd>–<kbd>4</kbd> or click below:`
          : `${player.name} (AI) is deciding...`;

        moves.forEach(function (m) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'move-btn';
          btn.dataset.tokenIndex = String(m.tokenIndex);
          btn.disabled = player.type !== 'human';

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
   * Initializes the 15x15 Visual Grid DOM structure (once)
   */
  function initVisualBoardGrid() {
    if (typeof document === 'undefined') return;
    const grid = document.getElementById('visual-board');
    if (!grid) return;

    grid.innerHTML = '';
    const cells = [];

    // 15 rows x 15 columns = 225 cells
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        // Determine static classification
        // Red Yard: rows 0..5, cols 0..5
        if (r <= 5 && c <= 5) {
          cell.classList.add('yard-red');
          if ((r === 1 || r === 4) && (c === 1 || c === 4)) {
            cell.innerHTML = '<div class="yard-nest"></div>';
          }
        }
        // Green Yard: rows 0..5, cols 9..14
        else if (r <= 5 && c >= 9) {
          cell.classList.add('yard-green');
          if ((r === 1 || r === 4) && (c === 10 || c === 13)) {
            cell.innerHTML = '<div class="yard-nest"></div>';
          }
        }
        // Yellow Yard: rows 9..14, cols 9..14
        else if (r >= 9 && c >= 9) {
          cell.classList.add('yard-yellow');
          if ((r === 10 || r === 13) && (c === 10 || c === 13)) {
            cell.innerHTML = '<div class="yard-nest"></div>';
          }
        }
        // Blue Yard: rows 9..14, cols 0..5
        else if (r >= 9 && c <= 5) {
          cell.classList.add('yard-blue');
          if ((r === 10 || r === 13) && (c === 1 || c === 4)) {
            cell.innerHTML = '<div class="yard-nest"></div>';
          }
        }
        // Center Goal 3x3: rows 6..8, cols 6..8
        else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
          cell.classList.add('goal-cell');
          if (r === 7 && c === 6) cell.classList.add('goal-red');
          if (r === 6 && c === 7) cell.classList.add('goal-green');
          if (r === 7 && c === 8) cell.classList.add('goal-yellow');
          if (r === 8 && c === 7) cell.classList.add('goal-blue');
        }
        // Home stretches
        else if (r === 7 && c >= 1 && c <= 5) {
          cell.classList.add('stretch-red');
        } else if (c === 7 && r >= 1 && r <= 5) {
          cell.classList.add('stretch-green');
        } else if (r === 7 && c >= 9 && c <= 13) {
          cell.classList.add('stretch-yellow');
        } else if (c === 7 && r >= 9 && r <= 13) {
          cell.classList.add('stretch-blue');
        }
        // Main Track
        else {
          cell.classList.add('track-cell');
        }

        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    // Mark Safe and Start Squares on the track cells
    if (LudoEngine) {
      LudoEngine.SAFE_INDICES.forEach(function (safeTrackIdx) {
        const coord = LudoEngine.TRACK_COORDS[safeTrackIdx];
        if (coord) {
          const el = grid.querySelector(`[data-row="${coord.row}"][data-col="${coord.col}"]`);
          if (el) el.classList.add('safe-square');
        }
      });

      const startClasses = ['start-red', 'start-green', 'start-yellow', 'start-blue'];
      LudoEngine.START_INDICES.forEach(function (startTrackIdx, pIdx) {
        const coord = LudoEngine.TRACK_COORDS[startTrackIdx];
        if (coord) {
          const el = grid.querySelector(`[data-row="${coord.row}"][data-col="${coord.col}"]`);
          if (el) el.classList.add(startClasses[pIdx]);
        }
      });
    }
  }

  /**
   * Updates visual tokens on the 15x15 board grid
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
  }

  /**
   * Initializes the Application on DOMContentLoaded
   */
  function initApp() {
    initVisualBoardGrid();
    bindEvents();
    initGame();
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
    announce,
    readRecentLog,
    toggleMute,
    toggleSelfVoicing,
    toggleTheme,
    getState: function () { return state; },
    getConfig: function () { return config; }
  };
});
