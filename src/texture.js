// Exact RGBA pixel buffer utilities and a small standards-based PNG codec.
import { skinRegions } from './minecraft/uvMaps.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function blankTexture(color = [0, 0, 0, 0]) {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  return pixels;
}

export function createDefaultSkin(model = 'classic') {
  const pixels = blankTexture();
  const regions = skinRegions(model);
  const alex = model === 'slim';
  const skin = alex ? [235, 190, 151, 255] : [198, 146, 112, 255];
  const hair = alex ? [184, 111, 68, 255] : [69, 42, 29, 255];
  const shirt = alex ? [101, 145, 79, 255] : [55, 112, 166, 255];
  const shirtShade = alex ? [73, 111, 58, 255] : [39, 83, 130, 255];
  const pants = alex ? [104, 73, 48, 255] : [54, 48, 105, 255];
  const boot = alex ? [64, 48, 38, 255] : [74, 49, 38, 255];
  const eye = alex ? [76, 135, 75, 255] : [65, 105, 160, 255];
  const paint = (rect, color, inset = 0) => {
    const [x, y, x2, y2] = rect;
    for (let py = y + inset; py < y2 - inset; py++) for (let px = x + inset; px < x2 - inset; px++) {
      pixels.set(color, pixelOffset(px, py));
    }
  };
  const face = (part, faceIndex, color) => paint(regions[part][faceIndex], color);

  for (const part of ['head']) {
    regions[part].forEach((_, i) => face(part, i, skin));
  }
  face('head', 2, hair);
  face('head', 5, hair);
  paint(regions.head[0], hair, 0);
  paint(regions.head[1], hair, 0);
  const [fx, fy, fx2] = regions.head[4];
  paint([fx, fy, fx2, fy + 2], hair);
  paint([fx, fy + 2, fx + 2, fy + 3], hair);
  paint([fx2 - 2, fy + 2, fx2, fy + 3], hair);
  paint([fx + 1, fy + 4, fx + 3, fy + 5], [245, 245, 245, 255]);
  paint([fx2 - 3, fy + 4, fx2 - 1, fy + 5], [245, 245, 245, 255]);
  paint([fx + 2, fy + 4, fx + 3, fy + 5], eye);
  paint([fx2 - 2, fy + 4, fx2 - 1, fy + 5], eye);
  paint([fx + 3, fy + 6, fx2 - 3, fy + 7], [132, 77, 57, 255]);

  for (const part of ['body']) regions[part].forEach((_, i) => face(part, i, shirt));
  for (const part of ['rightArm', 'leftArm']) {
    regions[part].forEach((rect, i) => {
      face(part, i, shirt);
      const [x, y, x2, y2] = rect;
      paint([x, y + Math.max(1, y2 - y - 3), x2, y2], skin);
    });
  }
  for (const part of ['rightLeg', 'leftLeg']) {
    regions[part].forEach((rect, i) => {
      face(part, i, pants);
      const [x, , x2, y2] = rect;
      paint([x, y2 - 2, x2, y2], boot);
    });
  }

  const [bx, by, bx2, by2] = regions.body[4];
  paint([bx + 2, by, bx2 - 2, by + 2], skin);
  paint([bx + 3, by + 2, bx + 5, by + 4], [190, 150, 84, 255]);
  paint([bx, by + 5, bx + 1, by2], shirtShade);
  paint([bx2 - 1, by + 5, bx2, by2], shirtShade);

  for (const part of ['hat', 'jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants']) {
    const faces = regions[part];
    if (part === 'hat') {
      faces.forEach((rect, i) => {
        if (i === 2 || i === 5) paint(rect, hair);
        else if (i === 4 || i === 0 || i === 1) {
          const [x, y, x2, y2] = rect;
          paint([x, y, x2, Math.min(y2, y + 2)], hair);
        }
      });
    } else if (part === 'jacket') {
      faces.forEach(rect => paint(rect, shirtShade, 1));
    } else {
      faces.forEach(rect => paint(rect, part.includes('Pants') ? pants : shirtShade, 1));
    }
  }
  return pixels;
}

