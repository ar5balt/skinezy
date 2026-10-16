import { pixelOffset } from './texture.js';

export const SELECTION_CLIPBOARD_KEY = 'skinezy.selectionClipboard.v1';

export function captureSelection(pixels, selection) {
  if (!selection) throw new Error('Select a texture area first.');
  const { x, y, w, h } = selection;
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > 64 || y + h > 64) {
    throw new Error('The selection is outside the 64 × 64 texture.');
  }
  const fragment = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    fragment.set(pixels.subarray(pixelOffset(x, y + row), pixelOffset(x + w, y + row)), row * w * 4);
  }
  return { version: 1, width: w, height: h, x, y, pixels: fragment };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(start + 0x4000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function serialiseClipboard(fragment) {
  validateFragment(fragment);
  return JSON.stringify({
    version: 1,
    width: fragment.width,
    height: fragment.height,
    x: fragment.x ?? 0,
    y: fragment.y ?? 0,
    rgba: bytesToBase64(fragment.pixels),
  });
}

export function parseClipboardPayload(raw) {
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || typeof data.rgba !== 'string') return null;
    const pixels = base64ToBytes(data.rgba);
    const fragment = { version: 1, width: data.width, height: data.height, x: data.x, y: data.y, pixels };
    validateFragment(fragment);
    return fragment;
  } catch {
    return null;
  }
}

function validateFragment(fragment) {
  if (!fragment || !Number.isInteger(fragment.width) || !Number.isInteger(fragment.height)
    || fragment.width < 1 || fragment.height < 1 || fragment.width > 64 || fragment.height > 64
    || fragment.pixels?.length !== fragment.width * fragment.height * 4) {
    throw new Error('Clipboard does not contain a valid skin selection.');
  }
  if (fragment.x !== undefined && (!Number.isInteger(fragment.x) || fragment.x < 0 || fragment.x > 63)) {
    throw new Error('Clipboard selection has an invalid X coordinate.');
  }
  if (fragment.y !== undefined && (!Number.isInteger(fragment.y) || fragment.y < 0 || fragment.y > 63)) {
    throw new Error('Clipboard selection has an invalid Y coordinate.');
  }
}

export function writeSharedClipboard(fragment, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(SELECTION_CLIPBOARD_KEY, serialiseClipboard(fragment));
    return true;
  } catch {
    return false;
  }
}

export function readSharedClipboard(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return null;
    const raw = target.getItem(SELECTION_CLIPBOARD_KEY);
    return raw ? parseClipboardPayload(raw) : null;
  } catch {
    return null;
  }
}

export function sameFragment(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.pixels.length !== b.pixels.length) return false;
  for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) return false;
  return true;
}

// Replaces the destination rectangle with the copied RGBA bytes, including alpha.
// Pixels outside the destination texture are clipped instead of throwing.
export function pasteFragment(targetPixels, fragment, position = null) {
  validateFragment(fragment);
  const requestedX = position?.x ?? fragment.x ?? 0;
  const requestedY = position?.y ?? fragment.y ?? 0;
  const x = Math.max(0, Math.min(63, Math.trunc(requestedX)));
  const y = Math.max(0, Math.min(63, Math.trunc(requestedY)));
  const width = Math.min(fragment.width, 64 - x);
  const height = Math.min(fragment.height, 64 - y);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const source = (row * fragment.width + col) * 4;
      targetPixels.set(fragment.pixels.subarray(source, source + 4), pixelOffset(x + col, y + row));
    }
  }
  return { x, y, w: width, h: height };
}
