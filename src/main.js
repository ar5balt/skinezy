import { blankTexture, clonePixels, createDefaultSkin, decodePng, encodePng, pixelOffset } from './texture.js';
import { drawLine, floodFill, filterPixels, transformSelection, extractFragment, clearRegion, blitFragment, rgbToHsv, hsvToRgb } from './operations.js';
import { mountSkinPreview } from './preview3d/skinPreview.js';
import { skinRegions, skinLayerRegions } from './minecraft/uvMaps.js';
import { captureSelection, readSharedClipboard, writeSharedClipboard, pasteFragment } from './selectionClipboard.js';

const canvas=document.querySelector('#skinCanvas'), ctx=canvas.getContext('2d',{alpha:true});
const state={
  projects:[],
  active:null,
  tool:'pencil',
  color:[93,124,255,255],
  hue:225,
  recentColors:[],
  background:[255,255,255,255],
  size:1,
  noise:0,
  tolerance:0,
  intensity:10,
  grid:true,
  zoom:8,
  selection:null,
  floating:null,
  drag:null,
  clipboard:null,
  filter:null,
  preview:null,
  seed:17321,
  model:'classic',
  bodyParts:{head:true,torso:true,rightArm:true,leftArm:true,rightLeg:true,leftLeg:true},
  layer:'both'
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const PERSIST_KEY='skinezy.browser-session.v1';
let persistTimer=null,storageWarningShown=false;
const filterSettings={grayscale:{min:0,max:100,value:100,unit:'%'},sepia:{min:0,max:100,value:100,unit:'%'},invert:{min:0,max:100,value:100,unit:'%'},brightness:{min:-100,max:100,value:20,unit:'%'},contrast:{min:-100,max:100,value:20,unit:'%'},saturation:{min:-100,max:100,value:20,unit:'%'},hue:{min:-180,max:180,value:30,unit:'°'},warm:{min:-100,max:100,value:20,unit:'%'},colorize:{min:0,max:100,value:100,unit:'%'},posterize:{min:2,max:16,value:6,unit:' levels'}};

const LIMB_TO_UV={
  head:['head','hat'],
  torso:['body','jacket'],
  rightArm:['rightArm','rightSleeve'],
  leftArm:['leftArm','leftSleeve'],
  rightLeg:['rightLeg','rightPants'],
  leftLeg:['leftLeg','leftPants']
};

function project(name='Untitled skin',pixels=createDefaultSkin('classic')){return{id:crypto.randomUUID(),name,pixels,savedPixels:clonePixels(pixels),undo:[],redo:[],dirty:false,model:'classic'};}
function encodePixels(pixels){return btoa(String.fromCharCode(...pixels));}
function decodePixels(encoded){
  const binary=atob(encoded);
  if(binary.length!==64*64*4)throw new Error('Stored skin has an invalid pixel buffer.');
  const pixels=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)pixels[i]=binary.charCodeAt(i);
  return pixels;
}
function schedulePersist(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(persistNow,180);
}
function persistNow(){
  clearTimeout(persistTimer);
  try{
    localStorage.setItem(PERSIST_KEY,JSON.stringify({
      active:state.active,
      projects:state.projects.map(p=>({id:p.id,name:p.name,model:p.model,pixels:encodePixels(p.pixels),savedPixels:encodePixels(p.savedPixels),dirty:p.dirty})),
      color:state.color,
      recentColors:state.recentColors,
      hue:state.hue,
      theme:document.documentElement.dataset.theme||'dark'
    }));
    storageWarningShown=false;
  }catch(error){
    console.error('Could not save the current skin session to browser storage.',error);
    if(!storageWarningShown){notify('Browser storage is unavailable or full; your latest edits may not persist.');storageWarningShown=true;}
  }
}
function restorePersistedState(){
  try{
    const raw=localStorage.getItem(PERSIST_KEY);
    if(!raw)return false;
    const saved=JSON.parse(raw);
    if(!Array.isArray(saved.projects))throw new Error('Stored skin session has invalid project data.');
    const restored=saved.projects.map(item=>{
      if(typeof item.id!=='string'||typeof item.name!=='string'||!['classic','slim'].includes(item.model))throw new Error('Stored skin project metadata is invalid.');
      const pixels=decodePixels(item.pixels),savedPixels=decodePixels(item.savedPixels);
      return{id:item.id,name:item.name,pixels,savedPixels,undo:[],redo:[],dirty:Boolean(item.dirty)||!samePixels(pixels,savedPixels),model:item.model};
    });
    if(!restored.length)return false;
    state.projects=restored;
    state.active=restored.some(p=>p.id===saved.active)?saved.active:restored[0].id;
    state.model=active().model;
    state.recentColors=Array.isArray(saved.recentColors)?saved.recentColors.filter(c=>/^#[0-9a-f]{6}$/i.test(c)).slice(0,10):[];
    if(Array.isArray(saved.color)&&saved.color.length===4&&saved.color.every(c=>Number.isInteger(c)&&c>=0&&c<=255))state.color=saved.color;
    if(Number.isFinite(saved.hue))state.hue=Math.max(0,Math.min(360,saved.hue));
    const theme=['dark','midnight','light','forest'].includes(saved.theme)?saved.theme:'dark';
    document.documentElement.dataset.theme=theme;
    $('#themeSelect').value=theme;
    return true;
  }catch(error){
    console.error('Could not restore the saved skin session.',error);
    notify('The saved browser session could not be restored; a new skin will be opened.');
    return false;
  }
}
function samePixels(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function hasUnsavedChanges(p){return !p||!samePixels(p.pixels,p.savedPixels);}
function active(){return state.projects.find(p=>p.id===state.active)||state.projects[0];}
function snapshot(){const p=active();if(!p)return;p.undo.push(clonePixels(p.pixels));if(p.undo.length>60)p.undo.shift();p.redo.length=0;p.dirty=true;updateHistory();}
function changed(){active().dirty=hasUnsavedChanges(active());refresh();}

function commitFloating(){
  if(!state.floating)return;
  const p=active();
  blitFragment(p.pixels,state.floating.pixels,state.floating.w,state.floating.h,state.floating.x,state.floating.y,true);
  state.selection={x:state.floating.x,y:state.floating.y,w:state.floating.w,h:state.floating.h};
  state.floating=null;
  changed();
}

function getDisplayPixels(){
  const p=active();
  if(!p)return null;
  const base=state.preview||p.pixels;
  if(!state.floating)return base;
  const out=clonePixels(base);
  blitFragment(out,state.floating.pixels,state.floating.w,state.floating.h,state.floating.x,state.floating.y,true);
  return out;
}

function draw(){
  const pixels=getDisplayPixels();
  if(!pixels)return;
  const image=ctx.createImageData(64,64);
  image.data.set(pixels);
  ctx.putImageData(image,0,0);
  canvas.classList.toggle('grid-on',state.grid);
  $('.canvas-frame').classList.toggle('grid-on',state.grid);
}

function refresh(){
  const p=active();
  if(!p)return;
  const pixels=getDisplayPixels()||p.pixels;
  const image=ctx.createImageData(64,64);
  image.data.set(pixels);
  ctx.putImageData(image,0,0);
  canvas.classList.toggle('grid-on',state.grid);
  $('.canvas-frame').classList.toggle('grid-on',state.grid);
  $('#saveStatus').textContent=p.dirty?'Unsaved changes':'Saved';
  $('#saveStatus').classList.toggle('dirty',p.dirty);
  $('#canvasSize').textContent='64 × 64 px';
  if(state.preview3d)state.preview3d.update(p.pixels);
  updateTabs();
  updateHistory();
  syncMannequin();
  schedulePersist();
}

function updateHistory(){const p=active();$('#undo').disabled=!p?.undo.length;$('#redo').disabled=!p?.redo.length;}
function updateTabs(){
  const host=$('#projectTabs');
  host.innerHTML='';
  for(const p of state.projects){
    const tab=document.createElement('button');
    tab.className='project-tab'+(p.id===state.active?' active':'');
    tab.innerHTML=`<span class="tab-dot"></span><span class="tab-name">${escapeHtml(p.name)}${p.dirty?' •':''}</span><span class="tab-close" title="Close project">×</span>`;
    tab.onclick=e=>{
      if(e.target.closest('.tab-close'))closeProject(p.id);
      else{
        commitFloating();
        const modelChanged=active().model!==p.model;
        state.active=p.id;
        state.model=p.model;
        state.selection=null;
        state.preview=null;
        selectionUI();
        renderUvOverlayRects(state.model);
        $$('.model-button').forEach(b=>b.classList.toggle('active',b.dataset.model===state.model));
        if(modelChanged&&state.preview3d){
          state.preview3d.dispose();
          mount3D($('#threeHost'));
        }
        refresh();
      }
    };
    host.append(tab);
  }
}

function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function notify(message){let el=$('#toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.append(el);}el.textContent=message;el.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('show'),2600);}
function setColor(rgb,record=true){
  state.color=rgb;
  const hex='#'+rgb.slice(0,3).map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
  $('#colorPicker').value=hex;$('#hexColor').value=hex;$('#rgbaColor').value=rgb.join(', ');
  $('#colorPreview').style.backgroundColor=hex;
  const [h,s,v]=rgbToHsv(...rgb);
  if(s>0&&v>0)state.hue=Math.round(h*360);
  $('#hueSlider').value=state.hue;
  updateColorSpectrum();
  if(record&&rgb[3]!==0){
    state.recentColors=[hex,...state.recentColors.filter(c=>c!==hex)].slice(0,10);
    renderRecentColors();
  }
  schedulePersist();
}

function updateColorSpectrum(){
  $('#colorSpectrum').style.setProperty('--hue-color',`hsl(${state.hue} 100% 50%)`);
  const [h,s,v]=rgbToHsv(...state.color);
  const marker=$('#colorSpectrumMarker');
  marker.style.left=`${s*100}%`;
  marker.style.top=`${(1-v)*100}%`;
}

function renderRecentColors(){
  const host=$('#recentColors');
  host.replaceChildren();
  for(const color of state.recentColors){
    const swatch=document.createElement('button');
    swatch.type='button';swatch.className='swatch recent-swatch';swatch.style.setProperty('--swatch',color);
    swatch.title=color;swatch.setAttribute('aria-label',`Use recent color ${color}`);
    swatch.onclick=()=>setColor([parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16),255]);
    host.append(swatch);
  }
}

function pickSpectrumColor(e){
  const box=$('#colorSpectrum').getBoundingClientRect();
  const s=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width));
  const v=1-Math.max(0,Math.min(1,(e.clientY-box.top)/box.height));
  const [r,g,b]=hsvToRgb(state.hue/360,s,v);
  setColor([r,g,b,255]);
}

$('#colorSpectrum').addEventListener('pointerdown',e=>{
  e.preventDefault();$('#colorSpectrum').setPointerCapture(e.pointerId);pickSpectrumColor(e);
});
$('#colorSpectrum').addEventListener('pointermove',e=>{if(e.buttons===1)pickSpectrumColor(e);});
$('#colorSpectrum').addEventListener('keydown',e=>{
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();
  const [h,s,v]=rgbToHsv(...state.color);
  const nextS=Math.max(0,Math.min(1,s+(e.key==='ArrowRight'?0.02:e.key==='ArrowLeft'?-0.02:0)));
  const nextV=Math.max(0,Math.min(1,v+(e.key==='ArrowUp'?0.02:e.key==='ArrowDown'?-0.02:0)));
  setColor(hsvToRgb(h,nextS,nextV).concat(255));
});
$('#hueSlider').oninput=e=>{
  state.hue=+e.target.value;
  const [,s,v]=rgbToHsv(...state.color);
  setColor(hsvToRgb(state.hue/360,s,v).concat(255));
  state.hue=+e.target.value;
  $('#hueSlider').value=state.hue;
  $('#colorSpectrum').style.setProperty('--hue-color',`hsl(${state.hue} 100% 50%)`);
};
function point(e){const rect=canvas.getBoundingClientRect();return{x:Math.min(63,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*64))),y:Math.min(63,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*64)))};}
function uvFaceBounds(x,y){
  for(const faces of Object.values(skinRegions(state.model))){
    for(const [left,top,right,bottom] of faces){
      if(x>=left&&x<right&&y>=top&&y<bottom)return{x:left,y:top,w:right-left,h:bottom-top};
    }
  }
  return null;
}

