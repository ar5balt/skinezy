import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTexture, decodePng, encodePng } from '../src/texture.js';
import { drawLine, floodFill, filterPixels, transformSelection, extractFragment, clearRegion, blitFragment } from '../src/operations.js';
import { SKIN_UV_REGIONS, uvBoundsValid, limbWidth, skinRegions } from '../src/minecraft/uvMaps.js';
import { rgbaTopToBottom } from '../src/preview3d/pixelRows.js';
import { boxWithAtlasUV } from '../src/preview3d/skinPreview.js';

test('pencil line writes exact pixel coordinates and leaves the rest transparent',()=>{
  const pixels=blankTexture();
  drawLine(pixels,{x:1,y:3},{x:4,y:3},{color:[12,34,56,255],size:1,mode:'pencil',noise:0,seed:1});
  for(let x=0;x<64;x++) assert.equal(pixels[(3*64+x)*4+3],x>=1&&x<=4?255:0);
  assert.deepEqual([...pixels.slice((3*64+2)*4,(3*64+2)*4+4)],[12,34,56,255]);
});

test('flood fill changes a connected component once and respects selection bounds',()=>{
  const pixels=blankTexture([4,5,6,255]);
  for(let y=0;y<64;y++) pixels.set([9,9,9,255],(y*64+8)*4);
  assert.equal(floodFill(pixels,2,2,[100,0,0,255],0,{x:0,y:0,w:6,h:64}),true);
  assert.deepEqual([...pixels.slice((2*64+2)*4,(2*64+2)*4+4)],[100,0,0,255]);
  assert.deepEqual([...pixels.slice((2*64+8)*4,(2*64+8)*4+4)],[9,9,9,255]);
  assert.deepEqual([...pixels.slice((2*64+10)*4,(2*64+10)*4+4)],[4,5,6,255]);
});

test('filters preserve alpha and do not reveal fully transparent RGB pixels',()=>{
  const pixels=blankTexture();pixels.set([30,80,120,96],0);pixels.set([12,34,56,0],4);
  const out=filterPixels(pixels,'invert');
  assert.deepEqual([...out.slice(0,4)],[225,175,135,96]);
  assert.deepEqual([...out.slice(4,8)],[12,34,56,0]);
});

test('brush noise is stable for the same seed and pixel coordinates',()=>{
  const options={color:[120,100,90,180],size:1,mode:'brush',noise:15,seed:12345};
  const a=blankTexture(),b=blankTexture();drawLine(a,{x:7,y:9},{x:7,y:9},options);drawLine(b,{x:7,y:9},{x:7,y:9},options);
  assert.deepEqual([...a],[...b]);assert.equal(a[(9*64+7)*4+3],180);
});

test('lighten and darken change HSV value while preserving hue, saturation and alpha',()=>{
  const pixels=blankTexture();pixels.set([200,100,50,128],0);
  drawLine(pixels,{x:0,y:0},{x:0,y:0},{color:[0,0,0,255],size:1,mode:'lighten',seed:20});
  assert.deepEqual([...pixels.slice(0,4)],[211,106,53,128]);
  drawLine(pixels,{x:0,y:0},{x:0,y:0},{color:[0,0,0,255],size:1,mode:'darken',seed:20});
  assert.deepEqual([...pixels.slice(0,4)],[169,85,42,128]);
  pixels.set([12,34,56,0],4);
  drawLine(pixels,{x:1,y:0},{x:1,y:0},{color:[0,0,0,255],size:1,mode:'lighten',seed:30});
  assert.deepEqual([...pixels.slice(4,8)],[12,34,56,0]);
});

test('parameterized filters preserve alpha and selection bounds',()=>{
  const pixels=blankTexture([80,40,20,255]);pixels.set([10,20,30,77],0);
  const out=filterPixels(pixels,'brightness',20,{x:0,y:0,w:1,h:1});
  assert.deepEqual([...out.slice(0,4)],[61,71,81,77]);
  assert.deepEqual([...out.slice(4,8)],[80,40,20,255]);
  const poster=filterPixels(pixels,'posterize',4,{x:0,y:0,w:1,h:1});
  assert.deepEqual([...poster.slice(0,4)],[0,0,0,77]);
});

