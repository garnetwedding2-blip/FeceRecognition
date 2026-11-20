/* Selfie Finder – app logic. Settings are read from ../config.json */
'use strict';

const DEFAULT_CONFIG = {
  model: { url: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/' },
  matching: { defaultThreshold: 0.5, minThreshold: 0.3, maxThreshold: 0.7, step: 0.01, confidenceScale: 0.8 },
  image: { maxDimension: 1280 },
  google: { clientId: '', scope: 'https://www.googleapis.com/auth/drive.readonly', pageSize: 200, includeSubfoldersByDefault: true },
  export: { csvFileName: 'matching_photos.csv' }
};

const $ = id => document.getElementById(id);
const state = { cfg: DEFAULT_CONFIG, modelsReady: false, selfie: null, results: [], scanning: false, stop: false, token: null };

function setStatus(el, msg, cls) { el.hidden = false; el.className = 'status ' + (cls || ''); el.textContent = msg; }
function refreshButtons() { $('driveBtn').disabled = !(state.modelsReady && state.selfie); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ---------------- Tabs ---------------- */
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
  t.classList.add('active'); $(t.dataset.pane).classList.add('active');
});

/* ---------------- Boot: config + models ---------------- */
(async function boot() {
  try {
    const r = await fetch('config.json', { cache: 'no-cache' });
    if (r.ok) {
      const c = await r.json();
      state.cfg = {
        model: { ...DEFAULT_CONFIG.model, ...c.model },
        matching: { ...DEFAULT_CONFIG.matching, ...c.matching },
        image: { ...DEFAULT_CONFIG.image, ...c.image },
        google: { ...DEFAULT_CONFIG.google, ...c.google },
        export: { ...DEFAULT_CONFIG.export, ...c.export }
      };
    }
  } catch (e) { console.warn('config.json not loaded, using defaults', e); }

  const m = state.cfg.matching, g = state.cfg.google;
  const th = $('threshold');
  th.min = m.minThreshold; th.max = m.maxThreshold; th.step = m.step; th.value = m.defaultThreshold;
  $('thVal').textContent = Number(m.defaultThreshold).toFixed(2);
  if (g.clientId) $('clientId').value = g.clientId;
  $('recursive').checked = !!g.includeSubfoldersByDefault;

  try {
    if (typeof faceapi === 'undefined') throw new Error('face-api.js failed to load');
    const url = state.cfg.model.url;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url)
    ]);
    state.modelsReady = true;
    setStatus($('modelStatus'), '✓ Models loaded — ready.', 'ok');
    refreshButtons();
  } catch (e) {
    setStatus($('modelStatus'), 'Could not load models: ' + e.message + '. Check your internet connection.', 'bad');
  }
})();

/* ---------------- Image helpers ---------------- */
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image decode failed')); i.src = src; });
}
function toCanvas(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, state.cfg.image.maxDimension / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
async function blobToCanvas(blob) {
  const url = URL.createObjectURL(blob);
  try { return toCanvas(await loadImage(url)); } finally { URL.revokeObjectURL(url); }
}

/* ---------------- Step 1: selfie ---------------- */
async function setSelfieFromCanvas(canvas) {
  if (!state.modelsReady) { setStatus($('selfieStatus'), 'Models still loading — try again in a moment.', 'warn'); return; }
  const wrap = $('selfiePreviewWrap'); wrap.innerHTML = ''; wrap.appendChild(canvas);
  setStatus($('selfieStatus'), 'Analysing selfie…');
  const dets = await faceapi.detectAllFaces(canvas).withFaceLandmarks().withFaceDescriptors();
  if (!dets.length) {
    state.selfie = null;
    setStatus($('selfieStatus'), 'No face found. Try a clearer, well-lit, front-facing photo.', 'bad');
    refreshButtons(); return;
  }
  dets.sort((a, b) => b.detection.box.area - a.detection.box.area);
  state.selfie = dets[0].descriptor;
  const b = dets[0].detection.box, ctx = canvas.getContext('2d');
  ctx.lineWidth = Math.max(3, canvas.width / 120); ctx.strokeStyle = '#3ddc97'; ctx.strokeRect(b.x, b.y, b.width, b.height);
  setStatus($('selfieStatus'),
    dets.length > 1 ? `✓ ${dets.length} faces found — using the largest one.` : '✓ Face detected and encoded.',
    dets.length > 1 ? 'warn' : 'ok');
  refreshButtons();
}
$('selfieFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { await setSelfieFromCanvas(await blobToCanvas(f)); } catch (err) { setStatus($('selfieStatus'), err.message, 'bad'); }
};

let stream = null;
$('camBtn').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = stream; v.style.transform = 'scaleX(-1)';
    const wrap = $('selfiePreviewWrap'); wrap.innerHTML = ''; wrap.appendChild(v); $('snapBtn').hidden = false;
  } catch (e) { setStatus($('selfieStatus'), 'Webcam unavailable: ' + e.message + ' (needs https or localhost).', 'bad'); }
};
$('snapBtn').onclick = async () => {
  const v = $('selfiePreviewWrap').querySelector('video'); if (!v) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  stream.getTracks().forEach(t => t.stop()); $('snapBtn').hidden = true;
  await setSelfieFromCanvas(c);
};

