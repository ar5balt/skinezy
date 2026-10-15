import { readFileSync } from 'node:fs';
import { decodePng } from '../src/texture.js';
const f = process.argv[2];
const b = readFileSync(f);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const { width, height, pixels } = await decodePng(ab);
console.log(`${f}: ${width}x${height}`);
const counts = new Map();
for (let i=0;i<pixels.length;i+=4){
  const k=`${pixels[i]},${pixels[i+1]},${pixels[i+2]},${pixels[i+3]}`;
  counts.set(k,(counts.get(k)||0)+1);
}
const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
console.log('top colors:');
for(const [k,n] of top) console.log('  ',k,'x'+n);