test('selection transforms mirror and rotate RGBA fragments without changing outside pixels',()=>{
  const pixels=blankTexture([9,8,7,255]);pixels.set([255,0,0,255],(2*64+3)*4);pixels.set([0,255,0,255],(2*64+4)*4);pixels.set([0,0,255,255],(3*64+3)*4);
  const flipped=transformSelection(pixels,{x:3,y:2,w:2,h:2},'flipH');
  assert.deepEqual([...flipped.pixels.slice((2*64+3)*4,(2*64+4)*4)],[0,255,0,255]);
  assert.deepEqual([...flipped.pixels.slice((2*64+2)*4,(2*64+3)*4)],[9,8,7,255]);
  const rotated=transformSelection(pixels,{x:3,y:2,w:2,h:2},'rotateCW');
  assert.deepEqual(rotated.selection,{x:3,y:2,w:2,h:2});
  assert.deepEqual([...rotated.pixels.slice((2*64+4)*4,(2*64+5)*4)],[255,0,0,255]);
  assert.throws(()=>transformSelection(pixels,{x:63,y:0,w:1,h:2},'rotateCW'),/extend beyond/);
});

test('PNG encode and decode preserve all RGBA bytes including RGB under zero alpha',async()=>{
  const pixels=blankTexture();pixels.set([9,31,77,0],0);pixels.set([200,100,40,128],4);pixels.set([255,255,255,255],pixels.length-4);
  const blob=await encodePng(pixels);const decoded=await decodePng(await blob.arrayBuffer());
  assert.equal(decoded.width,64);assert.equal(decoded.height,64);assert.deepEqual(decoded.pixels,pixels);
});

test('all configured Minecraft cube UV faces stay within the 64×64 atlas',()=>{
  assert.equal(uvBoundsValid(),true);
  assert.equal(Object.keys(SKIN_UV_REGIONS).length,12);
  assert.equal(limbWidth('classic'),4);assert.equal(limbWidth('slim'),3);
});

test('head UV faces use the correct right, left, top, front and back atlas regions',()=>{
  assert.deepEqual(SKIN_UV_REGIONS.head,[[16,8,24,16],[0,8,8,16],[8,0,16,8],[16,0,24,8],[8,8,16,16],[24,8,32,16]]);
  const geometry=boxWithAtlasUV(8,8,8,SKIN_UV_REGIONS.head),uv=geometry.attributes.uv;
  const at=(vertex)=>[+uv.getX(vertex).toFixed(5),+uv.getY(vertex).toFixed(5)];
  assert.deepEqual(at(0),[16/64,1-8/64]); // +X top-back edge
  assert.deepEqual(at(5),[8/64,1-8/64]); // -X top-front edge
  assert.deepEqual(at(8),[8/64,1]); // +Y back edge sits on the tile's top row
  assert.deepEqual(at(12),[16/64,1-8/64]); // -Y front edge sits on the tile's bottom row
  assert.deepEqual(at(16),[8/64,1-8/64]); // +Z front-top-left
  assert.deepEqual(at(20),[24/64,1-8/64]); // -Z back-top-right
  geometry.dispose();
});

test('the left arm outer layer samples its own atlas region, not the right arm region',()=>{
  assert.notDeepEqual(SKIN_UV_REGIONS.leftSleeve,SKIN_UV_REGIONS.rightSleeve);
  assert.deepEqual(SKIN_UV_REGIONS.leftSleeve,[[56,52,60,64],[48,52,52,64],[52,48,56,52],[56,48,60,52],[52,52,56,64],[60,52,64,64]]);
  // Every left-arm face must live in the lower-left quadrant of the atlas, and
  // the sleeve column must start to the right of the base arm column.
  for(const [x,y,x2,y2] of SKIN_UV_REGIONS.leftArm) assert.ok(y>=48&&y2<=64&&x2<=48,`left arm face ${x},${y} is outside its region`);
  for(const [x,y,x2,y2] of SKIN_UV_REGIONS.leftSleeve) assert.ok(y>=48&&y2<=64&&x>=48,`left sleeve face ${x},${y} is outside its region`);
});

