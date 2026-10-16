// Minecraft 64×64 skin atlas. Every body part is a box whose six faces are
// packed into a 2*(w+d) × (d+h) rectangle starting at the part's atlas origin.
// Face order matches THREE.BoxGeometry groups: +X, -X, +Y, -Y, +Z, -Z.
// Minecraft's atlas is laid out from the player's point of view: side, front,
// side, back. With the preview facing +Z, avatar-right is -X.
const PARTS = {
  head:        { u:  0, v:  0, w: 8, h:  8, d: 8 },
  hat:         { u: 32, v:  0, w: 8, h:  8, d: 8 },
  body:        { u: 16, v: 16, w: 8, h: 12, d: 4 },
  jacket:      { u: 16, v: 32, w: 8, h: 12, d: 4 },
  rightArm:    { u: 40, v: 16, w: 4, h: 12, d: 4, limb: true },
  rightSleeve: { u: 40, v: 32, w: 4, h: 12, d: 4, limb: true },
  leftArm:     { u: 32, v: 48, w: 4, h: 12, d: 4, limb: true },
  leftSleeve:  { u: 48, v: 48, w: 4, h: 12, d: 4, limb: true },
  rightLeg:    { u:  0, v: 16, w: 4, h: 12, d: 4 },
  rightPants:  { u:  0, v: 32, w: 4, h: 12, d: 4 },
  leftLeg:     { u: 16, v: 48, w: 4, h: 12, d: 4 },
  leftPants:   { u:  0, v: 48, w: 4, h: 12, d: 4 },
};

export function limbWidth(model='classic') { return model==='slim'?3:4; }

// Atlas rectangles [x1,y1,x2,y2] for one box, in BoxGeometry face order.
// Slim arms are 3 px wide, so their rectangles shrink by one column and the
// faces after the front are shifted left, exactly like Minecraft's own packing.
export function boxFaceRegions(u,v,w,h,d) {
  return [
    [u+w+d,   v+d, u+w+2*d,   v+d+h], // +X
    [u,       v+d, u+d,       v+d+h], // -X
    [u+d,     v,   u+w+d,     v+d  ], // +Y
    [u+w+d,   v,   u+2*w+d,   v+d  ], // -Y
    [u+d,     v+d, u+w+d,     v+d+h], // +Z
    [u+w+2*d, v+d, u+2*w+2*d, v+d+h], // -Z
  ];
}

export function skinRegions(model='classic') {
  const arm=limbWidth(model);
  const regions={};
  for (const [name,part] of Object.entries(PARTS)) {
    regions[name]=Object.freeze(boxFaceRegions(part.u,part.v,part.limb?arm:part.w,part.h,part.d).map(r=>Object.freeze(r)));
  }
  return Object.freeze(regions);
}

export function skinLayerRegions(model='classic',layer='outer') {
  const outerParts=new Set(['hat','jacket','rightSleeve','leftSleeve','rightPants','leftPants']);
  return Object.entries(skinRegions(model))
    .filter(([part])=>outerParts.has(part)===(layer!=='base'))
    .flatMap(([,faces])=>faces.map(([x,y,x2,y2])=>({x,y,w:x2-x,h:y2-y})));
}

export const SKIN_UV_REGIONS = skinRegions('classic');

export function uvBoundsValid(map=SKIN_UV_REGIONS) {
  return Object.values(map).every(faces=>faces.length===6&&faces.every(([x,y,x2,y2])=>x>=0&&y>=0&&x2<=64&&y2<=64&&x<x2&&y<y2));
}
