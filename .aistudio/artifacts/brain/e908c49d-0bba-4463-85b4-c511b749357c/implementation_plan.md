# Fix Texture Area Copy & Paste and Floating Selection Workflow

A plan to fix the texture selection copy/paste functionality: supporting keyboard shortcuts across all layouts (including Russian ЙЦУКЕН), pasting fragments as interactive movable floating overlays, and providing seamless drag-and-drop placement on the skin canvas.

---

## User Review & Clarifications

> [!IMPORTANT]
> The following requirements were confirmed during clarification:
> - **Copy Target**: Copying and pasting selected texture regions on the 64×64 skin canvas.
> - **Trigger**: Hotkeys `Ctrl+C` and `Ctrl+V` (as well as `Ctrl+X` for cut).
> - **Paste Behavior**: Paste as a movable floating fragment (`floating selection`) that the user can freely drag across the canvas and commit with Enter, click outside, or tool change.

---

## 1. Problem Diagnosis

1. **Keyboard Layout Dependency (`e.key` vs `e.code`)**:
   - Currently, the keydown handler tests `e.key.toLowerCase() === 'c'` and `e.key.toLowerCase() === 'v'`.
   - On non-English keyboard layouts (specifically Russian Cyrillic ЙЦУКЕН), pressing `Ctrl+C` produces `e.key === 'с'` (Cyrillic letter Es, U+0441), which does not equal Latin `'c'` (U+0063).
   - Pressing `Ctrl+V` produces `e.key === 'м'` (Cyrillic letter Em).
   - Pressing `Ctrl+Z` produces `e.key === 'я'` (Cyrillic Ya).
   - Consequently, hotkeys silently fail to trigger when the user's keyboard layout is set to Russian.
   - **Fix**: Check `e.code === 'KeyC'`, `e.code === 'KeyV'`, `e.code === 'KeyX'`, `e.code === 'KeyZ'`, `e.code === 'KeyY'` as primary layout-independent identifiers.

2. **Paste Bakes Directly Instead of Floating**:
   - Currently, `paste()` clones pixels and permanently writes (`pasteFragment`) into `p.pixels` immediately, without entering `state.floating`.
   - **Fix**: Update `paste()` to instantiate `state.floating = { x, y, w, h, pixels }`, switch the active tool to `'select'`, and allow immediate dragging across the canvas until committed.

3. **Copying / Cutting Floating Fragments**:
   - If the user moves a floating fragment and then presses `Ctrl+C`, the current code commits it first and captures from `p.pixels`, while `Ctrl+X` commits it and then clears it from the base texture.
   - **Fix**: If `state.floating` is active, copy its pixels directly; if cut, remove the floating fragment without destroying underlying pixels underneath it.

---

## 2. Proposed Changes

### `src/main.js`

1. **Layout-Independent Hotkeys**:
   - Update `window.addEventListener('keydown', e => { ... })`:
     - `Ctrl+C` / `Cmd+C`: match `e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с'`
     - `Ctrl+V` / `Cmd+V`: match `e.code === 'KeyV' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м'`
     - `Ctrl+X` / `Cmd+X`: match `e.code === 'KeyX' || e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'ч'`
     - `Ctrl+Z` / `Cmd+Z`: match `e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я'`
     - `Ctrl+Y` / `Cmd+Y`: match `e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н'`
     - `Ctrl+S`: `e.code === 'KeyS' || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы'`
     - `Ctrl+O`: `e.code === 'KeyO' || e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'щ'`
     - Also maintain `Enter` (commit floating), `Escape` (cancel/commit floating or clear selection), and `Delete` (delete selection / floating fragment).

2. **Enhanced `copy(cut = false)` Logic**:
   - If `state.floating` exists:
     - Clone `state.floating.pixels` into `state.clipboard = { width: state.floating.w, height: state.floating.h, x: state.floating.x, y: state.floating.y, pixels: new Uint8Array(state.floating.pixels) }`.
     - Write to shared localStorage clipboard.
     - If `cut`: delete `state.floating = null`, clear selection, notify `'Fragment cut.'`, refresh.
     - Else: notify `'Fragment copied.'`.
   - Else if `state.selection`:
     - Extract fragment from `p.pixels` via `captureSelection(p.pixels, state.selection)`.
     - Write to shared storage clipboard.
     - If `cut`: push snapshot to undo history, clear the rectangular area with transparent pixels `[0,0,0,0]`, notify `'Selection cut.'`, changed().
     - Else: notify `'Selection copied.'`.
   - If neither exists:
     - Notify `'Select an area to copy first.'`.

3. **Floating `paste()` Implementation**:
   - Commit any existing floating selection first (`commitFloating()`).
   - Read clipboard from `readSharedClipboard()` or memory `state.clipboard`.
   - If empty, notify `'Clipboard is empty.'`.
   - Determine target position:
     - If `state.selection` exists, use `{ x: state.selection.x, y: state.selection.y }`.
     - Otherwise, place in center of view or `{ x: Math.max(0, 32 - Math.floor(c.width/2)), y: Math.max(0, 32 - Math.floor(c.height/2)) }`.
     - Clamp to `[0, 64 - c.width]` and `[0, 64 - c.height]`.
   - Create floating object:
     ```js
     state.floating = {
       x,
       y,
       w: c.width,
       h: c.height,
       pixels: new Uint8Array(c.pixels)
     };
     state.selection = { x, y, w: c.width, h: c.height };
     ```
   - Automatically switch to select tool: `setTool('select')`.
   - Call `selectionUI()`, `draw()`, `refresh()`.
   - Notify `'Pasted as floating fragment. Drag to position, press Enter or click outside to commit.'`.

4. **Floating Fragment Dragging & Committing Improvements**:
   - When hovering over the floating fragment with the `select` tool, show `grab` cursor.
   - On mouse down inside the floating fragment, initiate `move-selection` drag immediately.
   - On mouse down outside the floating fragment: commit it (`commitFloating()`), record in undo history, and allow starting a new selection box.
   - On pressing `Enter`: commit floating fragment to `p.pixels` with snapshot in undo history.
   - On pressing `Delete` or `Backspace`: if floating, cancel/discard floating fragment without baking it.
   - On pressing `Escape`: commit or discard floating fragment.

5. **UI Accessibility (Copy/Paste Buttons)**:
   - Ensure quick access buttons for Copy, Paste, Cut, and Clear are accessible in the UI (e.g., in the toolbar, header, or selection HUD) for users working without keyboard shortcuts.

---

## 3. Verification Plan

1. **Automated Tests**:
   - Run `npm test` to verify `src/selectionClipboard.test.js` passes.
   - Run `npm run lint` and `compile_applet`.

2. **Manual & Interactive Scenarios**:
   - Select a 4×4 or 8×8 region on the skin canvas.
   - Press `Ctrl+C` (both on English and Russian keyboard layouts) -> check toast "Selection copied".
   - Press `Ctrl+V` -> verify floating fragment appears with selection outline, cursor changes to grab.
   - Drag the floating fragment across the face to a new position.
   - Press `Enter` or click outside -> verify fragment is committed to the new position.
   - Press `Ctrl+Z` -> verify undo works and reverses the paste.
   - Test `Ctrl+X` (Cut) -> verify selected area is cleared to transparent and copied into clipboard, ready to paste.
