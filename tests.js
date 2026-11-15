/**
 * Comprehensive Test Suite for Ludo Engine
 * Runs via: node tests.js
 */

const assert = require('assert');
const Ludo = require('./engine.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

console.log('====================================================');
console.log('Running Ludo Engine Comprehensive Test Suite');
console.log('====================================================\n');

// 1. Constants & Exports
console.log('1. Constants & Exports:');
test('COLORS contains Red, Green, Yellow, Blue', () => {
  assert.deepStrictEqual(Ludo.COLORS, ['Red', 'Green', 'Yellow', 'Blue']);
});

test('START_INDICES contains [0, 13, 26, 39]', () => {
  assert.deepStrictEqual(Ludo.START_INDICES, [0, 13, 26, 39]);
});

test('SAFE_INDICES contains 8 safe squares', () => {
  assert.deepStrictEqual(Ludo.SAFE_INDICES, [0, 8, 13, 21, 26, 34, 39, 47]);
});

test('TRACK_COORDS has 52 entries with row/col 0..14', () => {
  assert.strictEqual(Ludo.TRACK_COORDS.length, 52);
  Ludo.TRACK_COORDS.forEach((c, idx) => {
    assert(c.row >= 0 && c.row <= 14, `Track ${idx} invalid row`);
    assert(c.col >= 0 && c.col <= 14, `Track ${idx} invalid col`);
  });
});

test('HOME_STRETCH_COORDS has 4 colors x 5 steps', () => {
  assert.strictEqual(Ludo.HOME_STRETCH_COORDS.length, 4);
  Ludo.HOME_STRETCH_COORDS.forEach((colorCoords, pIdx) => {
    assert.strictEqual(colorCoords.length, 5, `Player ${pIdx} stretch length`);
    colorCoords.forEach(c => {
      assert(c.row >= 0 && c.row <= 14);
      assert(c.col >= 0 && c.col <= 14);
    });
  });
});

test('YARD_TOKEN_COORDS has 4 colors x 4 tokens', () => {
  assert.strictEqual(Ludo.YARD_TOKEN_COORDS.length, 4);
  Ludo.YARD_TOKEN_COORDS.forEach((tokens, pIdx) => {
    assert.strictEqual(tokens.length, 4, `Player ${pIdx} yard token count`);
  });
});

// 2. Game Creation
console.log('\n2. Game Creation:');
test('createGame with defaults initializes 4 players', () => {
  const state = Ludo.createGame();
  assert.strictEqual(state.players.length, 4);
  assert.strictEqual(state.currentPlayer, 0);
  assert.strictEqual(state.phase, 'ROLL');
  assert.strictEqual(state.players[0].type, 'human');
  assert.strictEqual(state.players[1].type, 'ai');
  assert.deepStrictEqual(state.players[0].tokens, [-1, -1, -1, -1]);
});

test('createGame with custom configurations respects inactive players', () => {
  const configs = [
    { name: 'Alice', type: 'none' },
    { name: 'Bob', type: 'human' },
    { name: 'Charlie', type: 'none' },
    { name: 'Dave', type: 'ai' }
  ];
  const state = Ludo.createGame(configs);
  assert.strictEqual(state.currentPlayer, 1, 'First active player should be Bob (index 1)');
  assert.strictEqual(state.players[1].name, 'Bob');
});

// 3. Yard Exit on 6
console.log('\n3. Yard Exit on 6:');
test('Rolling 1-5 with all tokens in Yard yields no valid moves and auto-passes', () => {
  const state = Ludo.createGame();
  const res = Ludo.rollDice(state, 5);
  assert.strictEqual(res.autoPassed, true);
  assert.strictEqual(res.validMoves.length, 0);
  assert.strictEqual(state.currentPlayer, 1, 'Turn should advance to next player');
  assert.strictEqual(state.phase, 'ROLL');
});

test('Rolling 6 with tokens in Yard allows exit onto start track square', () => {
  const state = Ludo.createGame();
  const res = Ludo.rollDice(state, 6);
  assert.strictEqual(res.autoPassed, false);
  assert.strictEqual(res.validMoves.length, 4, 'All 4 yard tokens can exit');
  assert.strictEqual(res.validMoves[0].isExitYard, true);
  assert.strictEqual(res.validMoves[0].toStep, 0);
  assert.strictEqual(res.validMoves[0].isSafeDestination, true);
  assert.strictEqual(state.phase, 'MOVE');
});

test('Applying yard exit moves token to track index 0 and awards bonus roll', () => {
  const state = Ludo.createGame();
  Ludo.rollDice(state, 6);
  const moveRes = Ludo.applyMove(state, 0); // Move Token 1 (tokenIndex 0)
  assert.strictEqual(state.players[0].tokens[0], 0);
  assert.strictEqual(moveRes.bonusTurn, true, 'Rolling 6 awards bonus turn');
  assert.strictEqual(state.phase, 'ROLL');
  assert.strictEqual(state.currentPlayer, 0, 'Current player keeps turn for bonus roll');
});

// 4. Standard Movement & Turn Advancement
console.log('\n4. Standard Movement & Turn Advancement:');
test('Token moves forward on track and turn passes without bonus roll on 1-5', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 0; // Token 1 on track step 0
  Ludo.rollDice(state, 4);
  assert.strictEqual(state.validMoves.length, 1);
  assert.strictEqual(state.validMoves[0].toStep, 4);

  const moveRes = Ludo.applyMove(state, 0);
  assert.strictEqual(state.players[0].tokens[0], 4);
  assert.strictEqual(moveRes.bonusTurn, false);
  assert.strictEqual(state.currentPlayer, 1, 'Turn passes to next player');
  assert.strictEqual(state.phase, 'ROLL');
});