function setTool(tool){
  if(state.tool!==tool&&state.floating)commitFloating();
  state.tool=tool;
  $$('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  canvas.style.cursor=tool==='eyedropper'?'crosshair':tool==='select'?'crosshair':'cell';
}

function onDown(e){
  if(e.button!==0)return;
  canvas.setPointerCapture(e.pointerId);
  const pos=point(e),p=active();
  $('#pixelInfo').textContent=`X: ${pos.x}   Y: ${pos.y}   RGBA: ${Array.from(p.pixels.slice(pixelOffset(pos.x,pos.y),pixelOffset(pos.x,pos.y)+4)).join(', ')}`;

  if(state.tool==='eyedropper'){
    commitFloating();
    setColor(Array.from(p.pixels.slice(pixelOffset(pos.x,pos.y),pixelOffset(pos.x,pos.y)+4)));
    return;
  }
  if(state.tool==='fill'){
    commitFloating();
    const bounds=uvFaceBounds(pos.x,pos.y);
    if(!bounds){notify('Fill is available inside a body-part face on the skin map.');return;}
    const next=clonePixels(p.pixels);
    if(!floodFill(next,pos.x,pos.y,state.color,state.tolerance,state.selection,bounds))return;
    snapshot();
    p.pixels=next;
    changed();
    return;
  }
  if(state.tool==='select'){
    const s=state.selection;
    const inside=s&&pos.x>=s.x&&pos.y>=s.y&&pos.x<s.x+s.w&&pos.y<s.y+s.h;
    if(inside){
      // Lift to floating selection if not already floating
      if(!state.floating){
        snapshot();
        const fragment=extractFragment(p.pixels,s);
        clearRegion(p.pixels,s);
        state.floating={x:s.x,y:s.y,w:s.w,h:s.h,pixels:fragment};
      }
      state.drag={
        kind:'move-selection',
        startX:pos.x,
        startY:pos.y,
        origX:state.floating.x,
        origY:state.floating.y
      };
      canvas.style.cursor='grabbing';
      selectionUI();
      draw();
      return;
    }else{
      // Clicked outside existing selection: deselect and begin new box
      if(state.floating)commitFloating();
      state.selection=null;
      selectionUI();
      draw();
      state.drag={kind:'select',start:pos};
      state.selection={x:pos.x,y:pos.y,w:1,h:1};
      selectionUI();
      return;
    }
  }

  // Draw tools (pencil, brush, eraser, lighten, darken)
  if(state.floating)commitFloating();
  if(state.tool==='brush')state.seed=$('#fixedSeed').checked?17321:crypto.getRandomValues(new Uint32Array(1))[0];
  state.drag={kind:'draw',last:pos,before:clonePixels(p.pixels)};
  drawAt(pos);
  draw();
}

function drawAt(pos){
  const p=active();
  let mode=state.tool==='eraser'?'eraser':state.tool==='brush'?'brush':state.tool==='lighten'?'lighten':state.tool==='darken'?'darken':'pencil';
  drawLine(p.pixels,pos,pos,{color:state.color,size:state.size,mode,noise:mode==='brush'?state.noise:0,seed:mode==='lighten'||mode==='darken'?state.intensity:state.seed,selection:state.selection});
}

function onMove(e){
  const pos=point(e),p=active();
  const i=pixelOffset(pos.x,pos.y);
  $('#pixelInfo').textContent=`X: ${pos.x}   Y: ${pos.y}   RGBA: ${Array.from(p.pixels.slice(i,i+4)).join(', ')}`;

  if(!state.drag){
    if(state.tool==='select'){
      const s=state.selection;
      const inside=s&&pos.x>=s.x&&pos.y>=s.y&&pos.x<s.x+s.w&&pos.y<s.y+s.h;
      canvas.style.cursor=inside?'grab':'crosshair';
    }
    return;
  }

  if(state.drag.kind==='move-selection'){
    const dx=pos.x-state.drag.startX;
    const dy=pos.y-state.drag.startY;
    const newX=Math.min(64-state.floating.w,Math.max(0,state.drag.origX+dx));
    const newY=Math.min(64-state.floating.h,Math.max(0,state.drag.origY+dy));
    state.floating.x=newX;
    state.floating.y=newY;
    state.selection={x:newX,y:newY,w:state.floating.w,h:state.floating.h};
    selectionUI();
    draw();
    return;
  }

  if(state.drag.kind==='select'){
    const a=state.drag.start;
    state.selection={x:Math.min(a.x,pos.x),y:Math.min(a.y,pos.y),w:Math.abs(a.x-pos.x)+1,h:Math.abs(a.y-pos.y)+1};
    selectionUI();
    return;
  }

  drawLine(p.pixels,state.drag.last,pos,{color:state.color,size:state.size,mode:state.tool==='eraser'?'eraser':state.tool==='brush'?'brush':state.tool==='lighten'?'lighten':state.tool==='darken'?'darken':'pencil',noise:state.noise,seed:state.tool==='lighten'||state.tool==='darken'?state.intensity:state.seed,selection:state.selection});
  state.drag.last=pos;
  draw();
}

function onUp(e){
  const drag=state.drag;
  state.drag=null;
  if(drag?.kind==='move-selection'){
    canvas.style.cursor='grab';
    draw();
    selectionUI();
    return;
  }
  if(drag?.kind==='select'){
    if(e){
      const pos=point(e);
      if(state.selection&&state.selection.w===1&&state.selection.h===1&&drag.start.x===pos.x&&drag.start.y===pos.y){
        state.selection=null;
        selectionUI();
        draw();
      }
    }
    return;
  }
  if(drag?.kind==='draw'){
    const p=active();
    if(!samePixels(drag.before,p.pixels)){
      p.undo.push(drag.before);
      if(p.undo.length>60)p.undo.shift();
      p.redo.length=0;
      changed();
    }else draw();
  }
}

function selectionUI(){
  const box=$('#selectionOutline'),s=state.selection;
  if(!box)return;
  if(!s){
    box.classList.add('hidden');
    const info=$('#selectionInfo');
    if(info)info.textContent='No selection';
    return;
  }
  box.classList.remove('hidden');
  box.style.left=`${s.x/64*100}%`;
  box.style.top=`${s.y/64*100}%`;
  box.style.width=`${s.w/64*100}%`;
  box.style.height=`${s.h/64*100}%`;
  const info=$('#selectionInfo');
  if(info)info.textContent=`X ${s.x}  Y ${s.y}   ${s.w} × ${s.h} px${state.floating?' (floating)':''}`;
}

let pendingModelAction=null;
function showModelModal(action){
  pendingModelAction=action;
  $('#modelModal')?.classList.remove('hidden');
}
function hideModelModal(){
  pendingModelAction=null;
  $('#modelModal')?.classList.add('hidden');
}
function applyChosenModel(chosenModel){
  if(!pendingModelAction)return;
  const action=pendingModelAction;
  hideModelModal();
  if(state.floating)commitFloating();
  if(action.type==='new'){
    const p=project('Untitled skin',createDefaultSkin(chosenModel));
    p.model=chosenModel;
    state.projects.push(p);
    state.active=p.id;
    setModel(chosenModel);
    state.selection=null;
    state.preview=null;
    selectionUI();
    refresh();
    notify(`Created new skin with ${chosenModel==='slim'?'Slim (Alex)':'Classic (Steve)'} model.`);
  }else if(action.type==='open'){
    const p=project(action.name,action.pixels);
    p.model=chosenModel;
    state.projects.push(p);
    state.active=p.id;
    setModel(chosenModel);
    state.selection=null;
    state.preview=null;
    selectionUI();
    refresh();
    notify(`Opened ${action.name} with ${chosenModel==='slim'?'Slim (Alex)':'Classic (Steve)'} model.`);
  }
}

function undo(){
  if(state.floating)commitFloating();
  const p=active();
  if(!p?.undo.length)return;
  p.redo.push(clonePixels(p.pixels));
  p.pixels=p.undo.pop();
  p.dirty=hasUnsavedChanges(p);
  refresh();
}

function redo(){
  if(state.floating)commitFloating();
  const p=active();
  if(!p?.redo.length)return;
  p.undo.push(clonePixels(p.pixels));
  p.pixels=p.redo.pop();
  p.dirty=hasUnsavedChanges(p);
  refresh();
}

function copy(cut=false){
  if(state.floating)commitFloating();
  const p=active(),s=state.selection;
  if(!s){notify('Select a texture area first.');return;}
  state.clipboard=captureSelection(p.pixels,s);
  const shared=writeSharedClipboard(state.clipboard);
  if(cut)clearSelection();
  notify(shared?'Selection copied.':'Selection copied for this session; browser storage is unavailable for sharing it across tabs.');
}

function clearSelection(){
  if(state.floating){
    state.floating=null;
    state.selection=null;
    selectionUI();
    changed();
    return;
  }
  const p=active(),s=state.selection;
  if(!s)return;
  snapshot();
  for(let y=s.y;y<s.y+s.h;y++)for(let x=s.x;x<s.x+s.w;x++)p.pixels.set([0,0,0,0],pixelOffset(x,y));
  changed();
}

function paste(){
  if(state.floating)commitFloating();
  const clipboard=readSharedClipboard();
  if(clipboard)state.clipboard=clipboard;
  if(!state.clipboard){notify('Clipboard is empty.');return;}
  const pos=state.selection?{x:state.selection.x,y:state.selection.y}:null,c=state.clipboard,p=active();
  const next=clonePixels(p.pixels);
  const selection=pasteFragment(next,c,pos);
  snapshot();
  p.pixels=next;
  state.selection=selection;
  selectionUI();
  changed();
}

async function importFile(file){
  try{
    if(state.floating)commitFloating();
    const decoded=await decodePng(await file.arrayBuffer());
    if(decoded.width===64&&decoded.height===32){
      if(confirm('This is a legacy 64 × 32 skin. Convert it to a 64 × 64 template? The missing outer-layer pixels will be transparent.')){
        const px=blankTexture();
        for(let y=0;y<32;y++)px.set(decoded.pixels.subarray(y*64*4,(y+1)*64*4),y*64*4);
        showModelModal({type:'open',name:file.name,pixels:px});
      }
      return;
    }
    if(decoded.width!==64||decoded.height!==64){notify(`Unsupported size ${decoded.width} × ${decoded.height}; expected 64 × 64.`);return;}
    showModelModal({type:'open',name:file.name,pixels:decoded.pixels});
  }catch(err){notify(`Could not open PNG: ${err.message}`);}
}

async function exportPng(){
  if(state.floating)commitFloating();
  const p=active();
  if(!p)return;
  try{
    const blob=await encodePng(p.pixels);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(p.name.replace(/\.png$/i,'')||'skin')+'.png';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    p.savedPixels=clonePixels(p.pixels);
    p.dirty=false;
    refresh();
    notify('PNG exported at 64 × 64.');
  }catch(err){notify(`Export failed: ${err.message}`);}
}

function closeProject(id){
  if(state.floating)commitFloating();
  const p=state.projects.find(x=>x.id===id);
  if(p?.dirty&&!confirm(`Discard unsaved changes to “${p.name}”?`))return;
  state.projects=state.projects.filter(x=>x.id!==id);
  if(!state.projects.length){
    const fresh=project('Untitled skin',createDefaultSkin(state.model));
    fresh.model=state.model;
    state.projects.push(fresh);
  }
  if(state.active===id)state.active=state.projects[0].id;
  state.selection=null;
  selectionUI();
  refresh();
}

canvas.addEventListener('pointerdown',onDown);
canvas.addEventListener('pointermove',onMove);
canvas.addEventListener('pointerup',onUp);
canvas.addEventListener('pointercancel',onUp);
$$('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#newSkin').onclick=()=>showModelModal({type:'new'});
$('#selectClassicModel')?.addEventListener('click',()=>applyChosenModel('classic'));
$('#selectSlimModel')?.addEventListener('click',()=>applyChosenModel('slim'));
$('#closeModelModal')?.addEventListener('click',hideModelModal);
$('#modelModal')?.addEventListener('click',e=>{if(e.target===$('#modelModal'))hideModelModal();});

function toggleFiltersDrawer(forceOpen){
  const drawer=$('#filtersDrawer');
  if(!drawer)return;
  const shouldOpen=forceOpen!=null?forceOpen:drawer.classList.contains('closed');
  drawer.classList.toggle('closed',!shouldOpen);
  $('#toolFilters')?.classList.toggle('active',shouldOpen);
}
$('#toolFilters')?.addEventListener('click',()=>toggleFiltersDrawer());
$('#closeFiltersDrawer')?.addEventListener('click',()=>toggleFiltersDrawer(false));

$('#openSkin').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{if(e.target.files[0])importFile(e.target.files[0]);e.target.value='';};
$('#saveSkin').onclick=exportPng;
$('#undo').onclick=undo;
$('#redo').onclick=redo;

$('#brushSize').oninput=e=>{state.size=+e.target.value;$('#sizeValue').textContent=`${state.size} px`;};
$('#noise').oninput=e=>{state.noise=+e.target.value;$('#noiseValue').textContent=`${state.noise}%`;};
$('#tolerance').oninput=e=>{state.tolerance=+e.target.value;$('#toleranceValue').textContent=state.tolerance;};
$('#intensity').oninput=e=>{state.intensity=+e.target.value;$('#intensityValue').textContent=`${state.intensity}%`;};

$('#colorPicker').oninput=e=>{const h=e.target.value;setColor([parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16),255]);};
$('#hexColor').onchange=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){$('#colorPicker').value=e.target.value;$('#colorPicker').dispatchEvent(new Event('input'));}else notify('Enter a color as #RRGGBB.');};
$('#swapColors').onclick=()=>{const c=state.color;setColor(state.background);state.background=c;};

