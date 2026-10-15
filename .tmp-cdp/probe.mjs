import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=C:\\Users\\fhneh\\Skinezy\\.tmp-cdp-profile', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const logs = [];

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
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const v = await r.json();
      return v.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('chrome did not start');
}

const wsUrl = await connect();
ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
});

const { targetId } = await send('Target.createTarget', { url: 'http://127.0.0.1:5173/' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Runtime.enable');
await S('Log.enable');
await S('Page.enable');
await sleep(3500);

async function evaluate(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function click(selector) {
  const box = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!box) throw new Error('no element ' + selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await sleep(180);
}

// ---- checks ----
const report = {};

report.boot = await evaluate(`({
  hasCanvas: !!document.querySelector('#skinCanvas'),
  tabs: document.querySelectorAll('.project-tab').length,
  hasUv: !!document.querySelector('#uvOverlay'),
  saveStatus: document.querySelector('#saveStatus').textContent
})`);

// pixel readback helper
const readPixel = (x, y) => evaluate(`(()=>{const c=document.querySelector('#skinCanvas');const d=c.getContext('2d').getImageData(${x},${y},1,1).data;return[...d];})()`);

// canvas center coords for a given skin pixel
const pixelPoint = (px, py) => evaluate(`(()=>{const c=document.querySelector('#skinCanvas');const r=c.getBoundingClientRect();return{x:r.left+((${px}+0.5)/64)*r.width,y:r.top+((${py}+0.5)/64)*r.height};})()`);

async function drawAt(px, py) {
  const p = await pixelPoint(px, py);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, pointerType: 'mouse' });
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(200);
}

// 1. pencil draw
report.pencilBefore = await readPixel(10, 10);
await drawAt(10, 10);
report.pencilAfter = await readPixel(10, 10);
report.pencilDirty = await evaluate(`document.querySelector('#saveStatus').textContent`);

// 2. undo button
await click('#undo');
report.afterUndo = await readPixel(10, 10);

// 3. eyedropper: set color then pick
await click('.tool[data-tool="eyedropper"]');
report.toolActive = await evaluate(`document.querySelector('.tool.active')?.dataset.tool`);

// 4. fill
await click('.tool[data-tool="fill"]');
await drawAt(20, 20);
report.fillAfter = await readPixel(20, 20);

// 5. select tool + outline
await click('.tool[data-tool="select"]');
{
  const a = await pixelPoint(2, 2), b = await pixelPoint(8, 8);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1, pointerType: 'mouse' });
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(250);
}
report.selectionInfo = await evaluate(`document.querySelector('#selectionInfo').textContent`);
report.selectionOutlineHidden = await evaluate(`document.querySelector('#selectionOutline').classList.contains('hidden')`);

// 6. filters: choose grayscale, preview, apply
await click('.filter-chip[data-filter="grayscale"]');
report.filterSelected = await evaluate(`document.querySelector('.filter-chip.selected')?.dataset.filter`);
report.applyDisabledBefore = await evaluate(`document.querySelector('#applyFilter').disabled`);
await click('#previewFilter');
report.previewNoteVisible = await evaluate(`!document.querySelector('#filterPreview').classList.contains('hidden')`);

// 7. new skin button
const projectsBefore = await evaluate(`document.querySelectorAll('.project-tab').length`);
await click('#newSkin');
const projectsAfter = await evaluate(`document.querySelectorAll('.project-tab').length`);
report.newSkin = { projectsBefore, projectsAfter };

// 8. view switching
await click('#preview3d');
await sleep(1200);
report.threeHost = await evaluate(`!!document.querySelector('#threeHost')`);
report.threeCanvas = await evaluate(`!!document.querySelector('#threeHost canvas')`);
await click('#rawView');
report.uvVisibleInRaw = await evaluate(`getComputedStyle(document.querySelector('#uvOverlay')).display`);
await click('#textureView');

// 9. zoom
report.zoomBefore = await evaluate(`document.querySelector('#zoomLabel').textContent`);
await click('#zoomIn');
report.zoomAfter = await evaluate(`document.querySelector('#zoomLabel').textContent`);

// 10. compare
await click('#compare');
report.compareOpen = await evaluate(`!document.querySelector('#comparePanel').classList.contains('hidden')`);

report.logs = logs;
console.log(JSON.stringify(report, null, 2));

ws.close();
chrome.kill();
process.exit(0);
