# Endurance — design

A local-only, single-file replica of HEXO (infinite hexagonal tic-tac-toe) at
https://hexo.did.science/. Built because the original destroys local games on any
navigation/error and mislabels the whose-turn color. Endurance is durable by
construction and correct by derivation.

## Game rules

- Two players on an infinite pointy-top hex grid. Blue = Player 1, Yellow = Player 2.
- Turn cadence: turn 1, P1 places **1** hex (the center). Every turn after, the mover
  places **2** hexes (including P2's first turn).
- Win: **6 or more** of your own hexes contiguous in a straight line on any of the 3
  axes (E–W horizontal, and the two diagonals). Checked after every placement,
  mid-turn included — placing your 6th ends the game immediately.
- Legal placement: target hex is empty AND (it is the very first placement OR its
  hex-distance is ≤ 8 from at least one already-placed hex of either color).

## Deliverable & architecture

Single self-contained `index.html` (vanilla JS module, inline CSS, SVG). No
dependencies, no build step, double-click to run. Internal sections:

- **Rules engine** — pure functions, no DOM: coord math, legal-placement, win
  detection, state transitions. Delimited by marker comments so `test.mjs` can
  extract and unit-test it under `node --test`.
- **State store** — single source of truth, subscribe/notify, persistence.
- **Renderer** — draws the visible viewport as SVG (grid, hexes, markup overlay).
- **Controllers** — placement, pan/zoom, undo/redo, markup, help, keyboard.

## Coordinate system & rendering

- Axial coords `(q, r)` for pointy-top hexes; distance via cube coords.
- Infinite board: render only hexes within the viewport + margin. Layers: faint empty
  grid → placed hexes → markup overlay.
- Pan (LMB drag) = translate offset; zoom (wheel/pinch) = scale about cursor. View is
  never part of game state logic (though last view may be persisted for convenience).
  Auto-center on center hex at game start.

## State model, undo/redo, persistence

- State = `{ moves: [{q, r, player}], cursor, markups: [...] }` plus view.
- `moves` + `cursor` give undo/redo: undo steps cursor back one placement, redo
  forward, a new placement truncates everything after `cursor`.
- Whose-turn and placements-left are **derived** from `cursor` — always correct by
  construction (fixes the original's color bug).
- Every change is debounced-saved to `localStorage`; restored on load. Survives
  refresh, tab close, navigation.

## Share links

- **Share** button encodes full state as base64 into `?g=<b64>` and copies the link.
- On load, if `?g=` present: decode and load. If it differs from the saved local game,
  **ask before replacing** and keep the previous game recoverable (never silently
  clobber).
- Markup is included in the encoded state; encoding kept compact.

## Interaction model (copied from HEXO's board-help card)

- Click/tap empty hex to place (on your turn, if legal).
- LMB drag to pan; wheel/pinch to zoom — must feel smooth.
- Undo `←`, redo `→` (per-placement).
- Markup layer for planning candidate lines: right-drag draws a line or marks a cell;
  right-click removes a mark; Shift/Ctrl → yellow, Alt → blue, default → neutral;
  Shift+left-drag = trackpad-friendly draw.
- Board Help card: `?` / `F1` opens, `Esc` closes.

## Visual design

Dark navy bg, faint hex grid, blue P1 / yellow P2. Turn banner with the correct color
dot ("PLAYER 2 TO MOVE · 2 placements left"). Last-placed hex highlighted. Win banner
+ highlight the winning six. Controls: New Game (confirm), Undo/Redo, Share, Help.
Restrained, smooth animations.

## Testing

`test.mjs` (`node --test`) reads `index.html`, extracts the rules-engine module between
marker comments, evaluates it, and asserts: distance math, legal-placement edges
(empty, ≤8, first-placement exemption), turn cadence, and win detection on all 3 axes
(incl. mid-turn win and 6-vs-7 runs). TDD for logic; product stays single-file.