$('#swatches').onclick=e=>{
  if(e.target.classList.contains('swatch')&&!e.target.classList.contains('add-swatch')){
    const c=getComputedStyle(e.target).getPropertyValue('--swatch').trim();
    $('#colorPicker').value=c;
    $('#colorPicker').dispatchEvent(new Event('input'));
  }else if(e.target.classList.contains('add-swatch')){
    const b=document.createElement('button');
    b.className='swatch';
    b.style.setProperty('--swatch',$('#colorPicker').value);
    e.target.before(b);
  }
};

$('#gridToggle').onclick=()=>{
  state.grid=!state.grid;
  $('#gridToggle').classList.toggle('active',state.grid);
  $('#gridToggle').setAttribute('aria-pressed',String(state.grid));
  state.preview3d?.setGridVisible(state.grid);
  refresh();
};
function updateZoom(){const frame=$('.canvas-frame');frame.style.width=`${state.zoom*64}px`;frame.style.height=`${state.zoom*64}px`;$('#zoomLabel').textContent=`${state.zoom*100}%`;}
function zoomPreview(factor){
  const preview=state.preview3d;
  if(!preview)return;
  preview.zoom(factor);
  $('#zoomLabel').textContent=`${Math.round(preview.getZoom())}%`;
}
$('#zoomIn').onclick=()=>state.preview3d?zoomPreview(1/1.2):(state.zoom=Math.min(16,state.zoom+1),updateZoom());
$('#zoomOut').onclick=()=>state.preview3d?zoomPreview(1.2):(state.zoom=Math.max(2,state.zoom-1),updateZoom());
async function toggleFullscreen(){
  const stage=$('#canvasStage');
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await stage.requestFullscreen();
  }catch(error){console.error('Could not toggle preview fullscreen.',error);notify('Fullscreen mode is not available in this browser.');}
}
$('#fitCanvas').onclick=()=>state.preview3d?toggleFullscreen():(state.zoom=Math.max(2,Math.min(12,Math.floor(Math.min($('#canvasStage').clientWidth-80,$('#canvasStage').clientHeight-80)/64))),updateZoom());
$('#fitCanvas').title='Fit canvas / toggle fullscreen';
$('#canvasStage').addEventListener('wheel',e=>{
  if(state.preview3d||!e.target.closest('#skinCanvas'))return;
  e.preventDefault();
  state.zoom=Math.max(2,Math.min(16,state.zoom+(e.deltaY<0?1:-1)));
  updateZoom();
},{passive:false});
window.addEventListener('mousedown',e=>{
  if(e.button===3||e.button===4){e.preventDefault();e.button===3?undo():redo();}
},true);
window.addEventListener('auxclick',e=>{if(e.button===3||e.button===4)e.preventDefault();},true);

