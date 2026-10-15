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

export function mountSkinPreview(host,{
  getPixels,
  model='classic',
  getLayer=()=>'both',
  initialVisibility={},
  onModelChange=()=>{},
  onVisibilityChange=()=>{},
  onPixelPointerDown=()=>{},
  onPixelPointerMove=()=>{},
  onPixelPointerUp=()=>{},
  onHoverPixel=()=>{}
}) {
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
  const toolbar=document.createElement('div');toolbar.className='preview3d-controls';
  toolbar.innerHTML='<div class="preview3d-mode-toggle"><button id="btn3dDraw" class="active" type="button" title="Draw on 3D skin">🖌️ Draw</button><button id="btn3dOrbit" type="button" title="Rotate camera">🔄 Rotate</button></div><div class="preview3d-views"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button data-view="reset">Reset</button></div><span class="preview3d-hint">Click model to draw · drag bg or right-click to rotate</span>';
  host.append(toolbar);
  let mode3d='draw';
  const drawBtn=toolbar.querySelector('#btn3dDraw'),orbitBtn=toolbar.querySelector('#btn3dOrbit');
  if(drawBtn&&orbitBtn){
    drawBtn.onclick=()=>{mode3d='draw';drawBtn.classList.add('active');orbitBtn.classList.remove('active');};
    orbitBtn.onclick=()=>{mode3d='orbit';orbitBtn.classList.add('active');drawBtn.classList.remove('active');controls.enabled=true;};
  }
  const visibility={base:true,outer:true,head:true,torso:true,rightArm:true,leftArm:true,rightLeg:true,leftLeg:true,...initialVisibility};
  const updateVisibility=(newVis)=>{
    if(newVis)Object.assign(visibility,newVis);
    groups.forEach(m=>{m.visible=Boolean(visibility[m.userData.overlay?'outer':'base']&&visibility[m.userData.bodyPart]);});
  };
  updateVisibility();
  toolbar.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{const v=button.dataset.view;if(v==='front'){camera.position.set(0,20,56);controls.target.set(0,10,0);}else if(v==='side'){camera.position.set(56,20,0);controls.target.set(0,10,0);}else if(v==='back'){camera.position.set(0,20,-56);controls.target.set(0,10,0);}else{camera.position.set(34,26,56);controls.target.set(0,10,0);}controls.update();}));

  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  let isDrawing=false;

  function getHit(e){
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const curLayer=typeof getLayer==='function'?getLayer():(visibility.layer||'both');
    let candidateMeshes=meshes.filter(m=>m.visible);
    if(curLayer==='base'){
      candidateMeshes=candidateMeshes.filter(m=>!m.userData.overlay);
    }else if(curLayer==='outer'){
      candidateMeshes=candidateMeshes.filter(m=>m.userData.overlay);
    }
    const hits=raycaster.intersectObjects(candidateMeshes,false);
    for(const hit of hits){
      if(!hit.uv||!hit.face)continue;
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const worldNormal=hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      if(worldNormal.dot(raycaster.ray.direction)<0){
        const px=Math.min(63,Math.max(0,Math.floor(hit.uv.x*64)));
        const py=Math.min(63,Math.max(0,Math.floor((1-hit.uv.y)*64)));
        return{
          x:px,
          y:py,
          mesh:hit.object,
          part:hit.object.userData.label,
          overlay:Boolean(hit.object.userData.overlay)
        };
      }
    }
    return null;
  }

  function onPointerDown(e){
    if(e.button===0&&mode3d==='draw'){
      const hit=getHit(e);
      if(hit){
        e.stopImmediatePropagation();
        isDrawing=true;
        controls.enabled=false;
        try{renderer.domElement.setPointerCapture(e.pointerId);}catch{}
        onPixelPointerDown({x:hit.x,y:hit.y,part:hit.part,overlay:hit.overlay});
        return;
      }
    }
    controls.enabled=true;
  }

  function onPointerMove(e){
    if(isDrawing){
      const hit=getHit(e);
      if(hit){
        onPixelPointerMove({x:hit.x,y:hit.y,part:hit.part,overlay:hit.overlay});
      }
    }else{
      const hit=getHit(e);
      onHoverPixel(hit?{x:hit.x,y:hit.y,part:hit.part,overlay:hit.overlay}:null);
    }
  }

  function onPointerUp(e){
    if(isDrawing){
      isDrawing=false;
      controls.enabled=true;
      if(e&&e.pointerId!=null){
        try{renderer.domElement.releasePointerCapture(e.pointerId);}catch{}
      }
      onPixelPointerUp();
    }
  }

  renderer.domElement.addEventListener('pointerdown',onPointerDown,{capture:true});
  window.addEventListener('pointermove',onPointerMove);
  window.addEventListener('pointerup',onPointerUp);
  window.addEventListener('pointercancel',onPointerUp);

  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight-toolbar.offsetHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();let running=true;
  function animate(){if(!running)return;requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
  return {
    update(pixels){texture.image.data.set(rgbaTopToBottom(pixels));texture.needsUpdate=true;},
    setVisibility(newVis){updateVisibility(newVis);},
    getVisibility(){return Object.assign({},visibility);},
    dispose(){
      running=false;
      observer.disconnect();
      if(isDrawing&&onPointerUp)onPointerUp();
      renderer.domElement.removeEventListener('pointerdown',onPointerDown,{capture:true});
      window.removeEventListener('pointermove',onPointerMove);
      window.removeEventListener('pointerup',onPointerUp);
      window.removeEventListener('pointercancel',onPointerUp);
      controls.dispose();
      texture.dispose();
      meshes.forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});
      renderer.dispose();
      renderer.domElement.remove();
      toolbar.remove();
    }
  };
}
