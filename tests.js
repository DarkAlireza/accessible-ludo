/**
 * Comprehensive Test Suite for Ludo Engine
 * Runs via: node tests.js
 */

const assert = require('assert');
const Ludo = require('./engine.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 3).join('\n'));
    }
  }
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

console.log('\n====================================================');
console.log(`Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
}