export function clonePixels(pixels) { return new Uint8Array(pixels); }
export function pixelOffset(x, y, width = 64) { return (y * width + x) * 4; }
export function samePixel(a, b, tolerance = 0) {
  for (let c = 0; c < 4; c++) if (Math.abs(a[c] - b[c]) > tolerance) return false;
  return true;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!PNG_SIGNATURE.every((v, i) => bytes[i] === v)) throw new Error('This file does not have a valid PNG signature.');
  const view = new DataView(buffer);
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0, palette = null, transparency = null;
  const idat = [];
  for (let p = 8; p < bytes.length;) {
    if (p + 12 > bytes.length) throw new Error('PNG file is truncated.');
    const length = view.getUint32(p); const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + length);
    if (p + 12 + length > bytes.length) throw new Error('PNG chunk is truncated.');
    if (view.getUint32(p + 8 + length) !== crc32(bytes.subarray(p + 4, p + 8 + length))) throw new Error(`PNG ${type} chunk failed its checksum.`);
    if (type === 'IHDR') { width = view.getUint32(p + 8); height = view.getUint32(p + 12); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    if (type === 'PLTE') palette = new Uint8Array(data);
    if (type === 'tRNS') transparency = new Uint8Array(data);
    if (type === 'IDAT') idat.push(new Uint8Array(data));
    p += 12 + length;
    if (type === 'IEND') break;
  }
  if (!width || !height || width * height > 16_777_216) throw new Error('Unsupported or invalid image dimensions.');
  if (interlace !== 0 || bitDepth !== 8 || ![0, 2, 3, 4, 6].includes(colorType)) throw new Error('PNG must use 8-bit, non-interlaced color (RGB, RGBA, grayscale, or palette).');
  const channels = ({0:1, 2:3, 3:1, 4:2, 6:4})[colorType];
  const compressedLength = idat.reduce((n, a) => n + a.length, 0), compressed = new Uint8Array(compressedLength);
  let cursor = 0; for (const chunk of idat) { compressed.set(chunk, cursor); cursor += chunk.length; }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error('PNG pixel data is incomplete or unsupported.');
  const scan = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], sourceStart = y * (stride + 1) + 1, rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[sourceStart + x], left = x >= channels ? scan[rowStart + x - channels] : 0;
      const up = y ? scan[rowStart + x - stride] : 0, upperLeft = y && x >= channels ? scan[rowStart + x - stride - channels] : 0;
      scan[rowStart + x] = (value + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0)) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < scan.length; i += channels, j += 4) {
    if (colorType === 6) rgba.set(scan.subarray(i, i + 4), j);
    else if (colorType === 2) { rgba[j] = scan[i]; rgba[j+1] = scan[i+1]; rgba[j+2] = scan[i+2]; rgba[j+3] = 255; }
    else if (colorType === 0) rgba[j] = rgba[j+1] = rgba[j+2] = scan[i], rgba[j+3] = 255;
    else if (colorType === 4) rgba[j] = rgba[j+1] = rgba[j+2] = scan[i], rgba[j+3] = scan[i+1];
    else { const k = scan[i], at = k * 3; if (!palette || at + 2 >= palette.length) throw new Error('Invalid indexed-color PNG.'); rgba[j] = palette[at]; rgba[j+1] = palette[at+1]; rgba[j+2] = palette[at+2]; rgba[j+3] = transparency && k < transparency.length ? transparency[k] : 255; }
  }
  return { width, height, pixels: rgba };
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(data.length + 12), v = new DataView(out.buffer);
  v.setUint32(0, data.length); for (let i=0;i<4;i++) out[i+4] = type.charCodeAt(i); out.set(data, 8);
  v.setUint32(data.length+8, crc32(out.subarray(4, data.length+8))); return out;
}
function concat(arrays) { const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0)); let p=0; for (const a of arrays) { out.set(a,p); p+=a.length; } return out; }
export async function encodePng(pixels, width = 64, height = 64) {
  if (pixels.length !== width * height * 4) throw new Error('Pixel buffer size does not match image dimensions.');
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y=0; y<height; y++) raw.set(pixels.subarray(y*width*4, (y+1)*width*4), y*(width*4+1)+1);
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0,width); dv.setUint32(4,height); ihdr[8]=8; ihdr[9]=6;
  return new Blob([concat([new Uint8Array(PNG_SIGNATURE), chunk('IHDR',ihdr), chunk('IDAT',compressed), chunk('IEND',new Uint8Array())])], {type:'image/png'});
}

export function pixelate(canvas, pixels, scale = 1) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const image = ctx.createImageData(64,64); image.data.set(pixels);
  const temp = document.createElement('canvas'); temp.width = temp.height = 64; temp.getContext('2d').putImageData(image,0,0);
  ctx.imageSmoothingEnabled = false; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(temp,0,0,64*scale,64*scale);
}
