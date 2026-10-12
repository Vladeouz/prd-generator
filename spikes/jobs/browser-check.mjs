// Spike T-002, kondisi 1 (navigasi antar halaman): membuka /spike/jobs di Chrome headless, memulai
// job lewat tombol, pindah ke halaman status lewat <Link> (navigasi sisi klien), lalu navigasi penuh
// ke / dan kembali. Membuktikan job tetap berjalan dan status terbaca dari halaman lain.
//
//   node spikes/jobs/browser-check.mjs [base url] [path chrome]
//
// Memakai Chrome DevTools Protocol lewat WebSocket bawaan Node 24, tanpa dependency.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const chromePath = process.argv[3] ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'spike-chrome-'));

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((entry) => entry.type === 'page');
  } catch {}
}
if (!target) throw new Error('Chrome DevTools tidak bisa dihubungi');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
const snapshot = (label) =>
  evaluate(`({
    label: ${JSON.stringify(label)},
    path: location.pathname,
    marker: window.__spikeMarker ?? null,
    title: document.querySelector('h1')?.textContent,
    message: document.querySelector('#message')?.textContent ?? null,
    jobs: document.querySelector('#jobs')?.innerText ?? null,
  })`);

const report = [];
await send('Page.enable');
await send('Page.navigate', { url: `${base}/spike/jobs` });
await sleep(4000);
await evaluate(
  `window.__spikeMarker = 'halaman-awal'; document.querySelector('#start-job').click()`,
);
await sleep(3000);
report.push(await snapshot('setelah klik mulai'));
await evaluate(`document.querySelector('#to-status').click()`);
await sleep(3000);
report.push(await snapshot('setelah <Link> ke halaman status (marker ada = tanpa reload)'));
await sleep(5000);
report.push(await snapshot('5 dtk kemudian di halaman status'));
await send('Page.navigate', { url: `${base}/` });
await sleep(2000);
report.push(await snapshot('navigasi penuh ke /'));
await send('Page.navigate', { url: `${base}/spike/jobs/status` });
await sleep(4000);
report.push(await snapshot('navigasi penuh kembali ke halaman status'));

console.log(JSON.stringify(report, null, 2));
ws.close();
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });
