import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9340;
const URL_ = process.argv[2] || 'http://127.0.0.1:5173/';
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=C:\\Users\\fhneh\\Skinezy\\.tmp-cdp-profile4', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; pending.set(m.id, { res, rej }); ws.send(JSON.stringify(m)); });
async function connect() { for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(250); } } throw new Error('no chrome'); }
ws = new WebSocket(await connect());
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
});
const { targetId } = await send('Target.createTarget', { url: URL_ });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await S('Runtime.enable'); await S('Log.enable'); await S('Page.enable');
await sleep(3500);

const evaluate = async expr => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
async function click(sel) {
  await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(el)el.scrollIntoView({block:'center'});})()`); await sleep(120);
  const b = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await S('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(200);
}
const readPixel = (x, y) => evaluate(`[...document.querySelector('#skinCanvas').getContext('2d').getImageData(${x},${y},1,1).data]`);
const pt = (px, py) => evaluate(`(()=>{const r=document.querySelector('#skinCanvas').getBoundingClientRect();return{x:r.left+((${px}+0.5)/64)*r.width,y:r.top+((${py}+0.5)/64)*r.height};})()`);
async function stroke(points) {
  const a = await pt(points[0].x, points[0].y);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  for (const p of points.slice(1)) { const q = await pt(p.x, p.y); await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left', buttons: 1, pointerType: 'mouse' }); await sleep(60); }
  const z = await pt(points.at(-1).x, points.at(-1).y);
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z.x, y: z.y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(220);
}

const report = {};
report.boot = await evaluate(`({canvas:!!document.querySelector('#skinCanvas'),tabs:document.querySelectorAll('.project-tab').length})`);
await evaluate(`(()=>{const p=document.querySelector('#colorPicker');p.value='#00ff00';p.dispatchEvent(new Event('input'));})()`);
await evaluate(`(()=>{const s=document.querySelector('#brushSize');s.value='1';s.dispatchEvent(new Event('input'));})()`);

// --- HYPOTHESIS: a leftover selection silently blocks every tool outside its box ---
await click('.tool[data-tool="pencil"]');
await stroke([{ x: 2, y: 2 }]);
report.A_pencil_no_selection = await readPixel(2, 2);

// make a selection in the far corner
await click('.tool[data-tool="select"]');
await stroke([{ x: 60, y: 60 }, { x: 63, y: 63 }]);
report.B_selection = await evaluate(`document.querySelector('#selectionInfo').textContent`);

// now go back to pencil and draw somewhere ELSE (outside the selection)
await click('.tool[data-tool="pencil"]');
await stroke([{ x: 20, y: 20 }]);
report.C_pencil_outside_selection = await readPixel(20, 20);   // expect transparent => "tool does nothing"
report.C_statusbar = await evaluate(`document.querySelector('#saveStatus').textContent`);
report.C_no_feedback = await evaluate(`!document.querySelector('#toast')`);

// eraser outside selection too
await click('.tool[data-tool="eraser"]');
await stroke([{ x: 2, y: 2 }]);
report.D_eraser_outside_selection = await readPixel(2, 2);    // still green => eraser silently did nothing

// fill outside selection
await click('.tool[data-tool="fill"]');
await stroke([{ x: 30, y: 30 }]);
report.E_fill_outside_selection = await readPixel(63, 0);      // transparent => no visible change

// lighten/darken outside selection
await click('.tool[data-tool="lighten"]');
await stroke([{ x: 2, y: 2 }]);
report.F_lighten_outside = await readPixel(2, 2);

// only after clearing the selection do tools work again
await click('#deselect');
await click('.tool[data-tool="pencil"]');
await stroke([{ x: 20, y: 20 }]);
report.G_pencil_after_deselect = await readPixel(20, 20);
report.G_selInfo = await evaluate(`document.querySelector('#selectionInfo').textContent`);

report.logs = logs;
console.log(JSON.stringify(report, null, 2));
ws.close(); chrome.kill(); process.exit(0);