// 5. Track Wrap-around (52 squares)
console.log('\n5. Track Wrap-around:');
test('Track wraps around properly for all players', () => {
  // Blue starts at track 39. After 20 steps, track should be (39 + 20) % 52 = 7
  const blueAbs = Ludo.getAbsoluteTrackIndex(3, 20);
  assert.strictEqual(blueAbs, 7);

  // Yellow starts at track 26. After 30 steps: (26 + 30) % 52 = 4
  const yellowAbs = Ludo.getAbsoluteTrackIndex(2, 30);
  assert.strictEqual(yellowAbs, 4);
});

// 6. Safe Squares & Coexistence
console.log('\n6. Safe Squares & Coexistence:');
test('Tokens of different players coexist safely on safe star squares without capture', () => {
  const state = Ludo.createGame();
  // Safe star index 8:
  // Red start is 0, so Red step 8 is track 8.
  // Blue start is 39, so Blue at track 8 is relative step (8 - 39 + 52) % 52 = 21.
  state.players[1].tokens[0] = (8 - 13 + 52) % 52; // Green token at track 8
  state.players[0].tokens[0] = 5; // Red token at step 5

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  // Red rolls 3 to land on step 8 (track 8, safe star)
  const res = Ludo.rollDice(state, 3);
  const move = res.validMoves.find(m => m.tokenIndex === 0);
  assert(move, 'Move exists');
  assert.strictEqual(move.isCapture, false, 'No capture on safe star');
  assert.strictEqual(move.isSafeDestination, true);

  // Apply move
  Ludo.applyMove(state, 0);
  assert.strictEqual(state.players[0].tokens[0], 8);
  assert.strictEqual(state.players[1].tokens[0], (8 - 13 + 52) % 52, 'Green token NOT captured');
});

// 7. Captures Sending Opponents to Yard + Bonus Roll
console.log('\n7. Captures & Bonus Rolls:');
test('Landing on opponent on non-safe square captures them and awards bonus roll', () => {
  const state = Ludo.createGame();
  // Track 10 is NOT a safe square
  // Red step 6 is track 6. Green step: track 10 for Green is (10 - 13 + 52) % 52 = 49.
  state.players[0].tokens[0] = 6; // Red on Track 6 (relStep 6, absTrack 6)
  state.players[1].tokens[0] = 49; // Green on Track 10 (relStep 49, absTrack 10)

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  // Red rolls 4 to land on track 10
  const res = Ludo.rollDice(state, 4);
  const move = res.validMoves.find(m => m.tokenIndex === 0);
  assert(move, 'Move exists');
  assert.strictEqual(move.isCapture, true);
  assert.strictEqual(move.capturedTokens.length, 1);
  assert.strictEqual(move.capturedTokens[0].playerIndex, 1);
  assert.strictEqual(move.capturedTokens[0].tokenIndex, 0);

  const moveRes = Ludo.applyMove(state, 0);
  assert.strictEqual(state.players[0].tokens[0], 10);
  assert.strictEqual(state.players[1].tokens[0], -1, 'Captured token sent back to Yard');
  assert.strictEqual(moveRes.bonusTurn, true, 'Capture awards bonus roll');
  assert.strictEqual(state.currentPlayer, 0, 'Current player gets bonus roll');
});

// 8. Triple-6 Turn Forfeit
console.log('\n8. Triple-6 Turn Forfeit:');
test('Three consecutive 6s forfeits turn and passes to next player', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 0;

  // First 6
  let res = Ludo.rollDice(state, 6);
  assert.strictEqual(res.tripleSix, false);
  assert.strictEqual(state.consecutiveSixes, 1);
  Ludo.applyMove(state, 0);

  // Second 6
  res = Ludo.rollDice(state, 6);
  assert.strictEqual(res.tripleSix, false);
  assert.strictEqual(state.consecutiveSixes, 2);
  Ludo.applyMove(state, 0);

  // Third 6
  res = Ludo.rollDice(state, 6);
  assert.strictEqual(res.tripleSix, true, 'Third 6 should trigger forfeit');
  assert.strictEqual(res.validMoves.length, 0);
  assert.strictEqual(state.consecutiveSixes, 0);
  assert.strictEqual(state.currentPlayer, 1, 'Turn passes to next player');
  assert.strictEqual(state.phase, 'ROLL');
});

// 9. Home Stretch Entry
console.log('\n9. Home Stretch Entry:');
test('Token moves from main track into colored Home Stretch', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 49; // On Track 50

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  // Rolling 3: 49 + 3 = 52 (Home Stretch 2)
  const res = Ludo.rollDice(state, 3);
  const move = res.validMoves.find(m => m.tokenIndex === 0);
  assert(move, 'Move exists');
  assert.strictEqual(move.toStep, 52);
  assert.strictEqual(move.isHomeEntry, true);
  assert.strictEqual(move.isHomeStretch, true);
  assert.strictEqual(move.toDesc, 'Red Home Stretch 2');

  Ludo.applyMove(state, 0);
  assert.strictEqual(state.players[0].tokens[0], 52);
});

