import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=C:\\Users\\fhneh\\Skinezy\\.tmp-cdp-profile3', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const logs = [];
const failed = [];

function send(method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { res, rej });
    ws.send(JSON.stringify(msg));
  });
}
async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return (await r.json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  throw new Error('chrome did not start');
}
ws = new WebSocket(await connect());
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
  if (m.method === 'Network.loadingFailed') failed.push(m.params.errorText);
});

const { targetId } = await send('Target.createTarget', { url: 'http://127.0.0.1:5173/' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await S('Runtime.enable'); await S('Log.enable'); await S('Page.enable'); await S('Network.enable');
await sleep(3500);

async function evaluate(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function click(selector) {
  const ok = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.scrollIntoView({block:'center'});return true;})()`);
  if (!ok) throw new Error('no element ' + selector);
  await sleep(120);
  const box = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await sleep(200);
}
const readPixel = (x, y) => evaluate(`[...document.querySelector('#skinCanvas').getContext('2d').getImageData(${x},${y},1,1).data]`);
const pixelPoint = (px, py) => evaluate(`(()=>{const r=document.querySelector('#skinCanvas').getBoundingClientRect();return{x:r.left+((${px}+0.5)/64)*r.width,y:r.top+((${py}+0.5)/64)*r.height};})()`);
async function drawStroke(points) {
  const first = await pixelPoint(points[0].x, points[0].y);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: first.x, y: first.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  for (const p of points.slice(1)) {
    const q = await pixelPoint(p.x, p.y);
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left', buttons: 1, pointerType: 'mouse' });
    await sleep(60);
  }
  const last = await pixelPoint(points.at(-1).x, points.at(-1).y);
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(220);
}

const report = {};
report.failedRequests = failed;

// 404 source
report.notFound = await evaluate(`'checked below'`);

// Set a known color for deterministic checks via the color picker
await evaluate(`(()=>{const p=document.querySelector('#colorPicker');p.value='#ff0000';p.dispatchEvent(new Event('input'));})()`);

// --- each tool ---
async function resetSkin() { await click('#newSkin'); }

// pencil
await resetSkin();
await click('.tool[data-tool="pencil"]');
await drawStroke([{ x: 5, y: 5 }]);
report.pencil = await readPixel(5, 5);

// brush (noise 0, size 16) -> should paint a block
await resetSkin();
await evaluate(`(()=>{const s=document.querySelector('#brushSize');s.value='5';s.dispatchEvent(new Event('input'));})()`);
await click('.tool[data-tool="brush"]');
await drawStroke([{ x: 30, y: 30 }]);
report.brushCenter = await readPixel(30, 30);
report.brushNeighbor = await readPixel(32, 32);

// eraser
await click('.tool[data-tool="eraser"]');
await drawStroke([{ x: 30, y: 30 }]);
report.eraserCenter = await readPixel(30, 30);

// fill
await resetSkin();
await click('.tool[data-tool="fill"]');
await drawStroke([{ x: 40, y: 40 }]);
report.fillCorners = [await readPixel(0, 0), await readPixel(63, 63)];

// lighten / darken (need opaque pixels first)
await resetSkin();
await evaluate(`(()=>{const s=document.querySelector('#brushSize');s.value='1';s.dispatchEvent(new Event('input'));})()`);
await click('.tool[data-tool="pencil"]');
await drawStroke([{ x: 50, y: 50 }]);
report.beforeLighten = await readPixel(50, 50);
await click('.tool[data-tool="lighten"]');
await drawStroke([{ x: 50, y: 50 }]);
report.afterLighten = await readPixel(50, 50);
await click('.tool[data-tool="darken"]');
await drawStroke([{ x: 50, y: 50 }]);
report.afterDarken = await readPixel(50, 50);

// eyedropper
await click('.tool[data-tool="eyedropper"]');
await drawStroke([{ x: 50, y: 50 }]);
report.pickedHex = await evaluate(`document.querySelector('#hexColor').value`);

// --- filters: select chip and check apply enabled ---
await click('.filter-chip[data-filter="grayscale"]');
report.grayscaleSelected = await evaluate(`document.querySelector('.filter-chip.selected')?.dataset.filter || null`);
report.applyEnabled = await evaluate(`!document.querySelector('#applyFilter').disabled`);
await click('#previewFilter');
report.previewNote = await evaluate(`!document.querySelector('#filterPreview').classList.contains('hidden')`);
await click('#applyFilter');
report.afterApply = await readPixel(50, 50);

// --- selection ops on a painted skin ---
await resetSkin();
await click('.tool[data-tool="fill"]');
await drawStroke([{ x: 10, y: 10 }]);
await click('.tool[data-tool="select"]');
await drawStroke([{ x: 0, y: 0 }, { x: 7, y: 7 }]);
report.selInfo = await evaluate(`document.querySelector('#selectionInfo').textContent`);
await click('#flipSelectionH');
report.afterFlip = await evaluate(`document.querySelector('#selectionInfo').textContent`);
await click('#copySelection');
report.toastAfterCopy = await evaluate(`document.querySelector('#toast')?.textContent || null`);
await click('#deleteSelection');
report.afterDelete = await readPixel(3, 3);

// --- keyboard shortcuts ---
await resetSkin();
await click('.tool[data-tool="pencil"]');
await drawStroke([{ x: 12, y: 12 }]);
const beforeKeyUndo = await readPixel(12, 12);
await evaluate(`document.body.focus()`);
await S('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await S('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await sleep(250);
report.keyUndo = { before: beforeKeyUndo, after: await readPixel(12, 12) };

// keyboard tool switch
await S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
await sleep(200);
report.keyToolSwitch = await evaluate(`document.querySelector('.tool.active')?.dataset.tool || null`);

// --- top buttons ---
await click('#gridToggle');
report.gridAfterToggle = await evaluate(`document.querySelector('#skinCanvas').classList.contains('grid-on')`);
await click('#swapColors');
report.swappedHex = await evaluate(`document.querySelector('#hexColor').value`);
await click('#fitCanvas');
report.zoomAfterFit = await evaluate(`document.querySelector('#zoomLabel').textContent`);
await click('#undo');

// --- 3D model buttons ---
await click('#preview3d');
await sleep(1000);
report.threeOk = await evaluate(`!!document.querySelector('#threeHost canvas')`);
await click('.model-button[data-model="slim"]');
await sleep(600);
report.afterSlim = await evaluate(`!!document.querySelector('#threeHost canvas')`);

report.logs = logs;
console.log(JSON.stringify(report, null, 2));
ws.close(); chrome.kill(); process.exit(0);
