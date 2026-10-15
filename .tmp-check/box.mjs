import * as THREE from 'three';
const g = new THREE.BoxGeometry(8,8,8);
const p = g.attributes.position, u = g.attributes.uv;
const names=['+X','-X','+Y','-Y','+Z','-Z'];
for (let f=0; f<6; f++) {
  console.log('face',names[f],'group',JSON.stringify({start:g.groups[f].start,count:g.groups[f].count}));
  for (let j=0;j<4;j++){
    const i=f*4+j;
    console.log('   v'+i, 'pos', [p.getX(i),p.getY(i),p.getZ(i)].map(n=>+n.toFixed(3)).join(','), 'uv', +u.getX(i).toFixed(5), +u.getY(i).toFixed(5));
  }
}