function configureFilter(type){
  state.filter=type;
  const cfg=filterSettings[type],input=$('#filterAmount');
  input.min=cfg.min;input.max=cfg.max;input.value=cfg.value;
  $('#filterAmountName').textContent=type==='hue'?'Hue shift':type==='posterize'?'Color levels':type==='colorize'?'Colorize strength':type==='warm'?'Warm / cool':'Effect strength';
  $('#filterAmountValue').textContent=`${cfg.value}${cfg.unit}`;
  $('#applyFilter').disabled=false;
  state.preview=null;
  $('#filterPreview').classList.add('hidden');
}
$$('.filter-chip').forEach(b=>b.onclick=()=>{$$('.filter-chip').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');configureFilter(b.dataset.filter);});
$('#filterAmount').oninput=e=>{const cfg=filterSettings[state.filter];if(cfg)$('#filterAmountValue').textContent=`${e.target.value}${cfg.unit}`;state.preview=null;$('#filterPreview').classList.add('hidden');refresh();};
$('#previewFilter').onclick=()=>{if(!state.filter){notify('Choose a filter first.');return;}if(state.floating)commitFloating();state.preview=filterPixels(active().pixels,state.filter,+$('#filterAmount').value,state.selection,state.color);$('#filterPreview').classList.remove('hidden');refresh();};
$('#applyFilter').onclick=()=>{if(!state.filter)return;if(state.floating)commitFloating();const next=filterPixels(active().pixels,state.filter,+$('#filterAmount').value,state.selection,state.color);if(samePixels(next,active().pixels)){state.preview=null;$('#filterPreview').classList.add('hidden');refresh();notify('This filter made no pixel changes.');return;}snapshot();active().pixels=next;state.preview=null;$('#filterPreview').classList.add('hidden');refresh();};
$('#cancelPreview').onclick=()=>{state.preview=null;$('#filterPreview').classList.add('hidden');refresh();};

$('#deselect')?.addEventListener('click',()=>{
  if(state.floating)commitFloating();
  state.selection=null;
  selectionUI();
  refresh();
});
$('#copySelection')?.addEventListener('click',()=>copy());
$('#cutSelection')?.addEventListener('click',()=>copy(true));
$('#deleteSelection')?.addEventListener('click',clearSelection);
$('#pasteSelection')?.addEventListener('click',paste);

function applySelectionTransform(operation){
  if(!state.selection){notify('Select a texture area first.');return;}
  if(state.floating)commitFloating();
  try{
    const transformed=transformSelection(active().pixels,state.selection,operation);
    if(samePixels(transformed.pixels,active().pixels))return;
    snapshot();
    active().pixels=transformed.pixels;
    state.selection=transformed.selection;
    selectionUI();
    changed();
  }catch(error){notify(error.message);}
}
$('#flipSelectionH')?.addEventListener('click',()=>applySelectionTransform('flipH'));
$('#flipSelectionV')?.addEventListener('click',()=>applySelectionTransform('flipV'));
$('#rotateSelection')?.addEventListener('click',()=>applySelectionTransform('rotateCW'));

function setModel(model){
  state.model=model;
  const p=active();
  if(p)p.model=model;
  $$('.model-button').forEach(b=>b.classList.toggle('active',b.dataset.model===model));
  renderUvOverlayRects(model);
  if(state.preview3d){
    const host=$('#threeHost');
    state.preview3d.dispose();
    if(host)mount3D(host);
  }
  refresh();
}

function handle3DHover(pos){
  if(pos){
    const p=active();
    const i=pixelOffset(pos.x,pos.y);
    $('#pixelInfo').textContent=`X: ${pos.x}   Y: ${pos.y}   RGBA: ${Array.from(p.pixels.slice(i,i+4)).join(', ')}`;
  }else{
    $('#pixelInfo').textContent='X: —   Y: —   RGBA: —';
  }
}
function get3DFaceBounds(pos){
  if(!pos.bounds)return null;
  return{x:pos.bounds[0],y:pos.bounds[1],w:pos.bounds[2]-pos.bounds[0],h:pos.bounds[3]-pos.bounds[1]};
}
function get3DLayerRegions(layer){
  return skinLayerRegions(state.model,layer==='base'?'base':'outer');
}
function handle3DDown(pos){
  const p=active();
  const i=pixelOffset(pos.x,pos.y);
  const allowedRegions=get3DLayerRegions(pos.layer||state.layer);
  $('#pixelInfo').textContent=`X: ${pos.x}   Y: ${pos.y}   RGBA: ${Array.from(p.pixels.slice(i,i+4)).join(', ')}`;
  if(state.tool==='eyedropper'){setColor(Array.from(p.pixels.slice(i,i+4)));return;}
  if(state.tool==='fill'){
    const next=clonePixels(p.pixels);
    const bounds=get3DFaceBounds(pos);
    if(!bounds){notify('Could not determine the selected body-part face.');return;}
    if(!floodFill(next,pos.x,pos.y,state.color,state.tolerance,null,bounds,allowedRegions))return;
    snapshot();
    p.pixels=next;
    changed();
    return;
  }
  if(state.tool==='select')return;
  if(state.tool==='brush')state.seed=$('#fixedSeed').checked?17321:crypto.getRandomValues(new Uint32Array(1))[0];
  state.drag={kind:'draw',last:pos,before:clonePixels(p.pixels)};
  let mode=state.tool==='eraser'?'eraser':state.tool==='brush'?'brush':state.tool==='lighten'?'lighten':state.tool==='darken'?'darken':'pencil';
  drawLine(p.pixels,pos,pos,{color:state.color,size:state.size,mode,noise:mode==='brush'?state.noise:0,seed:mode==='lighten'||mode==='darken'?state.intensity:state.seed,selection:null,bounds:get3DFaceBounds(pos),allowedRegions});
  changed();
}
function handle3DMove(pos){
  if(!state.drag||state.drag.kind!=='draw')return;
  const p=active();
  const i=pixelOffset(pos.x,pos.y);
  $('#pixelInfo').textContent=`X: ${pos.x}   Y: ${pos.y}   RGBA: ${Array.from(p.pixels.slice(i,i+4)).join(', ')}`;
  if(pos.x===state.drag.last.x&&pos.y===state.drag.last.y)return;
  let mode=state.tool==='eraser'?'eraser':state.tool==='brush'?'brush':state.tool==='lighten'?'lighten':state.tool==='darken'?'darken':'pencil';
  const sameFace=state.drag.last.part===pos.part&&state.drag.last.overlay===pos.overlay&&state.drag.last.faceIndex===pos.faceIndex;
  const dist=Math.hypot(pos.x-state.drag.last.x,pos.y-state.drag.last.y);
  const bounds=get3DFaceBounds(pos);
  const allowedRegions=get3DLayerRegions(pos.layer||state.layer);
  if(sameFace&&dist<=3){
    drawLine(p.pixels,state.drag.last,pos,{color:state.color,size:state.size,mode,noise:mode==='brush'?state.noise:0,seed:mode==='lighten'||mode==='darken'?state.intensity:state.seed,selection:null,bounds,allowedRegions});
  }else{
    drawLine(p.pixels,pos,pos,{color:state.color,size:state.size,mode,noise:mode==='brush'?state.noise:0,seed:mode==='lighten'||mode==='darken'?state.intensity:state.seed,selection:null,bounds,allowedRegions});
  }
  state.drag.last=pos;
  changed();
}
function handle3DUp(){
  const drag=state.drag;
  state.drag=null;
  if(drag?.kind==='draw'){
    const p=active();
    if(!samePixels(drag.before,p.pixels)){
      p.undo.push(drag.before);
      if(p.undo.length>60)p.undo.shift();
      p.redo.length=0;
      changed();
    }else changed();
  }
}

function getVis3d(){
  return {
    base: state.layer==='both'||state.layer==='base',
    outer: state.layer==='both'||state.layer==='outer',
    ...state.bodyParts
  };
}

function mount3D(host){
  const onModelChange=model=>{
    setModel(model);
    state.preview3d?.dispose();
    state.preview3d=mountSkinPreview(host,{
      getPixels:()=>active().pixels,
      model,
      showGrid:state.grid,
      getLayer:()=>state.layer,
      initialVisibility:getVis3d(),
      onModelChange,
      onVisibilityChange:newVis=>{
        if(newVis.base&&newVis.outer)state.layer='both';
        else if(newVis.base)state.layer='base';
        else if(newVis.outer)state.layer='outer';
        ['head','torso','rightArm','leftArm','rightLeg','leftLeg'].forEach(k=>{
          if(k in newVis)state.bodyParts[k]=newVis[k];
        });
        syncMannequin();
      },
      onPixelPointerDown:handle3DDown,
      onPixelPointerMove:handle3DMove,
      onPixelPointerUp:handle3DUp,
      onHoverPixel:handle3DHover
    });
  };
  state.preview3d=mountSkinPreview(host,{
    getPixels:()=>active().pixels,
    model:state.model,
    showGrid:state.grid,
    getLayer:()=>state.layer,
    initialVisibility:getVis3d(),
    onModelChange,
    onVisibilityChange:newVis=>{
      if(newVis.base&&newVis.outer)state.layer='both';
      else if(newVis.base)state.layer='base';
      else if(newVis.outer)state.layer='outer';
      ['head','torso','rightArm','leftArm','rightLeg','leftLeg'].forEach(k=>{
        if(k in newVis)state.bodyParts[k]=newVis[k];
      });
      syncMannequin();
    },
    onPixelPointerDown:handle3DDown,
    onPixelPointerMove:handle3DMove,
    onPixelPointerUp:handle3DUp,
    onHoverPixel:handle3DHover
  });
}

$$('.model-button').forEach(b=>b.onclick=()=>{
  setModel(b.dataset.model);
});

function switchView(view){
  if(state.floating)commitFloating();
  state.drag=null;
  if(view==='preview3d'){
    state.selection=null;
    selectionUI();
  }
  $$('.view-tab').forEach(b=>b.classList.toggle('active',b.id===view));
  canvas.closest('.canvas-frame').classList.toggle('view-hidden',view==='preview3d');
  $('#canvasStage').classList.toggle('preview3d-active',view==='preview3d');
  let host=$('#threeHost');
  if(view==='preview3d'){
    if(!host){
      host=document.createElement('div');
      host.id='threeHost';
      host.className='three-host';
      $('#canvasStage').append(host);
    }
    if(!state.preview3d)mount3D(host);
  }else{
    if(state.preview3d){
      state.preview3d.dispose();
      state.preview3d=null;
    }
    if(host){
      host.remove();
    }
  }
  if(state.preview3d)$('#zoomLabel').textContent=`${Math.round(state.preview3d.getZoom())}%`;
  else updateZoom();
  refresh();
}

function syncMannequin(){
  // 1. Mannequin SVG classes
  $$('.mannequin-part').forEach(g=>{
    const part=g.dataset.part;
    const isVis=state.bodyParts[part];
    g.classList.toggle('dimmed',!isVis);
  });
  // 2. Layer buttons
  $$('.mannequin-layer-btn').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.layer===state.layer);
  });
  // 3. Status text
  const total=Object.values(state.bodyParts).filter(Boolean).length;
  const layerLabel=state.layer==='both'?'Both layers':state.layer==='base'?'Base layer':'Outer layer';
  const statusEl=$('#mannequinStatus');
  if(statusEl)statusEl.textContent=`${total}/6 parts · ${layerLabel}`;
  // 4. Sync 3D preview
  if(state.preview3d?.setVisibility){
    state.preview3d.setVisibility(getVis3d());
  }
  // 5. Sync 2D UV overlay outlines
  const svg=$('#uvOverlay');
  if(svg){
    svg.querySelectorAll('rect[data-uv-region]').forEach(rect=>{
      const reg=rect.dataset.uvRegion;
      const limb=Object.keys(LIMB_TO_UV).find(l=>LIMB_TO_UV[l].includes(reg));
      const limbVisible=limb?state.bodyParts[limb]:true;
      const isOuter=['hat','jacket','rightSleeve','leftSleeve','rightPants','leftPants'].includes(reg);
      const layerVisible=state.layer==='both'||(state.layer==='base'&&!isOuter)||(state.layer==='outer'&&isOuter);
      rect.style.display=(limbVisible&&layerVisible)?'':'none';
    });
  }
}

