import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { skinRegions, limbWidth } from '../minecraft/uvMaps.js';
import { rgbaTopToBottom } from './pixelRows.js';

export function boxWithAtlasUV(width,height,depth,regions) {
  const geometry=new THREE.BoxGeometry(width,height,depth),uv=geometry.attributes.uv;
  regions.forEach((r,face)=>{
    const [x,y,x2,y2]=r, u0=x/64,u1=x2/64,v0=1-y2/64,v1=1-y/64,base=face*4;
    // Every face walks its tile from the top row to the bottom row, except -Y:
    // BoxGeometry starts that face at the front edge while Minecraft's net
    // puts the front edge of the bottom tile on the lower row.
    const corners=face===3?[[u0,v0],[u1,v0],[u0,v1],[u1,v1]]:[[u0,v1],[u1,v1],[u0,v0],[u1,v0]];
    corners.forEach(([u,v],j)=>uv.setXY(base+j,u,v));
  });
  uv.needsUpdate=true;return geometry;
}

export function mountSkinPreview(host,{getPixels,model='classic',onModelChange=()=>{}}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111419);
  const camera=new THREE.PerspectiveCamera(38,1,.1,140);camera.position.set(34,26,56);
  const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,10,0);controls.minDistance=18;controls.maxDistance=75;
  const texture=new THREE.DataTexture(rgbaTopToBottom(getPixels()),64,64,THREE.RGBAFormat,THREE.UnsignedByteType);texture.flipY=false;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  const UV=skinRegions(model);
  const meshes=[],groups=[];
  function part(label,size,position,uvKey,overlay=false,bodyPart=label){const[w,h,d]=size;const mesh=new THREE.Mesh(boxWithAtlasUV(w,h,d,UV[uvKey]),new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,side:THREE.DoubleSide,depthWrite:!overlay,polygonOffset:overlay,polygonOffsetFactor:-1}));mesh.position.set(...position);mesh.userData={label,overlay,bodyPart};scene.add(mesh);meshes.push(mesh);groups.push(mesh);}
  // Outer layers hug their base layer with a 0.5 grow, matching Minecraft.
  const arm=limbWidth(model);part('head',[8,8,8],[0,18,0],'head',false,'head');part('hat',[9,9,9],[0,18,0],'hat',true,'head');
  part('torso',[8,12,4],[0,8,0],'body',false,'torso');part('jacket',[8.5,12.5,4.5],[0,8,0],'jacket',true,'torso');
  part('right arm',[arm,12,4],[-4-arm/2,8,0],'rightArm',false,'rightArm');part('right sleeve',[arm+.5,12.5,4.5],[-4-arm/2,8,0],'rightSleeve',true,'rightArm');
  part('left arm',[arm,12,4],[4+arm/2,8,0],'leftArm',false,'leftArm');part('left sleeve',[arm+.5,12.5,4.5],[4+arm/2,8,0],'leftSleeve',true,'leftArm');
  part('right leg',[4,12,4],[-2,-4,0],'rightLeg',false,'rightLeg');part('right pants',[4.5,12.5,4.5],[-2,-4,0],'rightPants',true,'rightLeg');
  part('left leg',[4,12,4],[2,-4,0],'leftLeg',false,'leftLeg');part('left pants',[4.5,12.5,4.5],[2,-4,0],'leftPants',true,'leftLeg');
  const floor=new THREE.GridHelper(48,24,0x39404b,0x242a33);floor.position.y=-10.5;scene.add(floor);
  const toolbar=document.createElement('div');toolbar.className='preview3d-controls';toolbar.innerHTML='<div class="preview3d-views"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button data-view="reset">Reset</button></div><label><input data-layer="base" type="checkbox" checked> Base layer</label><label><input data-layer="outer" type="checkbox" checked> Outer layer</label><span class="preview3d-separator">Parts:</span><label><input data-part="head" type="checkbox" checked> Head</label><label><input data-part="torso" type="checkbox" checked> Torso</label><label><input data-part="rightArm" type="checkbox" checked> R arm</label><label><input data-part="leftArm" type="checkbox" checked> L arm</label><label><input data-part="rightLeg" type="checkbox" checked> R leg</label><label><input data-part="leftLeg" type="checkbox" checked> L leg</label><select id="model3d"><option value="classic">Classic</option><option value="slim">Slim</option></select><span>Drag to rotate · wheel to zoom</span>';
  host.append(toolbar);toolbar.querySelector('#model3d').value=model;toolbar.querySelector('#model3d').onchange=e=>onModelChange(e.target.value);
  const visibility={base:true,outer:true,head:true,torso:true,rightArm:true,leftArm:true,rightLeg:true,leftLeg:true};const updateVisibility=()=>groups.forEach(m=>{m.visible=visibility[m.userData.overlay?'outer':'base']&&visibility[m.userData.bodyPart];});toolbar.querySelectorAll('[data-layer]').forEach(input=>input.addEventListener('change',e=>{visibility[e.target.dataset.layer]=e.target.checked;updateVisibility();}));toolbar.querySelectorAll('[data-part]').forEach(input=>input.addEventListener('change',e=>{visibility[e.target.dataset.part]=e.target.checked;updateVisibility();}));
  toolbar.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{const v=button.dataset.view;if(v==='front'){camera.position.set(0,20,56);controls.target.set(0,10,0);}else if(v==='side'){camera.position.set(56,20,0);controls.target.set(0,10,0);}else if(v==='back'){camera.position.set(0,20,-56);controls.target.set(0,10,0);}else{camera.position.set(34,26,56);controls.target.set(0,10,0);}controls.update();}));
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight-toolbar.offsetHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();let running=true;
  function animate(){if(!running)return;requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
  return {update(pixels){texture.image.data.set(rgbaTopToBottom(pixels));texture.needsUpdate=true;},dispose(){running=false;observer.disconnect();controls.dispose();texture.dispose();meshes.forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});renderer.dispose();renderer.domElement.remove();toolbar.remove();}};
}
