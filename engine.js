/**
 * Ludo Game Engine
 * Pure JavaScript Ludo game state machine, board geometry, move validation,
 * capture/safe rules, threat analysis, AI decision engine, and screen-reader helpers.
 *
 * Exported as:
 * - window.LudoEngine (in browser)
 * - module.exports (in Node.js)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LudoEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Constants
  const COLORS = ['Red', 'Green', 'Yellow', 'Blue'];
  const START_INDICES = [0, 13, 26, 39]; // Track indices where players enter
  const SAFE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47]; // 4 start squares + 4 star squares

  // 15x15 Visual Grid Coordinates (row: 0..14, col: 0..14)
  // Track has 52 squares running clockwise around the board.
  const TRACK_COORDS = [
    { row: 6, col: 1 },  // 0: Red Start (Safe)
    { row: 6, col: 2 },  // 1
    { row: 6, col: 3 },  // 2
    { row: 6, col: 4 },  // 3
    { row: 6, col: 5 },  // 4
    { row: 5, col: 6 },  // 5
    { row: 4, col: 6 },  // 6
    { row: 3, col: 6 },  // 7
    { row: 2, col: 6 },  // 8: Star (Safe)
    { row: 1, col: 6 },  // 9
    { row: 0, col: 6 },  // 10
    { row: 0, col: 7 },  // 11
    { row: 0, col: 8 },  // 12
    { row: 1, col: 8 },  // 13: Green Start (Safe)
    { row: 2, col: 8 },  // 14
    { row: 3, col: 8 },  // 15
    { row: 4, col: 8 },  // 16
    { row: 5, col: 8 },  // 17
    { row: 6, col: 9 },  // 18
    { row: 6, col: 10 }, // 19
    { row: 6, col: 11 }, // 20
    { row: 6, col: 12 }, // 21: Star (Safe)
    { row: 6, col: 13 }, // 22
    { row: 6, col: 14 }, // 23
    { row: 7, col: 14 }, // 24
    { row: 8, col: 14 }, // 25
    { row: 8, col: 13 }, // 26: Yellow Start (Safe)
    { row: 8, col: 12 }, // 27
    { row: 8, col: 11 }, // 28
    { row: 8, col: 10 }, // 29
    { row: 8, col: 9 },  // 30
    { row: 9, col: 8 },  // 31
    { row: 10, col: 8 }, // 32
    { row: 11, col: 8 }, // 33
    { row: 12, col: 8 }, // 34: Star (Safe)
    { row: 13, col: 8 }, // 35
    { row: 14, col: 8 }, // 36
    { row: 14, col: 7 }, // 37
    { row: 14, col: 6 }, // 38
    { row: 13, col: 6 }, // 39: Blue Start (Safe)
    { row: 12, col: 6 }, // 40
    { row: 11, col: 6 }, // 41
    { row: 10, col: 6 }, // 42
    { row: 9, col: 6 },  // 43
    { row: 8, col: 5 },  // 44
    { row: 8, col: 4 },  // 45
    { row: 8, col: 3 },  // 46
    { row: 8, col: 2 },  // 47: Star (Safe)
    { row: 8, col: 1 },  // 48
    { row: 8, col: 0 },  // 49
    { row: 7, col: 0 },  // 50
    { row: 6, col: 0 }   // 51
  ];

  // Home Stretch coordinates (5 steps for each color)
  const HOME_STRETCH_COORDS = [
    // Red (Player 0): heading right on row 7
    [
      { row: 7, col: 1 },
      { row: 7, col: 2 },
      { row: 7, col: 3 },
      { row: 7, col: 4 },
      { row: 7, col: 5 }
    ],
    // Green (Player 1): heading down on col 7
    [
      { row: 1, col: 7 },
      { row: 2, col: 7 },
      { row: 3, col: 7 },
      { row: 4, col: 7 },
      { row: 5, col: 7 }
    ],
    // Yellow (Player 2): heading left on row 7
    [
      { row: 7, col: 13 },
      { row: 7, col: 12 },
      { row: 7, col: 11 },
      { row: 7, col: 10 },
      { row: 7, col: 9 }
    ],
    // Blue (Player 3): heading up on col 7
    [
      { row: 13, col: 7 },
      { row: 12, col: 7 },
      { row: 11, col: 7 },
      { row: 10, col: 7 },
      { row: 9, col: 7 }
    ]
  ];

  // Home Goal coordinates (Center quadrant: rows 6..8, cols 6..8)
  const HOME_GOAL_COORDS = [
    { row: 7, col: 6 }, // Red
    { row: 6, col: 7 }, // Green
    { row: 7, col: 8 }, // Yellow
    { row: 8, col: 7 }  // Blue
  ];

  // Yard coordinates for each player's 4 tokens
  const YARD_TOKEN_COORDS = [
    // Red (Top-Left, rows 0..5, cols 0..5)
    [
      { row: 1, col: 1 },
      { row: 1, col: 4 },
      { row: 4, col: 1 },
      { row: 4, col: 4 }
    ],
    // Green (Top-Right, rows 0..5, cols 9..14)
    [
      { row: 1, col: 10 },
      { row: 1, col: 13 },
      { row: 4, col: 10 },
      { row: 4, col: 13 }
    ],
    // Yellow (Bottom-Right, rows 9..14, cols 9..14)
    [
      { row: 10, col: 10 },
      { row: 10, col: 13 },
      { row: 13, col: 10 },
      { row: 13, col: 13 }
    ],
    // Blue (Bottom-Left, rows 9..14, cols 0..5)
    [
      { row: 10, col: 1 },
      { row: 10, col: 4 },
      { row: 13, col: 1 },
      { row: 13, col: 4 }
    ]
  ];

  /**
   * Returns whether a track square index (0..51) is a designated safe square.
   */
  function isSafeSquare(absIndex) {
    return SAFE_INDICES.indexOf(absIndex) !== -1;
  }

  /**
   * Converts a player's relative step into absolute main track index (0..51).
   * Returns null if token is in Yard (-1) or Home Stretch/Goal (>= 51).
   */
  function getAbsoluteTrackIndex(playerIndex, relativeStep) {
    if (relativeStep < 0 || relativeStep > 50) return null;
    return (START_INDICES[playerIndex] + relativeStep) % 52;
  }

  /**
   * Formats track square number and properties for screen-reader friendly display.
   */
  function formatTrackDesc(absIndex) {
    const trackNum = absIndex + 1;
    if (absIndex === 0) return `Track ${trackNum} (Red Start, Safe)`;
    if (absIndex === 13) return `Track ${trackNum} (Green Start, Safe)`;
    if (absIndex === 26) return `Track ${trackNum} (Yellow Start, Safe)`;
    if (absIndex === 39) return `Track ${trackNum} (Blue Start, Safe)`;
    if (absIndex === 8 || absIndex === 21 || absIndex === 34 || absIndex === 47) {
      return `Track ${trackNum} (Safe Star)`;
    }
    return `Track ${trackNum}`;
  }

  /**
   * Determines active threats from opponents against a given track square.
   */
  function getThreatsForSquare(state, playerIndex, targetAbsIndex, ignoredTokens) {
    if (targetAbsIndex === null || isSafeSquare(targetAbsIndex)) return [];

    const threats = [];
    const ignoredList = ignoredTokens || [];

    for (let oppIdx = 0; oppIdx < 4; oppIdx++) {
      if (oppIdx === playerIndex) continue;
      const opp = state.players[oppIdx];
      if (!opp || opp.type === 'none' || opp.hasWon) continue;

      for (let tIdx = 0; tIdx < 4; tIdx++) {
        // Skip ignored tokens (e.g. captured during current move)
        const isIgnored = ignoredList.some(
          it => it.playerIndex === oppIdx && it.tokenIndex === tIdx
        );
        if (isIgnored) continue;

        const oppStep = opp.tokens[tIdx];
        if (oppStep >= 0 && oppStep <= 50) {
          const oppAbs = getAbsoluteTrackIndex(oppIdx, oppStep);
          const dist = (targetAbsIndex - oppAbs + 52) % 52;

          // Opponents can only hit with a single dice roll 1..6
          // and must not overshoot their own home entrance (oppStep + dist <= 50)
          if (dist >= 1 && dist <= 6 && oppStep + dist <= 50) {
            threats.push(
              `${COLORS[oppIdx]} Token ${tIdx + 1} (${dist} step${dist > 1 ? 's' : ''} away)`
            );
          }
        }
      }
    }
    return threats;
  }

  /**
   * Creates a new initial game state.
   */
  function createGame(playerConfigs) {
    const defaultConfigs = [
      { name: 'Red', type: 'human' },
      { name: 'Green', type: 'ai' },
      { name: 'Yellow', type: 'ai' },
      { name: 'Blue', type: 'ai' }
    ];

    const configs = playerConfigs && playerConfigs.length ? playerConfigs : defaultConfigs;

    const players = [];
    for (let i = 0; i < 4; i++) {
      const cfg = configs[i] || defaultConfigs[i];
      players.push({
        index: i,
        color: COLORS[i],
        name: cfg.name || COLORS[i],
        type: cfg.type || (i === 0 ? 'human' : 'ai'),
        tokens: [-1, -1, -1, -1], // -1: Yard
        hasWon: false,
        rank: null
      });
    }

    // Determine first active player
    let firstPlayer = 0;
    while (firstPlayer < 4 && players[firstPlayer].type === 'none') {
      firstPlayer++;
    }
    if (firstPlayer >= 4) firstPlayer = 0;

    return {
      players,
      currentPlayer: firstPlayer,
      phase: 'ROLL', // 'ROLL' | 'MOVE' | 'GAME_OVER'
      lastRoll: null,
      consecutiveSixes: 0,
      validMoves: [],
      winners: [],
      gameOver: false,
      turnCount: 1
    };
  }

  /**
   * Check if game over condition is met.
   */
  function checkGameOver(state) {
    const activePlayers = state.players.filter(p => p.type !== 'none');
    const unfinished = activePlayers.filter(p => !p.hasWon);

    if (activePlayers.length <= 1) {
      return unfinished.length === 0;
    }

    // When only 1 unfinished player remains out of 2+ active players
    return unfinished.length <= 1;
  }

  /**
   * Advances the turn to the next active, unfinished player.
   */
  function advanceTurn(state) {
    state.consecutiveSixes = 0;
    state.validMoves = [];

    if (checkGameOver(state)) {
      state.gameOver = true;
      state.phase = 'GAME_OVER';

      // Assign remaining rank to last unfinished player if applicable
      const remaining = state.players.filter(p => p.type !== 'none' && !p.hasWon);
      if (remaining.length === 1) {
        remaining[0].rank = state.winners.length + 1;
        state.winners.push(remaining[0].index);
      }
      return;
    }

    let next = (state.currentPlayer + 1) % 4;
    let attempts = 0;
    while (attempts < 4) {
      const p = state.players[next];
      if (p.type !== 'none' && !p.hasWon) {
        state.currentPlayer = next;
        state.phase = 'ROLL';
        state.turnCount = (state.turnCount || 0) + 1;
        return;
      }
      next = (next + 1) % 4;
      attempts++;
    }

    state.gameOver = true;
    state.phase = 'GAME_OVER';
  }

  /**
   * Calculates all legal moves for a given player and dice roll.
   */
  function getValidMoves(state, playerIndex, diceValue) {
    const player = state.players[playerIndex];
    if (!player || player.hasWon || player.type === 'none') return [];

    const moves = [];

    for (let tIdx = 0; tIdx < 4; tIdx++) {
      const fromStep = player.tokens[tIdx];

      // In Home Goal: cannot move further
      if (fromStep === 56) continue;

      // In Yard: requires rolling 6 to enter track
      if (fromStep === -1) {
        if (diceValue === 6) {
          const toStep = 0;
          const toAbs = START_INDICES[playerIndex];
          const fromDesc = 'Yard';
          const toDesc = formatTrackDesc(toAbs);
          const isSafeDestination = true; // Start square is safe
          const threatsBefore = [];
          const threatsAfter = []; // Safe square has no threats

          const summary = `Token ${tIdx + 1}: Exit Yard to ${toDesc}. Safe square.`;

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: true,
            isCapture: false,
            capturedTokens: [],
            isSafeDestination,
            isHomeEntry: false,
            isHomeStretch: false,
            threatsBefore,
            threatsAfter,
            summary
          });
        }
        continue;
      }

      // On Main Track: fromStep 0..50
      if (fromStep >= 0 && fromStep <= 50) {
        const toStep = fromStep + diceValue;

        // Overshooting Home Goal (56) is illegal
        if (toStep > 56) continue;

        const fromAbs = getAbsoluteTrackIndex(playerIndex, fromStep);
        const fromDesc = formatTrackDesc(fromAbs);
        const threatsBefore = getThreatsForSquare(state, playerIndex, fromAbs);

        // Stays on main track
        if (toStep <= 50) {
          const toAbs = getAbsoluteTrackIndex(playerIndex, toStep);
          const toDesc = formatTrackDesc(toAbs);
          const isSafeDestination = isSafeSquare(toAbs);

          // Check for captures on non-safe square
          const capturedTokens = [];
          if (!isSafeDestination) {
            for (let oppIdx = 0; oppIdx < 4; oppIdx++) {
              if (oppIdx === playerIndex) continue;
              const opp = state.players[oppIdx];
              if (!opp || opp.type === 'none' || opp.hasWon) continue;

              for (let oTokIdx = 0; oTokIdx < 4; oTokIdx++) {
                const oppStep = opp.tokens[oTokIdx];
                if (oppStep >= 0 && oppStep <= 50) {
                  const oppAbs = getAbsoluteTrackIndex(oppIdx, oppStep);
                  if (oppAbs === toAbs) {
                    capturedTokens.push({
                      playerIndex: oppIdx,
                      tokenIndex: oTokIdx,
                      color: COLORS[oppIdx]
                    });
                  }
                }
              }
            }
          }

          const isCapture = capturedTokens.length > 0;
          const threatsAfter = isSafeDestination
            ? []
            : getThreatsForSquare(state, playerIndex, toAbs, capturedTokens);

          // Compose screen-reader friendly summary
          let summary = `Token ${tIdx + 1}: Move ${diceValue} steps from ${fromDesc} to ${toDesc}.`;
          if (isCapture) {
            const capStr = capturedTokens
              .map(c => `${c.color} Token ${c.tokenIndex + 1}`)
              .join(', ');
            summary += ` Captures ${capStr}! Awards bonus roll.`;
          }
          if (isSafeDestination) {
            summary += ` Safe square.`;
          }
          if (threatsBefore.length > 0 && threatsAfter.length === 0) {
            summary += ` Escapes threat.`;
          }
          if (threatsAfter.length > 0) {
            summary += ` Warning: Threatened by ${threatsAfter.join(', ')}.`;
          }

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: false,
            isCapture,
            capturedTokens,
            isSafeDestination,
            isHomeEntry: false,
            isHomeStretch: false,
            threatsBefore,
            threatsAfter,
            summary
          });
        }
        // Enters Home Stretch (51..55)
        else if (toStep >= 51 && toStep <= 55) {
          const stretchSquare = toStep - 50;
          const toDesc = `${COLORS[playerIndex]} Home Stretch ${stretchSquare}`;
          const threatsAfter = []; // Home stretch is private and safe

          let summary = `Token ${tIdx + 1}: Enter Home Stretch to square ${stretchSquare} from ${fromDesc}. Safe.`;
          if (threatsBefore.length > 0) {
            summary += ` Escapes threat.`;
          }

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: false,
            isCapture: false,
            capturedTokens: [],
            isSafeDestination: true,
            isHomeEntry: true,
            isHomeStretch: true,
            threatsBefore,
            threatsAfter,
            summary
          });
        }
        // Exactly reaches Home Goal (56)
        else if (toStep === 56) {
          const toDesc = 'Home Goal';
          const threatsAfter = [];

          const summary = `Token ${tIdx + 1}: Move from ${fromDesc} to Home Goal! Finished! Awards bonus roll.`;

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: false,
            isCapture: false,
            capturedTokens: [],
            isSafeDestination: true,
            isHomeEntry: true,
            isHomeStretch: true,
            threatsBefore,
            threatsAfter,
            summary
          });
        }
        continue;
      }

      // In Home Stretch: fromStep 51..55
      if (fromStep >= 51 && fromStep <= 55) {
        const toStep = fromStep + diceValue;
        if (toStep > 56) continue; // Overshoot not allowed

        const fromStretchSquare = fromStep - 50;
        const fromDesc = `${COLORS[playerIndex]} Home Stretch ${fromStretchSquare}`;

        if (toStep === 56) {
          const toDesc = 'Home Goal';
          const summary = `Token ${tIdx + 1}: Move from Home Stretch ${fromStretchSquare} to Home Goal! Finished! Awards bonus roll.`;

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: false,
            isCapture: false,
            capturedTokens: [],
            isSafeDestination: true,
            isHomeEntry: true,
            isHomeStretch: true,
            threatsBefore: [],
            threatsAfter: [],
            summary
          });
        } else {
          const toStretchSquare = toStep - 50;
          const toDesc = `${COLORS[playerIndex]} Home Stretch ${toStretchSquare}`;
          const summary = `Token ${tIdx + 1}: Advance in Home Stretch from square ${fromStretchSquare} to ${toStretchSquare}. Safe.`;

          moves.push({
            tokenIndex: tIdx,
            fromStep,
            toStep,
            fromDesc,
            toDesc,
            isExitYard: false,
            isCapture: false,
            capturedTokens: [],
            isSafeDestination: true,
            isHomeEntry: false,
            isHomeStretch: true,
            threatsBefore: [],
            threatsAfter: [],
            summary
          });
        }
      }
    }

    return moves;
  }

  /**
   * Rolls the dice for the current player.
   */
  function rollDice(state, forcedValue) {
    if (state.phase !== 'ROLL' || state.gameOver) {
      return {
        state,
        roll: state.lastRoll,
        validMoves: state.validMoves || [],
        tripleSix: false,
        autoPassed: false,
        message: 'Not in roll phase.'
      };
    }

    const roll =
      typeof forcedValue === 'number' && forcedValue >= 1 && forcedValue <= 6
        ? forcedValue
        : Math.floor(Math.random() * 6) + 1;

    state.lastRoll = roll;
    const player = state.players[state.currentPlayer];

    // Handle consecutive 6s
    if (roll === 6) {
      state.consecutiveSixes = (state.consecutiveSixes || 0) + 1;
      if (state.consecutiveSixes === 3) {
        state.consecutiveSixes = 0;
        state.validMoves = [];
        const message = `${player.name} rolled a third consecutive 6! Turn forfeited.`;
        advanceTurn(state);
        return {
          state,
          roll: 6,
          validMoves: [],
          tripleSix: true,
          autoPassed: false,
          message
        };
      }
    } else {
      state.consecutiveSixes = 0;
    }

    const validMoves = getValidMoves(state, state.currentPlayer, roll);

    if (validMoves.length === 0) {
      const message = `${player.name} rolled a ${roll}, but has no valid moves. Turn passes to next player.`;
      state.validMoves = [];
      advanceTurn(state);
      return {
        state,
        roll,
        validMoves: [],
        tripleSix: false,
        autoPassed: true,
        message
      };
    }

    state.phase = 'MOVE';
    state.validMoves = validMoves;
    const message = `${player.name} rolled a ${roll}. Choose a token to move (${validMoves.length} available).`;

    return {
      state,
      roll,
      validMoves,
      tripleSix: false,
      autoPassed: false,
      message
    };
  }

  /**
   * Applies the chosen move by tokenIndex for the current player.
   */
  function applyMove(state, tokenIndex) {
    if (state.phase !== 'MOVE' || state.gameOver) {
      return {
        state,
        moveResult: null,
        bonusTurn: false,
        gameOver: state.gameOver,
        winner: state.winners.length ? state.players[state.winners[0]] : null,
        message: 'Not in move phase.'
      };
    }

    const move = (state.validMoves || []).find(m => m.tokenIndex === tokenIndex);
    if (!move) {
      return {
        state,
        moveResult: null,
        bonusTurn: false,
        gameOver: state.gameOver,
        winner: state.winners.length ? state.players[state.winners[0]] : null,
        message: 'Invalid move selection.'
      };
    }

    const player = state.players[state.currentPlayer];
    player.tokens[tokenIndex] = move.toStep;

    // Apply captures
    if (move.isCapture && move.capturedTokens && move.capturedTokens.length) {
      for (let i = 0; i < move.capturedTokens.length; i++) {
        const cap = move.capturedTokens[i];
        state.players[cap.playerIndex].tokens[cap.tokenIndex] = -1; // Sent back to Yard
      }
    }

    // Check if player just finished all 4 tokens
    let justWon = false;
    const allHome = player.tokens.every(s => s === 56);
    if (allHome && !player.hasWon) {
      player.hasWon = true;
      justWon = true;
      state.winners.push(player.index);
      player.rank = state.winners.length;
    }

    // Check game over
    const isOver = checkGameOver(state);
    if (isOver) {
      state.gameOver = true;
      state.phase = 'GAME_OVER';
      const remaining = state.players.filter(p => p.type !== 'none' && !p.hasWon);
      if (remaining.length === 1) {
        remaining[0].rank = state.winners.length + 1;
        state.winners.push(remaining[0].index);
      }
    }

    // Determine bonus roll
    // Bonus roll awarded if: rolled 6, made a capture, or reached Home Goal (56)
    let bonusTurn = false;
    if (!state.gameOver && !player.hasWon) {
      const earnedBonus = state.lastRoll === 6 || move.isCapture || move.toStep === 56;
      if (earnedBonus) {
        bonusTurn = true;
        state.phase = 'ROLL';
        state.validMoves = [];
      } else {
        advanceTurn(state);
      }
    } else if (!state.gameOver) {
      advanceTurn(state);
    }

    let message = `${player.name} moved Token ${tokenIndex + 1} to ${move.toDesc}.`;
    if (move.isCapture) {
      const capNames = move.capturedTokens
        .map(c => `${c.color} Token ${c.tokenIndex + 1}`)
        .join(', ');
      message += ` Captured ${capNames}!`;
    }
    if (move.toStep === 56) {
      message += ` Token reached Home Goal!`;
    }
    if (justWon) {
      message += ` ${player.name} has finished all 4 tokens!`;
    }
    if (state.gameOver) {
      const winnerName = state.players[state.winners[0]].name;
      message += ` Game over! ${winnerName} wins!`;
    } else if (bonusTurn) {
      message += ` Bonus roll awarded!`;
    }

    return {
      state,
      moveResult: move,
      bonusTurn,
      gameOver: state.gameOver,
      winner: state.winners.length ? state.players[state.winners[0]] : null,
      justWon,
      message
    };
  }

  /**
   * AI move selection heuristic:
   * capture > reach home > exit yard > land on safe square > escape threat > advance furthest token.
   */
  function chooseAIMove(state) {
    const validMoves = state.validMoves || [];
    if (!validMoves.length) return null;
    if (validMoves.length === 1) return validMoves[0].tokenIndex;

    let bestMove = validMoves[0];
    let highestScore = -Infinity;

    for (let i = 0; i < validMoves.length; i++) {
      const m = validMoves[i];
      let score = 0;

      // 1. Capture: top priority (+10000 per token)
      if (m.isCapture && m.capturedTokens && m.capturedTokens.length) {
        score += 10000 * m.capturedTokens.length;
      }

      // 2. Reach Home Goal (step 56): (+8000)
      if (m.toStep === 56) {
        score += 8000;
      }

      // 3. Exit Yard: (+6000)
      if (m.isExitYard) {
        score += 6000;
      }

      // 4. Land on Safe Square: (+4000)
      if (m.isSafeDestination && !m.isExitYard) {
        score += 4000;
      }

      // 5. Escape Threat: (+3000)
      if (m.threatsBefore && m.threatsBefore.length > 0 && (!m.threatsAfter || m.threatsAfter.length === 0)) {
        score += 3000;
      }

      // 6. Enter Home Stretch: (+2500)
      if (m.isHomeEntry || m.isHomeStretch) {
        score += 2500;
      }

      // Penalty for moving into threats: (-1500 per threat)
      if (m.threatsAfter && m.threatsAfter.length > 0) {
        score -= 1500 * m.threatsAfter.length;
      }

      // Base progression score: favor advancing token further towards home (+10 per step)
      score += m.toStep * 10;

      if (score > highestScore) {
        highestScore = score;
        bestMove = m;
      }
    }

    return bestMove.tokenIndex;
  }

  /**
   * Screen-reader text helper for an individual token.
   */
  function getTokenStatusText(state, playerIndex, tokenIndex) {
    const player = state.players[playerIndex];
    if (!player) return '';
    const step = player.tokens[tokenIndex];

    if (step === -1) {
      return `${player.color} Token ${tokenIndex + 1} is in the Yard. Needs a roll of 6 to enter the track.`;
    }

    if (step >= 0 && step <= 50) {
      const abs = getAbsoluteTrackIndex(playerIndex, step);
      const desc = formatTrackDesc(abs);
      const stepsToHome = 56 - step;
      if (isSafeSquare(abs)) {
        return `${player.color} Token ${tokenIndex + 1} is on ${desc}. ${stepsToHome} steps to Home Goal. Protected on a safe square.`;
      }
      const threats = getThreatsForSquare(state, playerIndex, abs);
      const threatText =
        threats.length > 0
          ? `Warning: Threatened by ${threats.join(', ')}.`
          : 'Safe from immediate threats.';
      return `${player.color} Token ${tokenIndex + 1} is on ${desc}. ${stepsToHome} steps to Home Goal. ${threatText}`;
    }

    if (step >= 51 && step <= 55) {
      const stretchNum = step - 50;
      const stepsToHome = 56 - step;
      return `${player.color} Token ${tokenIndex + 1} is in ${player.color} Home Stretch square ${stretchNum}. Needs an exact roll of ${stepsToHome} to reach Home Goal. Safe from opponents.`;
    }

    if (step === 56) {
      return `${player.color} Token ${tokenIndex + 1} is in Home Goal! Finished.`;
    }

    return '';
  }

  /**
   * Screen-reader summary for a player's all 4 tokens.
   */
  function getPlayerSummaryText(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player || player.type === 'none') return '';

    const yardCount = player.tokens.filter(s => s === -1).length;
    const homeCount = player.tokens.filter(s => s === 56).length;
    const stretchCount = player.tokens.filter(s => s >= 51 && s <= 55).length;
    const trackTokens = [];

    for (let i = 0; i < 4; i++) {
      const s = player.tokens[i];
      if (s >= 0 && s <= 50) {
        const abs = getAbsoluteTrackIndex(playerIndex, s);
        trackTokens.push(`Token ${i + 1} on ${formatTrackDesc(abs)}`);
      }
    }

    let status = `${player.name} (${player.color})`;
    if (player.hasWon) {
      return `${status}: Finished all 4 tokens (Rank #${player.rank})!`;
    }

    const parts = [];
    if (homeCount > 0) parts.push(`${homeCount} in Home Goal`);
    if (stretchCount > 0) parts.push(`${stretchCount} in Home Stretch`);
    if (trackTokens.length > 0) parts.push(`${trackTokens.join(', ')}`);
    if (yardCount > 0) parts.push(`${yardCount} in Yard`);

    return `${status}: ${parts.join('; ')}.`;
  }

  /**
   * Screen-reader summary of all active opponents.
   */
  function getAllOpponentsSummaryText(state, currentPlayerIndex) {
    const oppTexts = [];
    for (let i = 0; i < 4; i++) {
      if (i === currentPlayerIndex) continue;
      const opp = state.players[i];
      if (opp && opp.type !== 'none') {
        oppTexts.push(getPlayerSummaryText(state, i));
      }
    }
    if (!oppTexts.length) return 'No active opponents.';
    return oppTexts.join('\n');
  }

  /**
   * Overall game status summary for screen-readers.
   */
  function getGameStatusText(state) {
    if (state.gameOver) {
      const winnerName = state.winners.length ? state.players[state.winners[0]].name : 'None';
      const ranks = state.winners
        .map((pIdx, i) => `#${i + 1} ${state.players[pIdx].name}`)
        .join(', ');
      return `Game Over! Winner: ${winnerName}. Final standings: ${ranks}.`;
    }

    const current = state.players[state.currentPlayer];
    let summary = `Turn ${state.turnCount || 1}: ${current.name} (${current.color})'s turn. `;
    if (state.phase === 'ROLL') {
      summary += `Waiting to roll dice. `;
    } else if (state.phase === 'MOVE') {
      summary += `Rolled ${state.lastRoll}. Choose from ${state.validMoves.length} available moves. `;
    }

    const standings = state.players
      .filter(p => p.type !== 'none')
      .map(p => {
        const homeCount = p.tokens.filter(s => s === 56).length;
        return `${p.name}: ${homeCount}/4 home`;
      })
      .join(', ');

    summary += `Tokens home: ${standings}.`;
    return summary;
  }

  /**
   * Coordinates helper for any token.
   * Defensively accepts both:
   * - getTokenCoords(state, playerIndex, tokenIndex)
   * - getTokenCoords(playerIndex, tokenIndex, step)
   */
  function getTokenCoords(stateOrPlayerIndex, playerIndexOrTokenIndex, tokenIndexOrStep) {
    let playerIndex, tokenIndex, step;

    if (typeof stateOrPlayerIndex === 'number') {
      playerIndex = stateOrPlayerIndex;
      tokenIndex = playerIndexOrTokenIndex;
      step = tokenIndexOrStep;
    } else if (stateOrPlayerIndex && stateOrPlayerIndex.players) {
      playerIndex = playerIndexOrTokenIndex;
      tokenIndex = tokenIndexOrStep;
      const player = stateOrPlayerIndex.players[playerIndex];
      step = player ? player.tokens[tokenIndex] : -1;
    } else {
      return { row: 0, col: 0 };
    }

    if (playerIndex < 0 || playerIndex > 3 || tokenIndex < 0 || tokenIndex > 3) {
      return { row: 0, col: 0 };
    }

    if (step === -1) {
      return (YARD_TOKEN_COORDS[playerIndex] && YARD_TOKEN_COORDS[playerIndex][tokenIndex]) || { row: 0, col: 0 };
    }
    if (step >= 0 && step <= 50) {
      const abs = getAbsoluteTrackIndex(playerIndex, step);
      return TRACK_COORDS[abs] || { row: 0, col: 0 };
    }
    if (step >= 51 && step <= 55) {
      const stretchIdx = step - 51;
      return (HOME_STRETCH_COORDS[playerIndex] && HOME_STRETCH_COORDS[playerIndex][stretchIdx]) || { row: 0, col: 0 };
    }
    if (step === 56) {
      return HOME_GOAL_COORDS[playerIndex] || { row: 0, col: 0 };
    }
    return { row: 0, col: 0 };
  }

  /**
   * Coordinates helper for board squares.
   */
  function getSquareCoords(squareType, playerIndexOrTrackIndex, stepIndex) {
    if (squareType === 'track') {
      return TRACK_COORDS[playerIndexOrTrackIndex] || { row: 0, col: 0 };
    }
    if (squareType === 'yard') {
      return (
        (YARD_TOKEN_COORDS[playerIndexOrTrackIndex] &&
          YARD_TOKEN_COORDS[playerIndexOrTrackIndex][stepIndex || 0]) || { row: 0, col: 0 }
      );
    }
    if (squareType === 'homeStretch') {
      const sIdx = (stepIndex || 1) - 1;
      return (
        (HOME_STRETCH_COORDS[playerIndexOrTrackIndex] &&
          HOME_STRETCH_COORDS[playerIndexOrTrackIndex][sIdx]) || { row: 0, col: 0 }
      );
    }
    if (squareType === 'homeGoal') {
      return HOME_GOAL_COORDS[playerIndexOrTrackIndex] || { row: 0, col: 0 };
    }
    return { row: 0, col: 0 };
  }

  /**
   * Returns complete structured list of all board locations with metadata
   * for the keyboard-navigable Board Explorer.
   */
  function getBoardExplorerItems(state) {
    const items = [];

    // 1. Yards (4)
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const p = state.players[pIdx];
      const tokensInYard = [];
      if (p && p.type !== 'none') {
        for (let t = 0; t < 4; t++) {
          if (p.tokens[t] === -1) {
            tokensInYard.push({
              playerIndex: pIdx,
              tokenIndex: t,
              color: COLORS[pIdx],
              label: `${COLORS[pIdx]} Token ${t + 1}`
            });
          }
        }
      }
      items.push({
        id: `yard-${pIdx}`,
        type: 'yard',
        label: `${COLORS[pIdx]} Yard`,
        playerIndex: pIdx,
        tokens: tokensInYard,
        isOccupied: tokensInYard.length > 0,
        isSafe: true,
        coords: YARD_TOKEN_COORDS[pIdx][0]
      });
    }

    // 2. Track Squares (0..51)
    for (let trackIdx = 0; trackIdx < 52; trackIdx++) {
      const tokensOnTrack = [];
      for (let pIdx = 0; pIdx < 4; pIdx++) {
        const p = state.players[pIdx];
        if (!p || p.type === 'none') continue;

        for (let t = 0; t < 4; t++) {
          const step = p.tokens[t];
          if (step >= 0 && step <= 50) {
            const abs = getAbsoluteTrackIndex(pIdx, step);
            if (abs === trackIdx) {
              tokensOnTrack.push({
                playerIndex: pIdx,
                tokenIndex: t,
                color: COLORS[pIdx],
                label: `${COLORS[pIdx]} Token ${t + 1}`
              });
            }
          }
        }
      }

      items.push({
        id: `track-${trackIdx}`,
        type: 'track',
        trackIndex: trackIdx,
        label: formatTrackDesc(trackIdx),
        tokens: tokensOnTrack,
        isOccupied: tokensOnTrack.length > 0,
        isSafe: isSafeSquare(trackIdx),
        coords: TRACK_COORDS[trackIdx]
      });
    }

    // 3. Home Stretches (4 colors x 5 squares)
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const p = state.players[pIdx];
      for (let s = 1; s <= 5; s++) {
        const targetStep = 50 + s;
        const tokensInStretch = [];
        if (p && p.type !== 'none') {
          for (let t = 0; t < 4; t++) {
            if (p.tokens[t] === targetStep) {
              tokensInStretch.push({
                playerIndex: pIdx,
                tokenIndex: t,
                color: COLORS[pIdx],
                label: `${COLORS[pIdx]} Token ${t + 1}`
              });
            }
          }
        }

        items.push({
          id: `home-stretch-${pIdx}-${s}`,
          type: 'homeStretch',
          playerIndex: pIdx,
          stepIndex: s,
          label: `${COLORS[pIdx]} Home Stretch ${s}`,
          tokens: tokensInStretch,
          isOccupied: tokensInStretch.length > 0,
          isSafe: true,
          coords: HOME_STRETCH_COORDS[pIdx][s - 1]
        });
      }
    }

    // 4. Home Goals (4 colors)
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const p = state.players[pIdx];
      const tokensInHome = [];
      if (p && p.type !== 'none') {
        for (let t = 0; t < 4; t++) {
          if (p.tokens[t] === 56) {
            tokensInHome.push({
              playerIndex: pIdx,
              tokenIndex: t,
              color: COLORS[pIdx],
              label: `${COLORS[pIdx]} Token ${t + 1}`
            });
          }
        }
      }

      items.push({
        id: `home-goal-${pIdx}`,
        type: 'homeGoal',
        playerIndex: pIdx,
        label: `${COLORS[pIdx]} Home Goal`,
        tokens: tokensInHome,
        isOccupied: tokensInHome.length > 0,
        isSafe: true,
        coords: HOME_GOAL_COORDS[pIdx]
      });
    }

    return items;
  }

  return {
    COLORS,
    START_INDICES,
    SAFE_INDICES,
    TRACK_COORDS,
    HOME_STRETCH_COORDS,
    HOME_GOAL_COORDS,
    YARD_TOKEN_COORDS,
    isSafeSquare,
    getAbsoluteTrackIndex,
    formatTrackDesc,
    getThreatsForSquare,
    createGame,
    rollDice,
    getValidMoves,
    applyMove,
    chooseAIMove,
    getTokenStatusText,
    getPlayerSummaryText,
    getAllOpponentsSummaryText,
    getGameStatusText,
    getTokenCoords,
    getSquareCoords,
    getBoardExplorerItems
  };
});
