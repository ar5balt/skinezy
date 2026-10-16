import { clonePixels, pixelOffset, samePixel } from './texture.js';

function insideRegions(x,y,regions){
  return !regions||regions.some(({x:rx,y:ry,w,h})=>x>=rx&&y>=ry&&x<rx+w&&y<ry+h);
}

export function paintStamp(pixels, x, y, color, size, mode = 'pencil', noise = 0, seed = 1, bounds = null, allowedRegions = null) {
  const start = -Math.floor((size-1)/2), end = start + size;
  for (let py=y+start; py<y+end; py++) for (let px=x+start; px<x+end; px++) {
    if (px<0||py<0||px>=64||py>=64) continue;
    if (bounds&&(px<bounds.x||py<bounds.y||px>=bounds.x+bounds.w||py>=bounds.y+bounds.h)) continue;
    if(!insideRegions(px,py,allowedRegions))continue;
    const i=pixelOffset(px,py), c=mode==='eraser' ? [pixels[i],pixels[i+1],pixels[i+2],0] : color;
    if (mode==='lighten'||mode==='darken') {
      if (!pixels[i+3]) continue;
      const amount=Math.max(0,Math.min(100,seed))/100;
      for(let channel=0;channel<3;channel++){
        const value=pixels[i+channel];
        pixels[i+channel]=Math.round(mode==='lighten'?value+(255-value)*amount:value*(1-amount));
      }
      continue;
    }
    if (mode==='brush'&&noise) {
      let s=(seed ^ Math.imul(px+1,374761393) ^ Math.imul(py+1,668265263))>>>0;
      s=(Math.imul(s ^ s>>>13,1274126177))>>>0; const offset=(s% (noise*2+1))-noise;
      const [h, sat, val]=rgbToHsv(...color); const varied=h+offset/180, v=Math.max(0,Math.min(1,val+offset/255));
      const [r,g,b]=hsvToRgb(varied,sat,v); pixels.set([r,g,b,color[3]],i);
    } else pixels.set(c,i);
  }
}

export function drawLine(pixels, from, to, options) {
  let x0=from.x, y0=from.y, x1=to.x, y1=to.y;
  const dx=Math.abs(x1-x0), sx=x0<x1?1:-1, dy=-Math.abs(y1-y0), sy=y0<y1?1:-1; let err=dx+dy;
  while(true) { paintStamp(pixels,x0,y0,options.color,options.size,options.mode,options.noise,options.seed,options.bounds,options.allowedRegions); if(x0===x1&&y0===y1) break; const e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;} }
}

export function floodFill(pixels, x, y, color, tolerance=0, _selection=null, bounds={x:0,y:0,w:64,h:64}, allowedRegions=null) {
  const minX=Math.max(0,bounds.x),minY=Math.max(0,bounds.y),maxX=Math.min(64,bounds.x+bounds.w),maxY=Math.min(64,bounds.y+bounds.h);
  if(x<minX||y<minY||x>=maxX||y>=maxY||!insideRegions(x,y,allowedRegions))return false;
  const start=pixelOffset(x,y); const target=pixels.slice(start,start+4); if (target.every((v,i)=>v===color[i])) return false;
  const allowed=(px,py)=>px>=minX&&py>=minY&&px<maxX&&py<maxY&&insideRegions(px,py,allowedRegions);
  const visited=new Uint8Array(4096), stack=[[x,y]];
  while(stack.length){const [cx,cy]=stack.pop(); if(!allowed(cx,cy))continue; const pos=cy*64+cx; if(visited[pos])continue; visited[pos]=1; const at=pos*4;
    if(!samePixel(pixels.subarray(at,at+4),target,tolerance))continue; pixels.set(color,at);
    stack.push([cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]);
  } return true;
}

export function transformSelection(pixels, selection, operation) {
  if (!selection || !['flipH','flipV','rotateCW'].includes(operation)) throw new Error('A selection and a supported transform are required.');
  const {x,y,w,h}=selection,newW=operation==='rotateCW'?h:w,newH=operation==='rotateCW'?w:h;
  if(x+newW>64||y+newH>64)throw new Error('The transformed selection would extend beyond the texture.');
  const result=clonePixels(pixels),fragment=new Uint8Array(w*h*4);
  for(let sy=0;sy<h;sy++)for(let sx=0;sx<w;sx++)fragment.set(pixels.subarray(pixelOffset(x+sx,y+sy),pixelOffset(x+sx,y+sy)+4),(sy*w+sx)*4);
  for(let sy=0;sy<h;sy++)for(let sx=0;sx<w;sx++)result.set([0,0,0,0],pixelOffset(x+sx,y+sy));
  for(let sy=0;sy<h;sy++)for(let sx=0;sx<w;sx++){const dx=operation==='flipH'?w-1-sx:operation==='rotateCW'?h-1-sy:sx,dy=operation==='flipV'?h-1-sy:operation==='rotateCW'?sx:sy;const from=(sy*w+sx)*4;result.set(fragment.subarray(from,from+4),pixelOffset(x+dx,y+dy));}
  return {pixels:result,selection:{x,y,w:newW,h:newH}};
}

