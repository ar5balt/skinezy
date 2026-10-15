import { SKIN_UV_REGIONS, skinRegions, boxFaceRegions } from '../src/minecraft/uvMaps.js';
import { boxWithAtlasUV } from '../src/preview3d/skinPreview.js';

// Faithful port of skinview3d setUVs() (itself a port of Minecraft's ModelBox).
function refUVs(u,v,w,h,d){
  const f=(x1,y1,x2,y2)=>[[x1/64,1-y2/64],[x2/64,1-y2/64],[x2/64,1-y1/64],[x1/64,1-y1/64]];
  const top=f(u+d,v,u+w+d,v+d);
  const bottom=f(u+w+d,v,u+2*w+d,v+d);
  const left=f(u,v+d,u+d,v+d+h);
  const front=f(u+d,v+d,u+w+d,v+d+h);
  const right=f(u+w+d,v+d,u+w+2*d,v+h+d);
  const back=f(u+w+2*d,v+d,u+2*w+2*d,v+h+d);
  const sel=[];
  for(const a of [[right[3],right[2],right[0],right[1]],
                  [left[3],left[2],left[0],left[1]],
                  [top[3],top[2],top[0],top[1]],
                  [bottom[0],bottom[1],bottom[3],bottom[2]],
                  [front[3],front[2],front[0],front[1]],
                  [back[3],back[2],back[0],back[1]]]) for(const p of a) sel.push(p);
  return sel.flat();
}
const PARTS=[
 ['head',0,0,8,8,8],['hat',32,0,8,8,8],['body',16,16,8,12,4],['jacket',16,32,8,12,4],
 ['rightArm',40,16,4,12,4],['rightSleeve',40,32,4,12,4],['leftArm',32,48,4,12,4],
 ['leftSleeve',48,48,4,12,4],['rightLeg',0,16,4,12,4],['rightPants',0,32,4,12,4],
 ['leftLeg',16,48,4,12,4],['leftPants',0,48,4,12,4]];
const FACE=['+X','-X','+Y','-Y','+Z','-Z'];
let total=0;
for(const [key,u,v,w,h,d] of PARTS){
  const ref=refUVs(u,v,w,h,d);
  const geo=boxWithAtlasUV(w,h,d,SKIN_UV_REGIONS[key]);
  const uv=geo.attributes.uv; const bad=[];
  for(let i=0;i<24;i++){
    const a=[+uv.getX(i).toFixed(5),+uv.getY(i).toFixed(5)];
    const b=[+ref[i*2].toFixed(5),+ref[i*2+1].toFixed(5)];
    if(a[0]!==b[0]||a[1]!==b[1]) bad.push(`    v${i} ${FACE[(i/4)|0]}: ours ${a}  ref ${b}`);
  }
  total+=bad.length;
  console.log(`${bad.length?'FAIL':'ok  '} ${key.padEnd(12)} ${bad.length?bad.length+'/24':''}`);
  bad.forEach(l=>console.log(l));
  // also verify region rectangles match the reference packing
  const expect=[[u+w+d,v+d,u+w+2*d,v+d+h],[u,v+d,u+d,v+d+h],[u+d,v,u+w+d,v+d],[u+w+d,v,u+2*w+d,v+d],[u+d,v+d,u+w+d,v+d+h],[u+w+2*d,v+d,u+2*w+2*d,v+h+d]];
  const got=boxFaceRegions(u,v,w,h,d);
  if(JSON.stringify(expect)!==JSON.stringify(got)) console.log(`    REGION MISMATCH\n      expect ${JSON.stringify(expect)}\n      got    ${JSON.stringify(got)}`);
  geo.dispose();
}
console.log('total differing vertices:',total);
// slim: verify left sleeve/arm regions shift consistently
const slim=skinRegions('slim');
console.log('slim leftArm  ',JSON.stringify(slim.leftArm));
console.log('slim leftSleeve',JSON.stringify(slim.leftSleeve));