// 10. Exact Roll for Home Goal (Step 56)
console.log('\n10. Exact Roll for Home Goal (Step 56):');
test('Token in Home Stretch requires exact roll to enter Home Goal', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 54; // Home Stretch 4. Needs exact 2 to reach 56.

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  // Roll 3: overshoots 56 -> no valid moves
  const resOvershoot = Ludo.rollDice(state, 3);
  assert.strictEqual(resOvershoot.validMoves.length, 0);
  assert.strictEqual(resOvershoot.autoPassed, true);

  // Reset to player 0
  state.currentPlayer = 0;
  state.phase = 'ROLL';

  // Roll 2: exact roll to 56
  const resExact = Ludo.rollDice(state, 2);
  const move = resExact.validMoves.find(m => m.tokenIndex === 0);
  assert(move, 'Move exists');
  assert.strictEqual(move.toStep, 56);
  assert.strictEqual(move.toDesc, 'Home Goal');
  assert.strictEqual(move.isHomeEntry, true, 'Moving into Home Goal has isHomeEntry: true');

  const moveRes = Ludo.applyMove(state, 0);
  assert.strictEqual(state.players[0].tokens[0], 56);
  assert.strictEqual(moveRes.bonusTurn, true, 'Reaching Home Goal awards bonus roll');
});

// 11. Win Detection & Game Over
console.log('\n11. Win Detection & Game Over:');
test('Player finishing all 4 tokens wins and game ends', () => {
  // 2-player game
  const state = Ludo.createGame([
    { name: 'Red', type: 'human' },
    { name: 'Green', type: 'ai' },
    { name: 'Yellow', type: 'none' },
    { name: 'Blue', type: 'none' }
  ]);

  state.players[0].tokens = [56, 56, 56, 55]; // 3 home, 1 at Home Stretch 5
  state.currentPlayer = 0;
  state.phase = 'ROLL';

  Ludo.rollDice(state, 1);
  const moveRes = Ludo.applyMove(state, 3);

  assert.strictEqual(moveRes.justWon, true);
  assert.strictEqual(state.players[0].hasWon, true);
  assert.strictEqual(state.gameOver, true);
  assert.strictEqual(state.phase, 'GAME_OVER');
  assert.strictEqual(state.winners[0], 0);
});

// 12. AI Move Selection
console.log('\n12. AI Move Selection:');
test('AI prioritizes Capture over standard advance', () => {
  const state = Ludo.createGame();
  // Token 0 at 10, Token 1 at 20
  // Opponent at 14 (distance 4 from Token 0)
  state.players[0].tokens[0] = 10;
  state.players[0].tokens[1] = 20;
  state.players[1].tokens[0] = (14 - 13 + 52) % 52; // Green at Track 14

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  Ludo.rollDice(state, 4);
  const chosenIndex = Ludo.chooseAIMove(state);
  assert.strictEqual(chosenIndex, 0, 'AI should choose Token 0 to execute capture');
});

test('AI prioritizes reaching Home Goal over non-capture advance', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 54; // Needs 2 to reach Home Goal
  state.players[0].tokens[1] = 10; // On track

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  Ludo.rollDice(state, 2);
  const chosenIndex = Ludo.chooseAIMove(state);
  assert.strictEqual(chosenIndex, 0, 'AI should choose Token 0 to reach Home Goal');
});

test('AI prioritizes exiting Yard over normal advance', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = -1; // In yard
  state.players[0].tokens[1] = 10; // On track

  state.currentPlayer = 0;
  state.phase = 'ROLL';

  Ludo.rollDice(state, 6);
  const chosenIndex = Ludo.chooseAIMove(state);
  assert.strictEqual(chosenIndex, 0, 'AI should prioritize getting token out of yard');
});

// 13. Screen Reader Text Helpers
console.log('\n13. Screen Reader Text Helpers:');
test('getTokenStatusText generates descriptive strings', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = -1;
  state.players[0].tokens[1] = 0;
  state.players[0].tokens[2] = 52;
  state.players[0].tokens[3] = 56;

  const t1 = Ludo.getTokenStatusText(state, 0, 0);
  assert(t1.includes('Yard'), 'Yard text');

  const t2 = Ludo.getTokenStatusText(state, 0, 1);
  assert(t2.includes('Safe'), 'Start safe text');

  const t3 = Ludo.getTokenStatusText(state, 0, 2);
  assert(t3.includes('Home Stretch square 2'), 'Home stretch text');

  const t4 = Ludo.getTokenStatusText(state, 0, 3);
  assert(t4.includes('Home Goal! Finished'), 'Home goal text');
});

test('getPlayerSummaryText, getAllOpponentsSummaryText, getGameStatusText provide valid output', () => {
  const state = Ludo.createGame();
  const playerSummary = Ludo.getPlayerSummaryText(state, 0);
  assert(playerSummary.includes('4 in Yard'));

  const oppSummary = Ludo.getAllOpponentsSummaryText(state, 0);
  assert(oppSummary.includes('Green'));
  assert(oppSummary.includes('Yellow'));
  assert(oppSummary.includes('Blue'));

  const gameStatus = Ludo.getGameStatusText(state);
  assert(gameStatus.includes('Turn 1'));
  assert(gameStatus.includes('Red'));
});

// 14. Board Explorer Items & Coordinates
console.log('\n14. Board Explorer Items & Coordinates:');
test('getBoardExplorerItems generates full accessible board inventory', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = 0;
  const items = Ludo.getBoardExplorerItems(state);

  // 4 yards + 52 track squares + 20 home stretch squares + 4 home goals = 80 items
  assert.strictEqual(items.length, 80);

  const track0 = items.find(i => i.id === 'track-0');
  assert(track0);
  assert.strictEqual(track0.isOccupied, true);
  assert.strictEqual(track0.tokens.length, 1);
  assert.strictEqual(track0.tokens[0].color, 'Red');
  assert.strictEqual(track0.coord, 'B7');
  assert.strictEqual(track0.label, 'B7: Track 1 (Red Start, Safe)');

  // Verify all items have valid coord and label prefixed with coord
  items.forEach(item => {
    assert(item.coord && item.coord.length >= 2, `Item ${item.id} has invalid coord`);
    assert(item.label.startsWith(item.coord + ': '), `Item ${item.id} label not prefixed with coord`);
  });
});

