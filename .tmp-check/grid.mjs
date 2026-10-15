import { readFileSync } from 'node:fs';
import { decodePng } from '../src/texture.js';
const f = process.argv[2];
const b = readFileSync(f);
const { width, height, pixels } = await decodePng(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
// assume integer scale of 64x64
const sc = width/64;
console.log(`${f}: ${width}x${height} scale=${sc}`);
// compact legend of quantized colors
const q = (r,g,b,a)=> a===0 ? '....' : [r,g,b].map(v=>Math.round(v/64)).join('');
const legend = new Map();
const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function sym(x,y){
  const i=((y*sc)*width + (x*sc))*4;
  const k=q(pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]);
  if(!legend.has(k)) legend.set(k, ch[legend.size % ch.length]);
  return legend.get(k);
}
let out='';
for(let y=0;y<64;y++){
  let row='';
  for(let x=0;x<64;x++) row+=sym(x,y);
  out+=String(y).padStart(2,'0')+' '+row+'\n';
}
console.log(out);
console.log('legend:');
for(const [k,c] of legend) console.log('  ',c,k);