test('slim arms shrink the arm tiles while leaving the other parts untouched',()=>{
  const classic=skinRegions('classic'),slim=skinRegions('slim');
  assert.deepEqual(slim.rightArm,[[47,20,51,32],[40,20,44,32],[44,16,47,20],[47,16,50,20],[44,20,47,32],[51,20,54,32]]);
  assert.deepEqual(slim.leftArm,[[39,52,43,64],[32,52,36,64],[36,48,39,52],[39,48,42,52],[36,52,39,64],[43,52,46,64]]);
  assert.deepEqual(slim.leftSleeve,[[55,52,59,64],[48,52,52,64],[52,48,55,52],[55,48,58,52],[52,52,55,64],[59,52,62,64]]);
  for(const part of ['head','hat','body','jacket','rightLeg','rightPants','leftLeg','leftPants'])
    assert.deepEqual(slim[part],classic[part],`${part} must not depend on the arm model`);
  assert.equal(uvBoundsValid(slim),true);
});

test('3D atlas upload reverses row order while preserving each RGBA pixel',()=>{
  const pixels=blankTexture();pixels.set([1,2,3,4],0);pixels.set([9,8,7,6],(63*64)*4);
  const upload=rgbaTopToBottom(pixels);
  assert.deepEqual([...upload.slice((63*64)*4,(63*64)*4+4)],[1,2,3,4]);
  assert.deepEqual([...upload.slice(0,4)],[9,8,7,6]);
});

test('extractFragment cuts and blitFragment moves fragment to new coordinates without distorting',()=>{
  const pixels=blankTexture();
  // Draw a 3x3 block at (10, 10)
  for(let y=10;y<13;y++)for(let x=10;x<13;x++){
    pixels.set([100,150,200,255],(y*64+x)*4);
  }
  const selection={x:10,y:10,w:3,h:3};
  const fragment=extractFragment(pixels,selection);
  assert.equal(fragment.length, 3*3*4);
  assert.deepEqual([...fragment.slice(0,4)],[100,150,200,255]);

  clearRegion(pixels,selection);
  // Source area is now transparent
  assert.deepEqual([...pixels.slice((10*64+10)*4,(10*64+10)*4+4)],[0,0,0,0]);

  // Blit fragment to (20, 30)
  blitFragment(pixels,fragment,3,3,20,30);
  assert.deepEqual([...pixels.slice((30*64+20)*4,(30*64+20)*4+4)],[100,150,200,255]);
  assert.deepEqual([...pixels.slice((32*64+22)*4,(32*64+22)*4+4)],[100,150,200,255]);
});

test('blitFragment with blend=true does not overwrite background pixels with transparent fragment pixels',()=>{
  const target=blankTexture();
  // Fill target with green
  for(let y=0;y<5;y++)for(let x=0;x<5;x++)target.set([0,255,0,255],(y*64+x)*4);
  // Fragment has 1 red pixel and 3 transparent pixels
  const fragment=new Uint8Array(2*2*4);
  fragment.set([255,0,0,255],0); // (0,0) is red, rest (0,1),(1,0),(1,1) are 0 alpha
  blitFragment(target,fragment,2,2,0,0,true);
  // (0,0) should be red
  assert.deepEqual([...target.slice(0,4)],[255,0,0,255]);
  // (1,0) should still be original green, not overwritten by transparent 0
  assert.deepEqual([...target.slice(4,8)],[0,255,0,255]);
  // (0,1) should still be green
  assert.deepEqual([...target.slice(64*4,64*4+4)],[0,255,0,255]);
});