test('getTokenCoords supports both (state, pIdx, tIdx) and (pIdx, tIdx, step) signatures', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = -1; // Yard
  state.players[0].tokens[1] = 0;  // Track 0
  state.players[0].tokens[2] = 51; // Home stretch 1
  state.players[0].tokens[3] = 56; // Home goal

  // Signature 1: (state, playerIndex, tokenIndex)
  assert.deepStrictEqual(Ludo.getTokenCoords(state, 0, 0), { row: 1, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(state, 0, 1), { row: 6, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(state, 0, 2), { row: 7, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(state, 0, 3), { row: 7, col: 6 });

  // Signature 2: (playerIndex, tokenIndex, step)
  assert.deepStrictEqual(Ludo.getTokenCoords(0, 0, -1), { row: 1, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(0, 1, 0), { row: 6, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(0, 2, 51), { row: 7, col: 1 });
  assert.deepStrictEqual(Ludo.getTokenCoords(0, 3, 56), { row: 7, col: 6 });
});

test('getTokenCoords and getSquareCoords return valid 15x15 board coords', () => {
  const state = Ludo.createGame();
  state.players[0].tokens[0] = -1; // Yard
  state.players[0].tokens[1] = 0;  // Track 0
  state.players[0].tokens[2] = 51; // Home stretch 1
  state.players[0].tokens[3] = 56; // Home goal

  const cYard = Ludo.getTokenCoords(state, 0, 0);
  assert.deepStrictEqual(cYard, { row: 1, col: 1 });

  const cTrack = Ludo.getTokenCoords(state, 0, 1);
  assert.deepStrictEqual(cTrack, { row: 6, col: 1 });

  const cStretch = Ludo.getTokenCoords(state, 0, 2);
  assert.deepStrictEqual(cStretch, { row: 7, col: 1 });

  const cGoal = Ludo.getTokenCoords(state, 0, 3);
  assert.deepStrictEqual(cGoal, { row: 7, col: 6 });

  const sqCoords = Ludo.getSquareCoords('track', 0);
  assert.deepStrictEqual(sqCoords, { row: 6, col: 1 });
});

// 15. getCellInfo Grid Exploration & Accessibility Metadata (Phase 2)
console.log('\n15. getCellInfo Grid Exploration & Accessibility Metadata:');

test('Ludo.getCellInfo is exported as a function', () => {
  assert.strictEqual(typeof Ludo.getCellInfo, 'function');
});

test('getCellInfo handles empty track squares correctly', () => {
  const state = Ludo.createGame();
  // Track 3 is at row 6, col 4 (E7)
  const info = Ludo.getCellInfo(state, 6, 4);
  assert.strictEqual(info.row, 6);
  assert.strictEqual(info.col, 4);
  assert.strictEqual(info.coord, 'E7');
  assert.strictEqual(info.isValidSquare, true);
  assert.strictEqual(info.type, 'track');
  assert.strictEqual(info.trackIndex, 3);
  assert.strictEqual(info.playerIndex, null);
  assert.strictEqual(info.isSafe, false);
  assert.strictEqual(info.isOccupied, false);
  assert.deepStrictEqual(info.tokens, []);
  assert.deepStrictEqual(info.threats, []);
  assert.strictEqual(info.label, 'Track 4');
  assert.strictEqual(info.speechSummary, 'E7, Track 4. Empty.');
});

test('getCellInfo handles start track squares (safe) when occupied', () => {
  const state = Ludo.createGame();
  // Red Start is Track 0 at row 6, col 1 (B7)
  state.players[0].tokens[0] = 0; // Red Token 1 on Start square
  const info = Ludo.getCellInfo(state, 6, 1);
  assert.strictEqual(info.coord, 'B7');
  assert.strictEqual(info.isValidSquare, true);
  assert.strictEqual(info.type, 'track');
  assert.strictEqual(info.trackIndex, 0);
  assert.strictEqual(info.playerIndex, 0);
  assert.strictEqual(info.isSafe, true);
  assert.strictEqual(info.isOccupied, true);
  assert.strictEqual(info.tokens.length, 1);
  assert.strictEqual(info.tokens[0].playerIndex, 0);
  assert.strictEqual(info.tokens[0].tokenIndex, 0);
  assert.strictEqual(info.tokens[0].color, 'Red');
  assert.strictEqual(info.tokens[0].label, 'Red Token 1');
  assert.deepStrictEqual(info.threats, []); // Safe square has no threats
  assert.strictEqual(info.label, 'Track 1 (Red Start, Safe)');
  assert.strictEqual(info.speechSummary, 'B7, Track 1 (Red Start, Safe). Occupied by Red Token 1.');
});

test('getCellInfo handles safe star squares and token coexistence', () => {
  const state = Ludo.createGame();
  // Safe Star at Track 8: row 2, col 6 (G3)
  // Red step 8 is track 8; Green step (8 - 13 + 52) % 52 = 47 is track 8
  state.players[0].tokens[0] = 8;
  state.players[1].tokens[0] = 47;
  const info = Ludo.getCellInfo(state, 2, 6);
  assert.strictEqual(info.coord, 'G3');
  assert.strictEqual(info.isValidSquare, true);
  assert.strictEqual(info.type, 'track');
  assert.strictEqual(info.trackIndex, 8);
  assert.strictEqual(info.playerIndex, null);
  assert.strictEqual(info.isSafe, true);
  assert.strictEqual(info.isOccupied, true);
  assert.strictEqual(info.tokens.length, 2);
  assert.deepStrictEqual(info.threats, []); // Safe square
  assert.strictEqual(info.label, 'Track 9 (Safe Star)');
  assert.strictEqual(info.speechSummary, 'G3, Track 9 (Safe Star). Occupied by Red Token 1, Green Token 1.');
});

test('getCellInfo reports active opponent threats on occupied unsafe track squares', () => {
  const state = Ludo.createGame();
  // Track 10 is at row 0, col 6 (G1, Unsafe)
  // Red Token 1 at track 10
  state.players[0].tokens[0] = 10;
  // Green Token 1 at track 6 (distance 4 from Track 10)
  // Green step: (6 - 13 + 52) % 52 = 45
  state.players[1].tokens[0] = 45;

  const info = Ludo.getCellInfo(state, 0, 6);
  assert.strictEqual(info.coord, 'G1');
  assert.strictEqual(info.isValidSquare, true);
  assert.strictEqual(info.type, 'track');
  assert.strictEqual(info.trackIndex, 10);
  assert.strictEqual(info.isSafe, false);
  assert.strictEqual(info.isOccupied, true);
  assert.strictEqual(info.tokens.length, 1);
  assert.strictEqual(info.threats.length, 1);
  assert.strictEqual(info.threats[0], 'Green Token 1 (4 steps away)');
  assert.strictEqual(
    info.speechSummary,
    'G1, Track 11. Occupied by Red Token 1. Warning: Threatened by Green Token 1 (4 steps away).'
  );
});

test('getCellInfo handles occupied and empty yard nests', () => {
  const state = Ludo.createGame();
  // Initial state: all tokens in yard
  // Red Yard 1 at row 1, col 1 (B2)
  const redNest1Occupied = Ludo.getCellInfo(state, 1, 1);
  assert.strictEqual(redNest1Occupied.coord, 'B2');
  assert.strictEqual(redNest1Occupied.isValidSquare, true);
  assert.strictEqual(redNest1Occupied.type, 'yardNest');
  assert.strictEqual(redNest1Occupied.playerIndex, 0);
  assert.strictEqual(redNest1Occupied.trackIndex, null);
  assert.strictEqual(redNest1Occupied.isSafe, true);
  assert.strictEqual(redNest1Occupied.isOccupied, true);
  assert.strictEqual(redNest1Occupied.tokens.length, 1);
  assert.strictEqual(redNest1Occupied.tokens[0].label, 'Red Token 1');
  assert.strictEqual(redNest1Occupied.label, 'Red Yard 1');
  assert.strictEqual(redNest1Occupied.speechSummary, 'B2, Red Yard 1. Occupied by Red Token 1.');

  // Red Token 1 exits yard to track 0
  state.players[0].tokens[0] = 0;
  const redNest1Empty = Ludo.getCellInfo(state, 1, 1);
  assert.strictEqual(redNest1Empty.coord, 'B2');
  assert.strictEqual(redNest1Empty.isValidSquare, true);
  assert.strictEqual(redNest1Empty.type, 'yardNest');
  assert.strictEqual(redNest1Empty.isOccupied, false);
  assert.strictEqual(redNest1Empty.tokens.length, 0);
  assert.strictEqual(redNest1Empty.speechSummary, 'B2, Red Yard 1. Empty.');

  // Green Yard 2 at row 1, col 13 (N2)
  const greenNest2 = Ludo.getCellInfo(state, 1, 13);
  assert.strictEqual(greenNest2.coord, 'N2');
  assert.strictEqual(greenNest2.isValidSquare, true);
  assert.strictEqual(greenNest2.type, 'yardNest');
  assert.strictEqual(greenNest2.playerIndex, 1);
  assert.strictEqual(greenNest2.label, 'Green Yard 2');
  assert.strictEqual(greenNest2.isOccupied, true);
  assert.strictEqual(greenNest2.tokens[0].label, 'Green Token 2');
});

test('getCellInfo returns isValidSquare: false and type: null for non-playable cells (no fake squares)', () => {
  const state = Ludo.createGame();
  // Former Yard Border at row 0, col 0 (A1)
  const border = Ludo.getCellInfo(state, 0, 0);
  assert.strictEqual(border.isValidSquare, false);
  assert.strictEqual(border.type, null);
  assert.strictEqual(border.label, '');
  assert.strictEqual(border.speechSummary, '');
  assert.strictEqual(border.coord, 'A1');

  // Former Yard Area at row 2, col 2 (C3)
  const innerArea = Ludo.getCellInfo(state, 2, 2);
  assert.strictEqual(innerArea.isValidSquare, false);
  assert.strictEqual(innerArea.type, null);
  assert.strictEqual(innerArea.label, '');
  assert.strictEqual(innerArea.speechSummary, '');
  assert.strictEqual(innerArea.coord, 'C3');

  // Former Board Center at row 7, col 7 (H8)
  const center = Ludo.getCellInfo(state, 7, 7);
  assert.strictEqual(center.isValidSquare, false);
  assert.strictEqual(center.type, null);
  assert.strictEqual(center.label, '');
  assert.strictEqual(center.speechSummary, '');
  assert.strictEqual(center.coord, 'H8');
});

test('getCellInfo handles home stretches', () => {
  const state = Ludo.createGame();
  // Red Home Stretch 1 at row 7, col 1 (B8)
  const redStretch1 = Ludo.getCellInfo(state, 7, 1);
  assert.strictEqual(redStretch1.coord, 'B8');
  assert.strictEqual(redStretch1.isValidSquare, true);
  assert.strictEqual(redStretch1.type, 'homeStretch');
  assert.strictEqual(redStretch1.playerIndex, 0);
  assert.strictEqual(redStretch1.trackIndex, null);
  assert.strictEqual(redStretch1.isSafe, true);
  assert.strictEqual(redStretch1.isOccupied, false);
  assert.strictEqual(redStretch1.label, 'Red Home Stretch 1');
  assert.strictEqual(redStretch1.speechSummary, 'B8, Red Home Stretch 1. Empty.');

  // Green Home Stretch 3 at row 3, col 7 (H4) occupied by Green Token 2 (step 53)
  state.players[1].tokens[1] = 53;
  const greenStretch3 = Ludo.getCellInfo(state, 3, 7);
  assert.strictEqual(greenStretch3.coord, 'H4');
  assert.strictEqual(greenStretch3.isValidSquare, true);
  assert.strictEqual(greenStretch3.type, 'homeStretch');
  assert.strictEqual(greenStretch3.playerIndex, 1);
  assert.strictEqual(greenStretch3.isSafe, true);
  assert.strictEqual(greenStretch3.isOccupied, true);
  assert.strictEqual(greenStretch3.tokens[0].label, 'Green Token 2');
  assert.strictEqual(greenStretch3.tokens[0].step, 53);
  assert.strictEqual(greenStretch3.label, 'Green Home Stretch 3');
  assert.strictEqual(greenStretch3.speechSummary, 'H4, Green Home Stretch 3. Occupied by Green Token 2.');
});

test('getCellInfo handles home goals', () => {
  const state = Ludo.createGame();
  // Red Home Goal at row 7, col 6 (G8)
  const emptyGoal = Ludo.getCellInfo(state, 7, 6);
  assert.strictEqual(emptyGoal.coord, 'G8');
  assert.strictEqual(emptyGoal.isValidSquare, true);
  assert.strictEqual(emptyGoal.type, 'homeGoal');
  assert.strictEqual(emptyGoal.playerIndex, 0);
  assert.strictEqual(emptyGoal.trackIndex, null);
  assert.strictEqual(emptyGoal.isSafe, true);
  assert.strictEqual(emptyGoal.isOccupied, false);
  assert.strictEqual(emptyGoal.label, 'Red Home Goal');
  assert.strictEqual(emptyGoal.speechSummary, 'G8, Red Home Goal. Empty.');

  // Red Token 1 reaches Home Goal (step 56)
  state.players[0].tokens[0] = 56;
  const occupiedGoal = Ludo.getCellInfo(state, 7, 6);
  assert.strictEqual(occupiedGoal.isOccupied, true);
  assert.strictEqual(occupiedGoal.tokens.length, 1);
  assert.strictEqual(occupiedGoal.tokens[0].label, 'Red Token 1');
  assert.strictEqual(occupiedGoal.speechSummary, 'G8, Red Home Goal. Occupied by Red Token 1.');

  // Check other colors' Home Goals
  assert.strictEqual(Ludo.getCellInfo(state, 6, 7).label, 'Green Home Goal');
  assert.strictEqual(Ludo.getCellInfo(state, 7, 8).label, 'Yellow Home Goal');
  assert.strictEqual(Ludo.getCellInfo(state, 8, 7).label, 'Blue Home Goal');
});

test('getCellInfo handles out-of-bounds coordinates gracefully', () => {
  const state = Ludo.createGame();
  const oob1 = Ludo.getCellInfo(state, -1, 5);
  assert.strictEqual(oob1.isValidSquare, false);
  assert.strictEqual(oob1.type, null);
  assert.strictEqual(oob1.label, '');
  assert.strictEqual(oob1.speechSummary, '');

  const oob2 = Ludo.getCellInfo(state, 15, 15);
  assert.strictEqual(oob2.isValidSquare, false);
  assert.strictEqual(oob2.type, null);
  assert.strictEqual(oob2.label, '');
  assert.strictEqual(oob2.speechSummary, '');
});

test('getCellInfo and isValidSquare strictly partition the 225 cells into 92 valid squares and 133 non-squares', () => {
  const state = Ludo.createGame();
  let validCount = 0;
  let nonSquareCount = 0;
  let trackCount = 0;
  let homeStretchCount = 0;
  let homeGoalCount = 0;
  let yardNestCount = 0;

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const isVal = Ludo.isValidSquare(r, c);
      const info = Ludo.getCellInfo(state, r, c);
      assert.strictEqual(info.row, r);
      assert.strictEqual(info.col, c);
      assert.strictEqual(info.coord, Ludo.getCoordName(r, c));
      assert.strictEqual(info.isValidSquare, isVal);

      if (isVal) {
        validCount++;
        assert(info.type === 'track' || info.type === 'homeStretch' || info.type === 'homeGoal' || info.type === 'yardNest');
        assert(info.speechSummary.startsWith(info.coord));

        if (info.type === 'track') trackCount++;
        else if (info.type === 'homeStretch') homeStretchCount++;
        else if (info.type === 'homeGoal') homeGoalCount++;
        else if (info.type === 'yardNest') yardNestCount++;
      } else {
        nonSquareCount++;
        assert.strictEqual(info.type, null);
        assert.strictEqual(info.label, '');
        assert.strictEqual(info.speechSummary, '');
      }
    }
  }

  assert.strictEqual(validCount, 92, 'Exactly 92 valid playable Ludo squares');
  assert.strictEqual(trackCount, 52, '52 Track squares');
  assert.strictEqual(homeStretchCount, 20, '20 Home Stretch squares');
  assert.strictEqual(homeGoalCount, 4, '4 Home Goal squares');
  assert.strictEqual(yardNestCount, 16, '16 Yard Token Slots');
  assert.strictEqual(nonSquareCount, 133, 'Exactly 133 non-playable cells');
  assert.strictEqual(validCount + nonSquareCount, 225, 'Total 225 cells on 15x15 grid');
});

test('getCoordName converts (row, col) to alphanumeric coordinate name', () => {
  assert.strictEqual(Ludo.getCoordName(6, 0), 'A7');
  assert.strictEqual(Ludo.getCoordName(6, 1), 'B7');
  assert.strictEqual(Ludo.getCoordName(1, 1), 'B2');
  assert.strictEqual(Ludo.getCoordName(7, 6), 'G8');
  assert.strictEqual(Ludo.getCoordName(0, 0), 'A1');
  assert.strictEqual(Ludo.getCoordName(14, 14), 'O15');
  assert.strictEqual(Ludo.getCoordName(-1, 0), '');
  assert.strictEqual(Ludo.getCoordName(0, 15), '');
});

test('getAllValidSquares returns all 92 real playable Ludo squares', () => {
  const validList = Ludo.getAllValidSquares();
  assert.strictEqual(validList.length, 92);
  validList.forEach(sq => {
    assert(sq.row >= 0 && sq.row <= 14);
    assert(sq.col >= 0 && sq.col <= 14);
    assert.strictEqual(sq.coord, Ludo.getCoordName(sq.row, sq.col));
    assert.strictEqual(Ludo.isValidSquare(sq.row, sq.col), true);
  });
});

test('findNextValidSquare navigates accurately across 92 valid squares via arrow keys', () => {
  // 1. Direct immediate neighbor moves
  const moveRightFromB7 = Ludo.findNextValidSquare(6, 1, 0, 1);
  assert.deepStrictEqual(moveRightFromB7, { row: 6, col: 2 }); // C7 (Track 2)

  const moveLeftFromB7 = Ludo.findNextValidSquare(6, 1, 0, -1);
  assert.deepStrictEqual(moveLeftFromB7, { row: 6, col: 0 }); // A7 (Track 52)

  const moveDownFromB7 = Ludo.findNextValidSquare(6, 1, 1, 0);
  assert.deepStrictEqual(moveDownFromB7, { row: 7, col: 1 }); // B8 (Red Home Stretch 1)

  // 2. Yard slot jumps
  const moveRightFromB2 = Ludo.findNextValidSquare(1, 1, 0, 1);
  assert.deepStrictEqual(moveRightFromB2, { row: 1, col: 4 }); // E2 (Red Yard 2)

  const moveDownFromB2 = Ludo.findNextValidSquare(1, 1, 1, 0);
  assert.deepStrictEqual(moveDownFromB2, { row: 4, col: 1 }); // B5 (Red Yard 3)

  const moveDownFromB5 = Ludo.findNextValidSquare(4, 1, 1, 0);
  assert.deepStrictEqual(moveDownFromB5, { row: 6, col: 1 }); // B7 (Track 1 / Red Start)

  const moveUpFromB7 = Ludo.findNextValidSquare(6, 1, -1, 0);
  assert.deepStrictEqual(moveUpFromB7, { row: 4, col: 1 }); // B5 (Red Yard 3)

  const moveUpFromB5 = Ludo.findNextValidSquare(4, 1, -1, 0);
  assert.deepStrictEqual(moveUpFromB5, { row: 1, col: 1 }); // B2 (Red Yard 1)

  // 3. Board edges
  const moveLeftFromA7 = Ludo.findNextValidSquare(6, 0, 0, -1);
  assert.strictEqual(moveLeftFromA7, null);

  const moveUpFromG1 = Ludo.findNextValidSquare(0, 6, -1, 0);
  assert.strictEqual(moveUpFromG1, null);
});

// 16. Audio & Multiplayer Integration Tests
console.log('\n16. Audio & Multiplayer Integration:');
const Audio = require('./audio.js');
const Multiplayer = require('./multiplayer.js');

test('Audio playCursorMove distinguishes empty vs occupied squares', () => {
  const tones = [];
  const noises = [];
  const mockGain = {
    gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
    connect: () => {}
  };
  const mockCtx = {
    currentTime: 1.0,
    state: 'running',
    destination: {},
    createGain: () => mockGain,
    createOscillator: () => {
      let freq = 0;
      let type = 'sine';
      return {
        type,
        frequency: { setValueAtTime: (f) => { freq = f; }, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => { tones.push({ freq, type }); },
        stop: () => {}
      };
    },
    createBuffer: () => ({ getChannelData: () => new Float32Array(50) }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      start: () => { noises.push(true); },
      stop: () => {}
    }),
    createBiquadFilter: () => ({
      type: '',
      frequency: { setValueAtTime: () => {} },
      connect: () => {}
    })
  };

  global.window = {
    AudioContext: function () { return mockCtx; }
  };

  // Test empty cell: should trigger noise burst + wooden tap tone
  tones.length = 0;
  noises.length = 0;
  Audio.playCursorMove({ row: 6, col: 2, isOccupied: false, isSafe: false, tokens: [] });
  assert.strictEqual(noises.length, 1, 'Empty square should play noise burst');
  assert.strictEqual(tones.length, 1, 'Empty non-safe square should play 1 tap tone');

  // Test empty safe cell: should trigger noise burst + wooden tap + safe shimmer
  tones.length = 0;
  noises.length = 0;
  Audio.playCursorMove({ row: 6, col: 1, isOccupied: false, isSafe: true, tokens: [] });
  assert.strictEqual(noises.length, 1, 'Empty safe square should play noise burst');
  assert.strictEqual(tones.length, 2, 'Empty safe square should play 2 tones (tap + shimmer)');

  // Test occupied cell (Red token): should play bell tone + shimmer, no noise burst
  tones.length = 0;
  noises.length = 0;
  Audio.playCursorMove({
    row: 6,
    col: 1,
    isOccupied: true,
    tokens: [{ playerIndex: 0, color: 'Red', label: 'Red Token 1' }]
  });
  assert.strictEqual(noises.length, 0, 'Occupied square should NOT play noise burst');
  assert.strictEqual(tones.length, 2, 'Occupied square should play resonant bell and harmonic tones');
  assert.strictEqual(tones[0].freq, 330, 'Red piece base bell tone frequency should be 330Hz');
  assert.strictEqual(tones[1].freq, 660, 'Red piece harmonic shimmer frequency should be 660Hz');
});

test('Audio playMultiplayerEvent produces chimes for join, leave, linkCopied', () => {
  assert.doesNotThrow(() => {
    Audio.playMultiplayerEvent('join');
    Audio.playMultiplayerEvent('leave');
    Audio.playMultiplayerEvent('linkCopied');
  });
});

test('Multiplayer extractRoomId and URL parsing', () => {
  assert.strictEqual(Multiplayer.extractRoomId('ludo-abc123'), 'ludo-abc123');
  assert.strictEqual(Multiplayer.extractRoomId('?room=ludo-xyz789'), 'ludo-xyz789');
  assert.strictEqual(Multiplayer.extractRoomId('https://example.com/ludo/?room=ludo-456def#main'), 'ludo-456def');
  assert.strictEqual(Multiplayer.extractRoomId('&room=ludo-999qqq'), 'ludo-999qqq');
});

test('Multiplayer hostRoom, joinRoom, seat assignment and state synchronization simulation', async () => {
  // Mock BroadcastChannel for headless multi-client simulation
  const channels = new Map(); // channelName -> Set of handlers
  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      if (!channels.has(name)) channels.set(name, new Set());
      this.handlers = channels.get(name);
      this.onmessage = null;
      this.handlers.add(this);
    }
    postMessage(data) {
      for (const ch of this.handlers) {
        if (ch !== this && ch.onmessage) {
          // Deliver asynchronously like standard Web API
          queueMicrotask(() => {
            if (ch.onmessage) ch.onmessage({ data: JSON.parse(JSON.stringify(data)) });
          });
        }
      }
    }
    close() {
      this.handlers.delete(this);
    }
  }

  global.BroadcastChannel = MockBroadcastChannel;
  global.window = {
    location: {
      origin: 'https://example.com',
      pathname: '/ludo/',
      search: '',
      href: 'https://example.com/ludo/'
    },
    history: {
      replaceState: (state, title, url) => {
        global.window.location.href = url;
        const qIdx = url.indexOf('?');
        global.window.location.search = qIdx !== -1 ? url.slice(qIdx) : '';
      }
    }
  };

  // Host creates room
  let hostLobby = null;
  Multiplayer.init({
    onLobbyUpdate: (players) => { hostLobby = players; }
  });

  const gameState = Ludo.createGame();
  const hostInfo = Multiplayer.hostRoom('Alice (Host)', gameState);
  assert(hostInfo.roomId.startsWith('ludo-'), 'Host roomId must start with ludo-');
  assert(hostInfo.inviteUrl.includes('?room=' + hostInfo.roomId), 'Invite URL must contain ?room=');
  assert.strictEqual(Multiplayer.isHost(), true, 'Creator must be host');
  assert.strictEqual(Multiplayer.getLocalPlayerIndex(), 0, 'Host must be seat 0 (Red)');
  assert.strictEqual(Multiplayer.getLocalPlayerColor(), 'Red', 'Host color must be Red');

  // Verify getRoomFromUrl
  assert.strictEqual(Multiplayer.getRoomFromUrl(), hostInfo.roomId);

  // Guest joins using a second instance of Multiplayer
  delete require.cache[require.resolve('./multiplayer.js')];
  const GuestMultiplayer = require('./multiplayer.js');

  let guestAssignedSeat = null;
  let guestSyncedState = null;
  let guestLobby = null;

  GuestMultiplayer.init({
    onConnectionStatus: (status, info) => {
      if (status === 'connected') guestAssignedSeat = info.playerIndex;
    },
    onStateSync: (synced) => {
      guestSyncedState = synced;
    },
    onLobbyUpdate: (players) => {
      guestLobby = players;
    }
  });

  // Join room using the host's invite URL
  const joinPromise = GuestMultiplayer.joinRoom(hostInfo.inviteUrl, 'Bob (Guest)');

  // Allow BroadcastChannel microtasks to resolve
  await new Promise(r => setTimeout(r, 50));

  const joinRes = await joinPromise;
  assert.strictEqual(joinRes.playerIndex, 1, 'First guest should be assigned seat 1 (Green)');
  assert.strictEqual(joinRes.color, 'Green', 'Guest color should be Green');
  assert.strictEqual(GuestMultiplayer.isHost(), false, 'Guest should not be host');
  assert.strictEqual(GuestMultiplayer.getLocalPlayerIndex(), 1);
  assert.strictEqual(GuestMultiplayer.getLocalPlayerColor(), 'Green');
  assert(guestSyncedState !== null, 'Guest should receive state sync from host');
  assert.strictEqual(guestSyncedState.currentPlayer, 0, 'Synced state current player should match');

  // Clean up
  Multiplayer.leaveRoom();
  GuestMultiplayer.leaveRoom();
});

(async function runAll() {
  for (const t of testQueue) {
    totalTests++;
    try {
      const res = t.fn();
      if (res && typeof res.then === 'function') {
        await res;
      }
      passedTests++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failedTests++;
      console.error(`  ✗ ${t.name}`);
      console.error(`    ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(1, 3).join('\n'));
      }
    }
  }

  console.log('\n====================================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