function setupMannequinEvents(){
  $$('.mannequin-part').forEach(g=>{
    const toggle=()=>{
      const part=g.dataset.part;
      state.bodyParts[part]=!state.bodyParts[part];
      syncMannequin();
    };
    g.onclick=toggle;
    g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
  });
  $$('.mannequin-layer-btn').forEach(btn=>{
    btn.onclick=()=>{
      state.layer=btn.dataset.layer;
      syncMannequin();
    };
  });
  $('#mannequinAll').onclick=()=>{
    Object.keys(state.bodyParts).forEach(k=>{state.bodyParts[k]=true;});
    syncMannequin();
  };
  $('#mannequinNone').onclick=()=>{
    Object.keys(state.bodyParts).forEach(k=>{state.bodyParts[k]=false;});
    syncMannequin();
  };
}

function setupUvOverlay(){
  const frame=$('.canvas-frame'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='uvOverlay';
  svg.setAttribute('viewBox','0 0 64 64');
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('aria-label','Minecraft skin UV regions');
  frame.append(svg);
  renderUvOverlayRects(state.model);
  svg.classList.toggle('uv-hidden',!$('#uvToggle').checked);
  $('#uvToggle').onchange=()=>svg.classList.toggle('uv-hidden',!$('#uvToggle').checked);
}

function renderUvOverlayRects(model){
  const svg=$('#uvOverlay');
  if(!svg)return;
  const colors={head:'#7bc9ff',hat:'#45a9ed',body:'#ffd166',jacket:'#e5a91e',rightLeg:'#9be564',rightPants:'#6db33c',leftLeg:'#d58aff',leftPants:'#ab62d8',rightArm:'#ff8b8b',rightSleeve:'#e96767',leftArm:'#83f0d3',leftSleeve:'#42c9a8'};
  svg.replaceChildren();
  for(const [part,faces] of Object.entries(skinRegions(model))){
    for(const [x,y,x2,y2] of faces){
      const rect=document.createElementNS(svg.namespaceURI,'rect');
      rect.dataset.uvRegion=part;
      rect.setAttribute('x',x);
      rect.setAttribute('y',y);
      rect.setAttribute('width',x2-x);
      rect.setAttribute('height',y2-y);
      rect.setAttribute('fill','none');
      rect.setAttribute('stroke',colors[part]);
      rect.setAttribute('stroke-width','.18');
      rect.setAttribute('vector-effect','non-scaling-stroke');
      const title=document.createElementNS(svg.namespaceURI,'title');
      title.textContent=`${part}: ${x}, ${y} — ${x2-x} × ${y2-y}`;
      rect.append(title);
      svg.append(rect);
    }
  }
}

$('#textureView').onclick=()=>switchView('textureView');
$('#preview3d').onclick=()=>switchView('preview3d');
setupUvOverlay();
setupMannequinEvents();

$$('[data-camera-view]').forEach(button=>button.onclick=()=>state.preview3d?.setView(button.dataset.cameraView));

const mannequinHandle=$('#mannequinDragHandle'),mannequin=$('#bodyMannequin'),stage=$('#canvasStage');
let mannequinDrag=null;
mannequinHandle.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const rect=mannequin.getBoundingClientRect();
  mannequin.style.left=`${rect.left-stage.getBoundingClientRect().left}px`;
  mannequin.style.top=`${rect.top-stage.getBoundingClientRect().top}px`;
  mannequin.style.right='auto';
  mannequinDrag={x:e.clientX-rect.left,y:e.clientY-rect.top};
  mannequinHandle.setPointerCapture(e.pointerId);
  e.preventDefault();
});
mannequinHandle.addEventListener('pointermove',e=>{
  if(!mannequinDrag)return;
  const bounds=stage.getBoundingClientRect(),panel=mannequin.getBoundingClientRect();
  const left=Math.max(0,Math.min(bounds.width-panel.width,e.clientX-bounds.left-mannequinDrag.x));
  const top=Math.max(0,Math.min(bounds.height-panel.height,e.clientY-bounds.top-mannequinDrag.y));
  mannequin.style.left=`${left}px`;mannequin.style.top=`${top}px`;
});
mannequinHandle.addEventListener('pointerup',()=>{mannequinDrag=null;});
mannequinHandle.addEventListener('pointercancel',()=>{mannequinDrag=null;});