/* ---------------- Step 2a: Google Drive ---------------- */
function parseFolderId(s) {
  s = s.trim();
  const m = s.match(/folders\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}
function getToken(clientId) {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.accounts) return reject(new Error('Google sign-in script not loaded yet.'));
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: state.cfg.google.scope,
      callback: r => r.error ? reject(new Error(r.error_description || r.error)) : resolve(r.access_token),
      error_callback: e => reject(new Error(e.message || e.type || 'sign-in cancelled'))
    });
    tc.requestAccessToken({ prompt: '' });
  });
}
async function driveList(folderId, recursive, token, out = []) {
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/vnd.google-apps.folder')`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${state.cfg.google.pageSize}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,webViewLink)${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Drive list failed: ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    for (const f of j.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') { if (recursive) await driveList(f.id, true, token, out); }
      else out.push(f);
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
$('driveBtn').onclick = async () => {
  const cid = $('clientId').value.trim(), folder = parseFolderId($('folderInput').value);
  if (!cid || !folder) { alert('Enter the OAuth Client ID and a Drive folder link/ID.'); return; }
  try {
    startUI('Signing in to Google…');
    state.token = await getToken(cid);
    $('progressText').textContent = 'Listing images in Drive folder…';
    const files = await driveList(folder, $('recursive').checked, state.token);
    if (!files.length) { $('progressText').textContent = 'No images found in that folder.'; finishUI(); return; }
    await scan(files.length, async i => {
      const f = files[i];
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + state.token } });
      if (!r.ok) throw new Error('download failed');
      return { name: f.name, link: f.webViewLink, canvas: await blobToCanvas(await r.blob()) };
    });
  } catch (e) { $('progressText').textContent = 'Error: ' + e.message; finishUI(); }
};

/* ---------------- Step 2b: local folder ---------------- */
async function localScan(fileList) {
  if (!state.modelsReady || !state.selfie) { alert('Add a selfie first (Step 1).'); return; }
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) { alert('No images found.'); return; }
  startUI('Preparing…');
  await scan(files.length, async i => ({ name: files[i].webkitRelativePath || files[i].name, link: null, canvas: await blobToCanvas(files[i]) }));
}
$('localFolder').onchange = e => localScan(e.target.files);
$('localFiles').onchange = e => localScan(e.target.files);

/* ---------------- Step 3: scan + match ---------------- */
function startUI(msg) {
  $('resultsCard').hidden = false; $('matches').innerHTML = ''; state.results = [];
  $('bar').style.width = '0'; $('progressText').textContent = msg;
  ['sScanned', 'sFaces', 'sMatch'].forEach(id => $(id).textContent = '0');
  $('csvBtn').disabled = true; $('stopBtn').hidden = false; state.stop = false; state.scanning = true;
  $('resultsCard').scrollIntoView({ behavior: 'smooth' });
}
function finishUI() { state.scanning = false; $('stopBtn').hidden = true; }

async function scan(total, fetchItem) {
  let faces = 0;
  for (let i = 0; i < total; i++) {
    if (state.stop) break;
    $('progressText').textContent = `Scanning ${i + 1} / ${total}…`;
    try {
      const item = await fetchItem(i);
      const dets = await faceapi.detectAllFaces(item.canvas).withFaceLandmarks().withFaceDescriptors();
      item.faces = dets.map(d => ({ box: d.detection.box, dist: faceapi.euclideanDistance(state.selfie, d.descriptor) }));
      item.best = item.faces.length ? Math.min(...item.faces.map(f => f.dist)) : Infinity;
      faces += item.faces.length;
      state.results.push(item);
    } catch (e) { console.warn('skipped item', i, e); }
    $('bar').style.width = ((i + 1) / total * 100) + '%';
    $('sScanned').textContent = i + 1; $('sFaces').textContent = faces;
    render();
    await new Promise(r => setTimeout(r)); // keep UI responsive
  }
  $('progressText').textContent = state.stop ? 'Stopped.' : `Done — scanned ${state.results.length} photo(s).`;
  finishUI();
}
$('stopBtn').onclick = () => { state.stop = true; };

function render() {
  const th = parseFloat($('threshold').value);
  $('thVal').textContent = th.toFixed(2);
  const host = $('matches'); host.innerHTML = '';
  const hits = state.results.filter(r => r.best <= th).sort((a, b) => a.best - b.best);
  hits.forEach(r => {
    const card = document.createElement('div'); card.className = 'photo';
    const c = document.createElement('canvas'); c.width = r.canvas.width; c.height = r.canvas.height;
    const ctx = c.getContext('2d'); ctx.drawImage(r.canvas, 0, 0);
    ctx.lineWidth = Math.max(3, c.width / 150);
    r.faces.forEach(f => {
      ctx.strokeStyle = f.dist <= th ? '#3ddc97' : 'rgba(255,255,255,.35)';
      ctx.strokeRect(f.box.x, f.box.y, f.box.width, f.box.height);
    });
    const meta = document.createElement('div'); meta.className = 'meta';
    const conf = Math.max(0, Math.min(100, Math.round((1 - r.best / state.cfg.matching.confidenceScale) * 100)));
    const safeLink = r.link && /^https:\/\//.test(r.link) ? esc(r.link) : '';
    meta.innerHTML = `<span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
      <span class="badge">${conf}% match · d=${r.best.toFixed(2)}</span>
      ${safeLink ? `<a href="${safeLink}" target="_blank" rel="noopener">Open in Drive ↗</a>` : ''}`;
    card.append(c, meta); host.appendChild(card);
  });
  $('sMatch').textContent = hits.length;
  $('csvBtn').disabled = !hits.length;
}
$('threshold').oninput = render;

$('csvBtn').onclick = () => {
  const th = parseFloat($('threshold').value);
  const rows = [['name', 'distance', 'link']].concat(state.results.filter(r => r.best <= th).map(r => [r.name, r.best.toFixed(3), r.link || '']));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = state.cfg.export.csvFileName; a.click();
};
