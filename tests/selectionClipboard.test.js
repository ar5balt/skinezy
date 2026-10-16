import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTexture, pixelOffset } from '../src/texture.js';
import {
  captureSelection, serialiseClipboard, parseClipboardPayload,
  writeSharedClipboard, readSharedClipboard, pasteFragment, sameFragment,
  SELECTION_CLIPBOARD_KEY,
} from '../src/selectionClipboard.js';
import { drawLine, floodFill } from '../src/operations.js';

test('selection clipboard round-trips dimensions, source coordinates, RGBA and transparency', () => {
  const skin = blankTexture();
  skin.set([12, 34, 56, 255], pixelOffset(7, 9));
  skin.set([200, 100, 50, 0], pixelOffset(8, 9));
  const copied = captureSelection(skin, { x: 7, y: 9, w: 2, h: 1 });
  const restored = parseClipboardPayload(serialiseClipboard(copied));
  assert.ok(restored);
  assert.deepEqual({ width: restored.width, height: restored.height, x: restored.x, y: restored.y }, { width: 2, height: 1, x: 7, y: 9 });
  assert.deepEqual([...restored.pixels], [12, 34, 56, 255, 200, 100, 50, 0]);
  assert.ok(sameFragment(copied, restored));
});

test('shared clipboard storage allows a second editor tab to read the selection', () => {
  const items = new Map();
  const storage = { setItem: (key, value) => items.set(key, value), getItem: key => items.get(key) ?? null };
  const source = blankTexture(); source.set([1, 2, 3, 4], pixelOffset(2, 3));
  const fragment = captureSelection(source, { x: 2, y: 3, w: 1, h: 1 });
  assert.equal(writeSharedClipboard(fragment, storage), true);
  assert.ok(items.has(SELECTION_CLIPBOARD_KEY));
  const received = readSharedClipboard(storage);
  assert.ok(received);
  assert.ok(sameFragment(fragment, received));
  assert.equal(received.x, 2);
  assert.equal(received.y, 3);
});

test('paste restores exact RGBA pixels at the requested target coordinate', () => {
  const source = blankTexture();
  source.set([250, 120, 40, 255], pixelOffset(10, 12));
  source.set([0, 0, 0, 0], pixelOffset(11, 12));
  const fragment = captureSelection(source, { x: 10, y: 12, w: 2, h: 1 });
  const target = blankTexture([80, 90, 100, 255]);
  const selection = pasteFragment(target, fragment, { x: 20, y: 21 });
  assert.deepEqual(selection, { x: 20, y: 21, w: 2, h: 1 });
  assert.deepEqual([...target.slice(pixelOffset(20, 21), pixelOffset(20, 21) + 4)], [250, 120, 40, 255]);
  assert.deepEqual([...target.slice(pixelOffset(21, 21), pixelOffset(21, 21) + 4)], [0, 0, 0, 0]);
  assert.deepEqual([...target.slice(pixelOffset(19, 21), pixelOffset(19, 21) + 4)], [80, 90, 100, 255]);
});

test('a copied selection can be pasted into a different skin project', () => {
  const items = new Map();
  const storage = { setItem: (key, value) => items.set(key, value), getItem: key => items.get(key) ?? null };
  const sourceSkin = blankTexture();
  sourceSkin.set([45, 90, 135, 255], pixelOffset(12, 14));
  const fragment = captureSelection(sourceSkin, { x: 12, y: 14, w: 1, h: 1 });
  assert.equal(writeSharedClipboard(fragment, storage), true);

  const destinationSkin = blankTexture();
  const selection = pasteFragment(destinationSkin, readSharedClipboard(storage), { x: 30, y: 31 });
  assert.deepEqual(selection, { x: 30, y: 31, w: 1, h: 1 });
  assert.deepEqual([...destinationSkin.slice(pixelOffset(30, 31), pixelOffset(30, 31) + 4)], [45, 90, 135, 255]);
});

test('pasting a selection against the bottom-right edge is clipped to the texture', () => {
  const fragment = { version: 1, width: 2, height: 2, x: 63, y: 63, pixels: new Uint8Array(16).fill(255) };
  const target = blankTexture();
  assert.deepEqual(pasteFragment(target, fragment), { x: 63, y: 63, w: 1, h: 1 });
  assert.deepEqual([...target.slice(pixelOffset(63, 63), pixelOffset(63, 63) + 4)], [255, 255, 255, 255]);
});

test('painting and flood fill do not stop at selection edges', () => {
  const pixels = blankTexture([5, 6, 7, 255]);
  drawLine(pixels, { x: 1, y: 1 }, { x: 5, y: 1 }, { color: [40, 50, 60, 255], size: 1, mode: 'pencil', selection: { x: 1, y: 1, w: 1, h: 1 } });
  assert.deepEqual([...pixels.slice(pixelOffset(5, 1), pixelOffset(5, 1) + 4)], [40, 50, 60, 255]);
  assert.equal(floodFill(pixels, 0, 10, [90, 80, 70, 255], 0, { x: 0, y: 10, w: 1, h: 1 }), true);
  assert.deepEqual([...pixels.slice(pixelOffset(63, 10), pixelOffset(63, 10) + 4)], [90, 80, 70, 255]);
});

test('invalid or corrupted shared clipboard data is ignored', () => {
  assert.equal(parseClipboardPayload('{broken-json'), null);
  assert.equal(parseClipboardPayload(JSON.stringify({ version: 1, width: 65, height: 1, rgba: 'AA==' })), null);
});