$('#settings').onclick=()=>$('#settingsModal').classList.remove('hidden');
$('#closeSettings').onclick=()=>$('#settingsModal').classList.add('hidden');
$('#settingsModal').addEventListener('click',e=>{if(e.target===$('#settingsModal'))$('#settingsModal').classList.add('hidden');});
$('#themeSelect').onchange=e=>{
  document.documentElement.dataset.theme=e.target.value;
  schedulePersist();
};

window.addEventListener('keydown',e=>{
  const tag=e.target.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag)||e.target.isContentEditable)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();
    e.shiftKey?redo():undo();
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){
    e.preventDefault();
    redo();
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){
    e.preventDefault();
    $('#openSkin').click();
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){
    e.preventDefault();
    exportPng();
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
    e.preventDefault();
    copy();
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='x'){
    e.preventDefault();
    copy(true);
  }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){
    e.preventDefault();
    paste();
  }else if(e.key==='Delete'){
    clearSelection();
  }else if(e.key==='Escape'){
    if(state.floating)commitFloating();
    state.preview=null;
    state.selection=null;
    selectionUI();
    refresh();
  }else if(e.key==='Enter'&&state.floating){
    commitFloating();
  }else if(e.key.toLowerCase()==='b'){
    setTool('pencil');
  }else if(e.key.toLowerCase()==='i'){
    setTool('eyedropper');
  }else if(e.key.toLowerCase()==='e'){
    setTool('eraser');
  }
});

window.addEventListener('pagehide',persistNow);

if(!restorePersistedState()){
  state.projects.push(project('Untitled skin',createDefaultSkin('classic')));
  state.active=state.projects[0].id;
}
setColor(state.color,false);
renderRecentColors();
updateZoom();
refresh();
selectionUI();
syncMannequin();