export function filterPixels(source, type, amount=100, selection=null, colorize=[93,124,255]) {
  const out=clonePixels(source), mix=['brightness','contrast','saturation','hue','warm','cool','posterize'].includes(type)?1:Math.max(0,Math.min(100,Math.abs(amount)))/100;
  for(let i=0;i<out.length;i+=4){const x=(i/4)%64,y=Math.floor(i/256);if(selection&&(x<selection.x||y<selection.y||x>=selection.x+selection.w||y>=selection.y+selection.h))continue;if(!source[i+3])continue;const r=source[i],g=source[i+1],b=source[i+2];let nr=r,ng=g,nb=b;
    if(type==='grayscale'){const y=Math.round(.2126*r+.7152*g+.0722*b);nr=ng=nb=y;}
    else if(type==='sepia'){nr=Math.min(255,.393*r+.769*g+.189*b);ng=Math.min(255,.349*r+.686*g+.168*b);nb=Math.min(255,.272*r+.534*g+.131*b);}
    else if(type==='invert'||type==='negative'){nr=255-r;ng=255-g;nb=255-b;}
    else if(type==='brightness'){nr=r+amount*2.55;ng=g+amount*2.55;nb=b+amount*2.55;}
    else if(type==='contrast'){const level=Math.max(-100,Math.min(100,amount))*2.5;const f=(259*(level+255))/(255*(259-level));nr=f*(r-128)+128;ng=f*(g-128)+128;nb=f*(b-128)+128;}
    else if(type==='saturation'){const y=.2126*r+.7152*g+.0722*b;nr=y+(r-y)*(1+amount/100);ng=y+(g-y)*(1+amount/100);nb=y+(b-y)*(1+amount/100);}
    else if(type==='hue'){const [h,s,v]=rgbToHsv(r,g,b);[nr,ng,nb]=hsvToRgb(h+amount/360,s,v);}
    else if(type==='warm'||type==='cool'){const direction=(type==='warm'?1:-1)*Math.sign(amount||1), strength=Math.abs(amount);nr=r+direction*strength*.4;ng=g+direction*strength*.08;nb=b-direction*strength*.35;}
    else if(type==='colorize'){const lum=.2126*r+.7152*g+.0722*b;const [h,s]=rgbToHsv(...colorize);[nr,ng,nb]=hsvToRgb(h,Math.max(s,.35),lum/255);}
    else if(type==='posterize'){const levels=Math.max(2,Math.round(amount));nr=Math.round(Math.round(r/255*(levels-1))/(levels-1)*255);ng=Math.round(Math.round(g/255*(levels-1))/(levels-1)*255);nb=Math.round(Math.round(b/255*(levels-1))/(levels-1)*255);}
    out[i]=Math.round(r+(nr-r)*mix);out[i+1]=Math.round(g+(ng-g)*mix);out[i+2]=Math.round(b+(nb-b)*mix);
  } return out;
}

export function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0; if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;if(h<0)h++;}return[h,max===0?0:d/max,max];}
export function hsvToRgb(h,s,v){h=((h%1)+1)%1*6;const i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);const a=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];return a.map(x=>Math.round(x*255));}

export function extractFragment(pixels, selection) {
  const { x, y, w, h } = selection;
  const fragment = new Uint8Array(w * h * 4);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const srcIdx = pixelOffset(x + sx, y + sy);
      fragment.set(pixels.subarray(srcIdx, srcIdx + 4), (sy * w + sx) * 4);
    }
  }
  return fragment;
}

export function clearRegion(pixels, selection) {
  const { x, y, w, h } = selection;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      pixels.set([0, 0, 0, 0], pixelOffset(x + sx, y + sy));
    }
  }
}

export function blitFragment(target, fragment, w, h, destX, destY, blend = false) {
  for (let sy = 0; sy < h; sy++) {
    const targetY = destY + sy;
    if (targetY < 0 || targetY >= 64) continue;
    for (let sx = 0; sx < w; sx++) {
      const targetX = destX + sx;
      if (targetX < 0 || targetX >= 64) continue;
      const srcIdx = (sy * w + sx) * 4;
      const dstIdx = pixelOffset(targetX, targetY);
      const srcA = fragment[srcIdx + 3];
      if (srcA === 0 && blend) continue;
      target.set(fragment.subarray(srcIdx, srcIdx + 4), dstIdx);
    }
  }
}
