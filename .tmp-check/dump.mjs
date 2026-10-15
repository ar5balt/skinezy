import { readFileSync } from 'node:fs';
import { decodePng } from '../src/texture.js';
const CH = ' .:-=+*#%@';
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  try {
    const { width, height, pixels } = await decodePng(ab);
    console.log(`\n=== ${f}: ${width} x ${height} ===`);
    // distinct colors
    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const k = `${pixels[i]},${pixels[i+1]},${pixels[i+2]},${pixels[i+3]}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    console.log('distinct colors:', counts.size);
    console.log('top colors:', [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>k+' x'+n).join(' | '));
    if (width === 64 && height === 64) {
      // alpha/color map, 64 rows
      console.log('--- atlas map (each char = 1px; letters = quantized color, . = transparent) ---');
      for (let y = 0; y < 64; y++) {
        let row = '';
        for (let x = 0; x < 64; x++) {
          const i = (y*64+x)*4;
          if (!pixels[i+3]) row += '.';
          else row += CH[Math.min(9, 1+Math.floor((pixels[i]+pixels[i+1]+pixels[i+2])/86))];
        }
        console.log(String(y).padStart(2,'0'), row);
      }
    }
  } catch (e) { console.log(f, 'ERROR', e.message); }
}
