// Extracts the pure rules engine from index.html and unit-tests it.
// The product stays a single file; this gives the logic real coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ <RULES_ENGINE>([\s\S]*?)\/\/ <\/RULES_ENGINE>/);
if (!m) throw new Error('RULES_ENGINE markers not found in index.html');
// eslint-disable-next-line no-new-func
const R = new Function(m[1] + '\nreturn RulesEngine;')();

test('hexDistance: same cell is 0', () => {
  assert.equal(R.hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 }), 0);
});

test('hexDistance: adjacent cells are 1', () => {
  assert.equal(R.hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 }), 1);
  assert.equal(R.hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 }), 1);
  assert.equal(R.hexDistance({ q: 0, r: 0 }, { q: 1, r: -1 }), 1);
});

test('hexDistance: straight line east is additive', () => {
  assert.equal(R.hexDistance({ q: 0, r: 0 }, { q: 8, r: 0 }), 8);
});

test('hexDistance: is symmetric', () => {
  assert.equal(
    R.hexDistance({ q: 2, r: -3 }, { q: -1, r: 4 }),
    R.hexDistance({ q: -1, r: 4 }, { q: 2, r: -3 }),
  );
});

// --- Turn cadence (derived purely from how many placements are committed) ---
// Placement index -> player:
//   0        : P1 (opening, 1 hex)
//   1,2      : P2 ; 3,4 : P1 ; 5,6 : P2 ; ... (pairs thereafter)
test('playerForIndex: opening hex is P1', () => {
  assert.equal(R.playerForIndex(0), 1);
});
test('playerForIndex: P2 owns the first pair', () => {
  assert.equal(R.playerForIndex(1), 2);
  assert.equal(R.playerForIndex(2), 2);
});
test('playerForIndex: players alternate by pair after the opening', () => {
  assert.equal(R.playerForIndex(3), 1);
  assert.equal(R.playerForIndex(4), 1);
  assert.equal(R.playerForIndex(5), 2);
  assert.equal(R.playerForIndex(6), 2);
});
test('remainingForIndex: opening turn has a single placement', () => {
  assert.equal(R.remainingForIndex(0), 1);
});
test('remainingForIndex: pair turns count down 2 -> 1', () => {
  assert.equal(R.remainingForIndex(1), 2);
  assert.equal(R.remainingForIndex(2), 1);
  assert.equal(R.remainingForIndex(3), 2);
  assert.equal(R.remainingForIndex(4), 1);
});
test('currentPlayer / placementsRemaining derive from cursor', () => {
  const s = { moves: [], cursor: 3, markups: [] };
  assert.equal(R.currentPlayer(s), 1);
  assert.equal(R.placementsRemaining(s), 2);
});

// --- Legal placement ---
test('initialState is empty with cursor 0', () => {
  const s = R.initialState();
  assert.deepEqual(s.moves, []);
  assert.equal(s.cursor, 0);
  assert.deepEqual(s.markups, []);
});
test('opening placement is legal only at the center', () => {
  const s = R.initialState();
  assert.equal(R.isLegalPlacement(s, { q: 0, r: 0 }), true);
  assert.equal(R.isLegalPlacement(s, { q: 1, r: 0 }), false);
});
test('cannot place on an occupied hex', () => {
  let s = R.place(R.initialState(), { q: 0, r: 0 });
  assert.equal(R.isLegalPlacement(s, { q: 0, r: 0 }), false);
});
test('placement must be within distance 8 of an existing hex', () => {
  let s = R.place(R.initialState(), { q: 0, r: 0 });
  assert.equal(R.isLegalPlacement(s, { q: 8, r: 0 }), true);   // exactly 8: ok
  assert.equal(R.isLegalPlacement(s, { q: 9, r: 0 }), false);  // 9: too far
});

// --- place / undo / redo ---
test('place appends a move for the current player and advances cursor', () => {
  const s = R.place(R.initialState(), { q: 0, r: 0 });
  assert.equal(s.cursor, 1);
  assert.deepEqual(s.moves[0], { q: 0, r: 0, player: 1 });
});
test('place rejects an illegal move by returning null', () => {
  assert.equal(R.place(R.initialState(), { q: 5, r: 5 }), null);
});
test('undo/redo walk the cursor without losing moves', () => {
  let s = R.place(R.initialState(), { q: 0, r: 0 });
  s = R.place(s, { q: 1, r: 0 });
  assert.equal(s.cursor, 2);
  s = R.undo(s);
  assert.equal(s.cursor, 1);
  assert.equal(s.moves.length, 2); // history preserved for redo
  s = R.redo(s);
  assert.equal(s.cursor, 2);
});
test('placing after undo truncates the redo branch', () => {
  let s = R.place(R.initialState(), { q: 0, r: 0 });
  s = R.place(s, { q: 1, r: 0 });
  s = R.undo(s);
  s = R.place(s, { q: 0, r: 1 }); // different second placement
  assert.equal(s.moves.length, 2);
  assert.deepEqual(s.moves[1], { q: 0, r: 1, player: 2 });
  assert.equal(R.canRedo(s), false);
});

// --- Win detection ---
// Craft states directly (explicit players) so cadence doesn't complicate setup.
// findWin looks at the most recently committed hex — a win can only be created
// by the placement that completes the line.
const line = (player, cells) => ({
  moves: cells.map(([q, r]) => ({ q, r, player })),
  cursor: cells.length,
  markups: [],
});

test('findWin: fresh board has no winner', () => {
  assert.equal(R.findWin(R.initialState()), null);
});
test('findWin: five in a row is not enough', () => {
  const s = line(1, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  assert.equal(R.findWin(s), null);
});
test('findWin: six on the horizontal axis wins', () => {
  const s = line(1, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  const w = R.findWin(s);
  assert.equal(w.player, 1);
  assert.equal(w.line.length, 6);
});
test('findWin: six on each diagonal axis wins', () => {
  const d1 = line(2, [[0, 0], [1, -1], [2, -2], [3, -3], [4, -4], [5, -5]]);
  const d2 = line(2, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  assert.equal(R.findWin(d1).player, 2);
  assert.equal(R.findWin(d2).player, 2);
});
test('findWin: run detected regardless of which end was placed last', () => {
  // Same six cells but placed so the pivot sits in the middle of the run.
  const cells = [[0, 0], [1, 0], [2, 0], [4, 0], [5, 0], [3, 0]];
  const s = line(1, cells);
  const w = R.findWin(s);
  assert.equal(w.player, 1);
  assert.ok(w.line.length >= 6);
});
test('findWin: opponent hexes do not extend your line', () => {
  const s = {
    moves: [
      { q: 0, r: 0, player: 1 }, { q: 1, r: 0, player: 1 },
      { q: 2, r: 0, player: 1 }, { q: 3, r: 0, player: 2 },
      { q: 4, r: 0, player: 1 }, { q: 5, r: 0, player: 1 },
    ],
    cursor: 6, markups: [],
  };
  assert.equal(R.findWin(s), null);
});
test('findWin: seven in a row still wins', () => {
  const s = line(1, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]);
  assert.ok(R.findWin(s).line.length >= 6);
});
