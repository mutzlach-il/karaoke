/* אולפן הקריוקי שלי */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DEFAULT_SERVER = 'https://mutzlach-il-karaoke-backend.hf.space';
const STEM_NAMES = { vocals: 'stVocals', no_vocals: 'stMusic', drums: 'stDrums', bass: 'stBass', other: 'stOther' };

/* ===================== הגדרות ושפה ===================== */
const store = {
  get(k, d) { try { const v = localStorage.getItem('kp_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kp_' + k, JSON.stringify(v)); } catch {} }
};
let LANG = store.get('lang', 'he') === 'en' ? 'en' : 'he';
function t(k, vars) {
  const d = (window.I18N[LANG] && window.I18N[LANG][k]) || window.I18N.he[k] || k;
  return vars ? d.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '') : d;
}
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'en' ? 'ltr' : 'rtl';
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t('appName');
  $('#langSel').value = LANG;
  renderGuide(); renderWarmups(); setPageTitle();
  if (song) { renderMixer(); renderLyrics(true); renderTakes(); updateMeta(); }
  renderLibrary();
}
$('#langSel').onchange = e => { LANG = e.target.value; store.set('lang', LANG); applyLang(); };

const NTFY_TOPIC = 'keter-karaoke-mutzlach-7d3f9a';
let AUTO_SERVER = store.get('autoServer', '');
function server() { return (store.get('server', '') || AUTO_SERVER || DEFAULT_SERVER).replace(/\/+$/, ''); }
async function pingServer(u, ms = 4000) { try { const r = await fetchT(u.replace(/\/+$/, '') + '/', {}, ms); return r.ok; } catch { return false; } }
// מוצא את השרת לבד: קודם המחשב הזה, ואחר כך הכתובת הציבורית האחרונה שהשרת פרסם
async function discoverServer() {
  if (store.get('server', '')) return server();
  const cands = ['http://127.0.0.1:7860'];
  try {
    const txt = await (await fetchT(`https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=24h`, {}, 8000)).text();
    const msgs = txt.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(m => m && m.event === 'message');
    if (msgs.length) cands.push(msgs[msgs.length - 1].message.trim());
  } catch {}
  for (const c of cands) if (await pingServer(c, 3000)) { AUTO_SERVER = c; store.set('autoServer', c); return c; }
  return null;
}

/* ===================== ערכת צבעים ===================== */
function applyTheme() {
  const th = store.get('theme', 'dark');
  document.documentElement.dataset.theme = th;
  $('#themeBtn').textContent = th === 'dark' ? '☀️' : '🌙';
}
$('#themeBtn').onclick = () => { store.set('theme', store.get('theme', 'dark') === 'dark' ? 'light' : 'dark'); applyTheme(); };

/* ===================== עזרים ===================== */
function toast(msg, ms = 2800) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), ms);
}
function fmt(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function safeName(s) { return String(s || 'song').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60); }
function modal(html, onReady) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); onReady && onReady(m); return m;
}
function ask(title, value = '') {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><input type="text" id="askIn" value="${esc(value)}"><div class="row" style="margin-top:12px">
      <button class="btn pri" id="askOk">${t('ok')}</button><button class="btn" id="askNo">${t('cancel')}</button></div>`);
    const inp = m.querySelector('#askIn'); inp.focus(); inp.select();
    const done = v => { m.remove(); res(v); };
    m.querySelector('#askOk').onclick = () => done(inp.value.trim());
    m.querySelector('#askNo').onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); };
  });
}

/* ===================== מסד נתונים מקומי (IndexedDB) ===================== */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let r; try { r = indexedDB.open('karaoke', 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => {
        const d = r.result;
        ['songs', 'blobs', 'playlists'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async op(st, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(st, mode); const s = tx.objectStore(st); const r = fn(s);
      tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error);
    });
  },
  get(st, k) { return this.op(st, 'readonly', s => s.get(k)).catch(() => undefined); },
  put(st, k, v) { return this.op(st, 'readwrite', s => s.put(v, k)).catch(() => {}); },
  del(st, k) { return this.op(st, 'readwrite', s => s.delete(k)).catch(() => {}); },
  all(st) { return this.op(st, 'readonly', s => s.getAll()).catch(() => []); },
  keys(st) { return this.op(st, 'readonly', s => s.getAllKeys()).catch(() => []); },
  clear(st) { return this.op(st, 'readwrite', s => s.clear()).catch(() => {}); }
};

/* ===================== ניווט ===================== */
const PAGE_TITLES = { studio: 'tabStudio', library: 'tabLibrary', party: 'tabParty', practice: 'tabPractice', guide: 'tabGuide', settings: 'tabSettings' };
function curView() { return (location.hash || '#welcome').slice(1).split('?')[0] || 'welcome'; }
function setPageTitle() { const k = PAGE_TITLES[curView()]; if ($('#pageTitle')) $('#pageTitle').textContent = k ? t(k) : ''; }
function show(view) {
  if (!document.getElementById('view-' + view)) view = 'home';
  document.body.classList.toggle('on-welcome', view === 'welcome');
  $('#tabs').classList.toggle('hidden', view === 'home');
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'view-' + view));
  setPageTitle(); window.scrollTo(0, 0);
  if (view === 'library') renderLibrary();
  if (view === 'party') renderParty();
  if (view === 'settings') renderSettings();
}
$$('#tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.view; });
window.addEventListener('hashchange', () => show(curView()));
$('#startBtn').onclick = () => { location.hash = 'home'; };

/* ===================== שליחה לשרת ===================== */
let MODE = '2';
$$('#modeSeg button').forEach(b => b.onclick = () => {
  MODE = b.dataset.mode; $$('#modeSeg button').forEach(x => x.classList.toggle('on', x === b));
});

const STAGES = { 'בתור': 'stQueued', 'מוריד מיוטיוב': 'stDownloading', 'מכין את הקובץ': 'stPreparing',
  'מפריד קולות': 'stSeparating', 'מוכן': 'stReady', 'שגיאה': 'stError' };

function setJob(pct, msg, cls = '') {
  $('#jobBox').classList.remove('hidden');
  $('#jobBar').style.width = Math.max(2, pct) + '%';
  const st = $('#jobStatus'); st.textContent = msg; st.className = 'status ' + cls;
}

async function fetchT(url, opts = {}, ms = 20000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(id); }
}

// השרת החינמי נרדם – מעירים אותו ומחכים בסבלנות (רעיון 4)
async function wakeServer() {
  if (await pingServer(server(), 5000) || await discoverServer()) return true;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetchT(server() + '/', {}, 15000); if (r.ok) return true; } catch {}
    setJob(3, t('waking', { n: i + 1 }));
    await new Promise(r => setTimeout(r, 10000));
  }
  return false;
}

async function apiError(r) {
  let d = {}; try { d = await r.json(); } catch {}
  return d.detail || t('serverErr', { code: r.status });
}

let busy = false;
async function submit(kind, payload) {
  if (busy) return; busy = true;
  $('#ytBtn').disabled = $('#pickBtn').disabled = true;
  try {
    setJob(2, t('connecting'));
    if (!(await wakeServer())) { setJob(0, t('noServer'), 'err'); return; }
    let r;
    if (kind === 'file') {
      const fd = new FormData(); fd.append('file', payload); fd.append('mode', MODE);
      setJob(4, t('uploading'));
      r = await fetchT(server() + '/upload', { method: 'POST', body: fd }, 300000);
    } else {
      r = await fetchT(server() + '/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: payload, mode: MODE }) }, 60000);
    }
    if (!r.ok) { setJob(0, '❌ ' + await apiError(r), 'err'); return; }
    const job = await r.json();
    await poll(job.id);
  } catch (e) {
    setJob(0, '❌ ' + t('netErr'), 'err');
  } finally {
    busy = false; $('#ytBtn').disabled = $('#pickBtn').disabled = false;
  }
}

async function poll(id) {
  let fails = 0;
  while (true) {
    let j;
    try {
      const r = await fetchT(server() + '/job/' + id, {}, 20000);
      if (!r.ok) { setJob(0, '❌ ' + await apiError(r), 'err'); return; }
      j = await r.json(); fails = 0;
    } catch { if (++fails > 10) { setJob(0, '❌ ' + t('netErr'), 'err'); return; } await sleep(3000); continue; }
    const stage = t(STAGES[j.stage] || 'stWorking');
    if (j.status === 'queued') setJob(3, t('inQueue', { n: j.position || 1 }));
    else if (j.status === 'running') setJob(j.progress, `${stage}… ${j.progress}%`);
    else if (j.status === 'error') { setJob(0, '❌ ' + j.error, 'err'); return; }
    else if (j.status === 'done') {
      setJob(100, '✅ ' + t('stReady'), 'ok'); window.track && track('song');
      await openSong(songFromJob(j));
      return;
    }
    await sleep(2000);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function songFromJob(j, srv = server()) {
  return { id: j.id, server: srv, title: j.title || t('song'), mode: j.mode, stems: Object.keys(j.files).filter(k => k !== 'original'),
    files: j.files, duration: j.duration, lyrics: j.lyrics || null, markers: [], tags: [], fav: false,
    created: Date.now(), plays: 0, scores: [], profile: store.get('profile', 'main'), offline: false };
}

/* ----- קובץ: בחירה וגרירה לכל מקום בעמוד (רעיון 43) ----- */
$('#pickBtn').onclick = e => { e.stopPropagation(); $('#fileInput').click(); };
$('#drop').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => { const f = e.target.files[0]; if (f) submit('file', f); e.target.value = ''; };
let dragN = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragN++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragN = 0; document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (f) { location.hash = 'studio'; submit('file', f); }
});
$('#ytBtn').onclick = () => {
  const u = $('#ytInput').value.trim();
  if (!/youtu\.?be/.test(u)) { toast(t('badLink')); return; }
  submit('yt', u);
};
$('#ytInput').onkeydown = e => { if (e.key === 'Enter') $('#ytBtn').click(); };

/* ===================== נגן ===================== */
let song = null;
const P = { ctx: null, els: {}, gains: {}, master: null, pitch: null, analyser: null, playing: false,
  loopA: null, loopB: null, source: 'karaoke', levels: {}, raf: 0, peaks: null, buffers: {} };

function audioCtx() {
  if (P.ctx) return P.ctx;
  if (window.Tone) { P.ctx = Tone.getContext().rawContext; }
  else P.ctx = new (window.AudioContext || window.webkitAudioContext)();
  P.master = P.ctx.createGain();
  if (window.Tone) {
    try { P.pitch = new Tone.PitchShift({ pitch: 0, windowSize: 0.08 }); P.pitch.wet.value = 0;
      Tone.connect(P.master, P.pitch); P.pitch.toDestination(); }
    catch (e) { P.pitch = null; P.master.connect(P.ctx.destination); }
  } else P.master.connect(P.ctx.destination);
  return P.ctx;
}

async function stemURL(stem) {
  if (song.offline) {
    const b = await DB.get('blobs', song.id + ':' + stem);
    if (b) return URL.createObjectURL(b);
  }
  return song.server + song.files[stem];
}

async function openSong(s) {
  stopAll(true);
  Object.values(P.els).forEach(a => { a.pause(); a.src = ''; });
  P.els = {}; P.gains = {}; P.buffers = {}; P.peaks = null; P.loopA = P.loopB = null;
  song = s;
  const saved = await DB.get('songs', s.id);
  if (saved) song = Object.assign(saved, { files: s.files || saved.files, server: s.server || saved.server });
  song.plays = (song.plays || 0) + 1; song.lastPlayed = Date.now();
  if (saved) DB.put('songs', song.id, song);
  const ctx = audioCtx();
  for (const stem of song.stems) {
    const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto';
    a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true;
    a.src = await stemURL(stem);
    const src = ctx.createMediaElementSource(a); const g = ctx.createGain();
    src.connect(g); g.connect(P.master);
    if (stem === 'vocals') { P.analyser = ctx.createAnalyser(); P.analyser.fftSize = 2048; src.connect(P.analyser); }
    P.els[stem] = a; P.gains[stem] = g;
    if (P.levels[stem] == null) P.levels[stem] = 1;
  }
  P.levels.vocals = 0;
  P.source = 'karaoke'; setSourceBtns(); applyGains();
  const first = P.els[song.stems[0]];
  first.onended = () => onEnded();
  first.onloadedmetadata = () => updateTime();
  $('#songArea').classList.remove('hidden');
  $('#songTitle').textContent = song.title;
  $('#favBtn').classList.toggle('on', !!song.fav);
  $('#pitch').value = 0; $('#tempo').value = 100; setPitch(0); setTempo(100);
  updateMeta(); renderMixer(); renderMarkers(); renderLyrics(true); renderTakes(); updateLoopLbl();
  history.replaceState(null, '', '#studio');
  loadWave();
  $('#songArea').scrollIntoView({ behavior: 'smooth' });
}

function updateMeta() {
  if (!song) return;
  const parts = [song.mode === '4' ? t('mode4short') : t('mode2short')];
  if (song.duration) parts.push(fmt(song.duration));
  if (!song.offline) parts.push(t('expires24'));
  else parts.push(t('savedOffline'));
  $('#songMeta').textContent = parts.join(' · ');
}

function applyGains() {
  for (const [stem, g] of Object.entries(P.gains)) {
    let v = P.levels[stem] ?? 1;
    if (stem === 'vocals' && P.source === 'original') v = 1;
    if (P.muted && P.muted[stem]) v = 0;
    g.gain.value = v;
  }
}
function setSourceBtns() {
  $('#srcKaraoke').classList.toggle('on', P.source === 'karaoke');
  $('#srcOriginal').classList.toggle('on', P.source === 'original');
}
$('#srcKaraoke').onclick = () => { P.source = 'karaoke'; setSourceBtns(); applyGains(); renderMixer(); };
$('#srcOriginal').onclick = () => { P.source = 'original'; setSourceBtns(); applyGains(); renderMixer(); };

function renderMixer() {
  if (!song) return;
  P.muted = P.muted || {};
  $('#mixer').innerHTML = song.stems.map(s => {
    const v = Math.round((s === 'vocals' && P.source === 'original' ? 1 : (P.levels[s] ?? 1)) * 100);
    return `<div class="ch"><div class="row"><b>${t(STEM_NAMES[s])}</b>
      <span><span class="muted" id="lv_${s}">${v}%</span>
      <button class="btn sm ${P.muted[s] ? 'on' : ''}" data-mute="${s}">${P.muted[s] ? t('unmute') : t('mute')}</button>
      <a class="btn sm" data-dl="${s}" title="${t('download')}">⬇</a></span></div>
      <input type="range" min="0" max="150" value="${v}" data-stem="${s}"></div>`;
  }).join('');
  $$('#mixer input[type=range]').forEach(r => r.oninput = () => {
    const s = r.dataset.stem; P.levels[s] = r.value / 100;
    if (s === 'vocals' && P.source === 'original') { P.source = 'karaoke'; setSourceBtns(); }
    $('#lv_' + s).textContent = r.value + '%'; applyGains();
  });
  $$('#mixer [data-mute]').forEach(b => b.onclick = () => { const s = b.dataset.mute; P.muted[s] = !P.muted[s]; applyGains(); renderMixer(); });
  $$('#mixer [data-dl]').forEach(b => b.onclick = async () => {
    const s = b.dataset.dl; const blob = await getStemBlob(s);
    if (blob) download(blob, `${safeName(song.title)} - ${t(STEM_NAMES[s])}.mp3`);
  });
}

async function getStemBlob(stem) {
  if (song.offline) { const b = await DB.get('blobs', song.id + ':' + stem); if (b) return b; }
  try { const r = await fetch(song.server + song.files[stem]); if (!r.ok) throw 0; return await r.blob(); }
  catch { toast(t('fileGone')); return null; }
}

const master = () => P.els[song?.stems[0]];
function curTime() { return master()?.currentTime || 0; }
function duration() { const m = master(); return (m && isFinite(m.duration) ? m.duration : song?.duration) || 0; }

async function playAll(withCountdown) {
  if (!song) return;
  audioCtx(); if (P.ctx.state === 'suspended') await P.ctx.resume();
  if (window.Tone && Tone.context.state !== 'running') { try { await Tone.start(); } catch {} }
  if (withCountdown && $('#countdownChk').checked) await countdown();
  const t0 = curTime();
  const ps = Object.values(P.els).map(a => { a.currentTime = t0; return a.play().catch(() => {}); });
  await Promise.all(ps);
  P.playing = true; $('#playBtn').textContent = '⏸';
  loop();
  if ($('#metroChk').checked) startMetro(currentBpm());
}
function pauseAll() {
  Object.values(P.els).forEach(a => a.pause());
  P.playing = false; $('#playBtn').textContent = '▶'; stopMetro();
}
function stopAll(silent) {
  if (!song) return;
  pauseAll(); seek(0);
  if (!silent && REC.active) stopRec();
}
function seek(tm) {
  const d = duration(); tm = Math.max(0, Math.min(d || tm, tm));
  Object.values(P.els).forEach(a => { try { a.currentTime = tm; } catch {} });
  updateTime(); renderLyrics();
}
function onEnded() {
  pauseAll();
  if (REC.active) stopRec();
  if (PL.active) PL.next();
}
$('#playBtn').onclick = () => P.playing ? pauseAll() : playAll(curTime() < 0.5);
$('#stopBtn').onclick = () => stopAll();
$('#back5').onclick = () => seek(curTime() - 5);
$('#fwd5').onclick = () => seek(curTime() + 5);

function loop() {
  cancelAnimationFrame(P.raf);
  const tick = () => {
    if (!P.playing) return;
    const m = master(); const tm = m.currentTime;
    // סנכרון בין הערוצים
    for (const a of Object.values(P.els)) if (a !== m && Math.abs(a.currentTime - tm) > 0.08) a.currentTime = tm;
    if (P.loopA != null && P.loopB != null && tm >= P.loopB) seek(P.loopA);
    updateTime(); renderLyrics(); drawWave();
    if (REC.active) recTick();
    P.raf = requestAnimationFrame(tick);
  };
  P.raf = requestAnimationFrame(tick);
}
function updateTime() { $('#timeLbl').textContent = `${fmt(curTime())} / ${fmt(duration())}`; drawWave(); }

/* ----- ספירה לאחור (13) ----- */
function countdown() {
  return new Promise(res => {
    const box = $('#lyrics'); const c = document.createElement('div'); c.className = 'count'; box.appendChild(c);
    let n = 3; c.textContent = n;
    const beep = f => { try { const o = P.ctx.createOscillator(), g = P.ctx.createGain(); o.frequency.value = f; g.gain.value = .15;
      o.connect(g); g.connect(P.ctx.destination); o.start(); o.stop(P.ctx.currentTime + .12); } catch {} };
    beep(660);
    const id = setInterval(() => { n--; if (n <= 0) { clearInterval(id); c.remove(); beep(990); res(); } else { c.textContent = n; beep(660); } }, 800);
  });
}

/* ----- סולם ומהירות (10, 11) ----- */
function setPitch(v) {
  v = +v; $('#pitchLbl').textContent = (v > 0 ? '+' : '') + v;
  if (P.pitch) { P.pitch.pitch = v; P.pitch.wet.value = v === 0 ? 0 : 1; }
}
function setTempo(v) {
  $('#tempoLbl').textContent = v + '%';
  Object.values(P.els).forEach(a => { a.playbackRate = v / 100; });
  if (METRO.on) startMetro(currentBpm());
}
$('#pitch').oninput = e => setPitch(e.target.value);
$('#tempo').oninput = e => setTempo(+e.target.value);
if (!window.Tone) $('#pitch').disabled = true;

/* ----- לולאה (12) וסימניות (58, 59) ----- */
function updateLoopLbl() {
  $('#loopLbl').textContent = P.loopA == null ? '—' : `${fmt(P.loopA)} → ${P.loopB == null ? '…' : fmt(P.loopB)}`;
}
$('#loopA').onclick = () => { P.loopA = curTime(); if (P.loopB != null && P.loopB <= P.loopA) P.loopB = null; updateLoopLbl(); };
$('#loopB').onclick = () => { if (P.loopA == null) P.loopA = 0; P.loopB = Math.max(curTime(), P.loopA + 1); updateLoopLbl(); };
$('#loopOff').onclick = () => { P.loopA = P.loopB = null; updateLoopLbl(); };
function addMarker(type) {
  if (!song) return; song.markers = song.markers || [];
  song.markers.push({ t: curTime(), type }); song.markers.sort((a, b) => a.t - b.t);
  persist(); renderMarkers(); toast(t(type === 'chorus' ? 'chorusMarked' : 'hardMarked'));
}
$('#markChorus').onclick = () => addMarker('chorus');
$('#markHard').onclick = () => addMarker('hard');
$('#goChorus').onclick = () => {
  const c = (song?.markers || []).filter(m => m.type === 'chorus');
  if (!c.length) { toast(t('noChorus')); return; }
  const next = c.find(m => m.t > curTime() + 1) || c[0]; seek(next.t);
};
function renderMarkers() {
  const ms = song?.markers || [];
  $('#markList').innerHTML = ms.map((m, i) => `<span class="pill">${m.type === 'chorus' ? '🎶' : '⚠️'}
    <a href="#" data-go="${i}">${fmt(m.t)}</a> <a href="#" data-loop="${i}" title="${t('loop')}">🔁</a>
    <a href="#" data-rm="${i}">✕</a></span>`).join('');
  $$('#markList [data-go]').forEach(a => a.onclick = e => { e.preventDefault(); seek(ms[a.dataset.go].t); });
  $$('#markList [data-loop]').forEach(a => a.onclick = e => { e.preventDefault(); const m = ms[a.dataset.loop];
    P.loopA = m.t; P.loopB = Math.min(duration(), m.t + 15); updateLoopLbl(); seek(m.t); });
  $$('#markList [data-rm]').forEach(a => a.onclick = e => { e.preventDefault(); ms.splice(a.dataset.rm, 1); persist(); renderMarkers(); drawWave(); });
  drawWave();
}

/* ----- צורת גל (44) וזיהוי קצב (54) ----- */
async function decodeStem(stem) {
  if (P.buffers[stem]) return P.buffers[stem];
  const b = await getStemBlob(stem); if (!b) return null;
  const buf = await audioCtx().decodeAudioData(await b.arrayBuffer());
  P.buffers[stem] = buf; return buf;
}
async function loadWave() {
  const id = song.id;
  try {
    const stem = song.stems.includes('no_vocals') ? 'no_vocals' : song.stems[song.stems.length - 1];
    const buf = await decodeStem(stem); if (!buf || song?.id !== id) return;
    const ch = buf.getChannelData(0); const N = 600; const step = Math.floor(ch.length / N); const peaks = [];
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(ch[j])); peaks.push(m); }
    P.peaks = peaks; drawWave();
    song.bpm = song.bpm || detectBpm(ch, buf.sampleRate);
    $('#bpmLbl').textContent = 'BPM ' + (song.bpm || '—');
  } catch (e) { console.warn('wave', e); }
}
function detectBpm(data, sr) {
  const hop = 512, env = [];
  for (let i = 0; i + hop < data.length && env.length < 6000; i += hop) {
    let e = 0; for (let j = i; j < i + hop; j += 4) e += data[j] * data[j]; env.push(e);
  }
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  const fps = sr / hop; let best = 0, bpm = 0;
  for (let b = 70; b <= 180; b++) {
    const lag = Math.round(fps * 60 / b); let s = 0;
    for (let i = lag; i < flux.length; i++) s += flux[i] * flux[i - lag];
    if (s > best) { best = s; bpm = b; }
  }
  return bpm || null;
}
function drawWave() {
  const c = $('#wave'); if (!c || !song) return;
  const w = c.width = c.clientWidth * devicePixelRatio, h = c.height = 90 * devicePixelRatio;
  const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
  const d = duration() || 1, pos = curTime() / d;
  const css = getComputedStyle(document.documentElement);
  if (P.peaks) {
    const bw = w / P.peaks.length;
    P.peaks.forEach((p, i) => {
      const bh = Math.max(2, p * h * .9);
      g.fillStyle = i / P.peaks.length < pos ? css.getPropertyValue('--brand') : css.getPropertyValue('--line');
      g.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 1), bh);
    });
  } else { g.fillStyle = css.getPropertyValue('--line'); g.fillRect(0, h / 2 - 1, w, 2); g.fillStyle = css.getPropertyValue('--brand'); g.fillRect(0, h / 2 - 1, w * pos, 2); }
  if (P.loopA != null) { g.fillStyle = '#facc1533'; g.fillRect(P.loopA / d * w, 0, ((P.loopB ?? curTime()) - P.loopA) / d * w, h); }
  (song.markers || []).forEach(m => { g.fillStyle = m.type === 'chorus' ? '#22c55e' : '#f59e0b'; g.fillRect(m.t / d * w - 1, 0, 3 * devicePixelRatio, h); });
}
$('#wave').onclick = e => { const r = e.target.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width;
  if (document.documentElement.dir === 'rtl' && false) x = 1 - x; seek(x * duration()); };
window.addEventListener('resize', drawWave);

/* ----- מטרונום (55) ----- */
const METRO = { on: false, id: 0 };
function currentBpm() { return Math.round((song?.bpm || +$('#metroBpm').value || 90) * (+$('#tempo').value / 100)); }
function click(accent) {
  const ctx = audioCtx(); const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = accent ? 1500 : 1000; g.gain.setValueAtTime(.25, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .05);
  o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .06);
}
function startMetro(bpm) { stopMetro(); METRO.on = true; let n = 0; click(true); METRO.id = setInterval(() => click(++n % 4 === 0), 60000 / bpm); }
function stopMetro() { METRO.on = false; clearInterval(METRO.id); }
$('#metroChk').onchange = e => { if (e.target.checked && P.playing) startMetro(currentBpm()); else stopMetro(); };
$('#metroToggle').onclick = async () => { audioCtx(); await P.ctx.resume(); METRO.on ? stopMetro() : startMetro(+$('#metroBpm').value || 90); };

/* ===================== מילים (15–19, 48, 71–75) ===================== */
let lastLine = -2;
function lyricLines() { return song?.lyrics?.lines || []; }
function lineText(l) { return l.words?.length ? l.words.map(w => w.w).join(' ') : (l.text || ''); }
function renderLyrics(force) {
  const box = $('#lyrics'); if (!song) return;
  const lines = lyricLines();
  const keepEls = () => [...box.querySelectorAll(':scope > .keep')];
  const setHTML = html => { const k = keepEls(), cd = box.querySelector(':scope > .count'); box.innerHTML = html; k.forEach(e => box.prepend(e)); if (cd) box.appendChild(cd); };
  if (!lines.length) { if (force) setHTML(`<div class="ln muted">${t('noLyrics')}</div>`); lastLine = -2; return; }
  const tm = curTime();
  let cur = -1; for (let i = 0; i < lines.length; i++) if (lines[i].s != null && lines[i].s <= tm + 0.05) cur = i;
  const timed = lines.some(l => l.s != null);
  if (!timed) {
    if (force || lastLine !== -3) { const duet = $('#duetChk').checked, dn = store.get('duetNames', { A: '', B: '' });
      const who = sg => sg === 'AB' ? [dn.A || 'A', dn.B || 'B'].join(' + ') : (dn[sg] || sg);
      setHTML(lines.map(l => `<div class="ln cur ${duet && l.singer ? l.singer : ''}" style="font-size:calc(var(--lyric)*.6)">${duet && l.singer ? `<span class="who">${esc(who(l.singer))}</span>` : ''}${esc(lineText(l))}</div>`).join('')); lastLine = -3; box.style.overflowY = 'auto'; }
    return;
  }
  box.style.overflowY = 'hidden';
  if (force || cur !== lastLine) {
    const from = Math.max(0, cur - 1), to = Math.min(lines.length, from + 5);
    const duet = $('#duetChk').checked; const dn = store.get('duetNames', { A: '', B: '' });
    const who = sg => sg === 'AB' ? [dn.A || 'A', dn.B || 'B'].join(' + ') : (dn[sg] || sg);
    let html = '';
    for (let i = from; i < to; i++) {
      const l = lines[i]; const cls = ['ln']; if (i === cur) cls.push('cur'); if (duet && l.singer) cls.push(l.singer);
      const words = l.words?.length ? l.words : [{ w: l.text || '', s: l.s, e: l.e }];
      html += `<div class="${cls.join(' ')}" data-i="${i}">${duet && l.singer ? `<span class="who">${esc(who(l.singer))}</span>` : ''}${words.map((w, k) => `<span class="w" data-k="${k}">${esc(w.w)}</span>`).join(' ')}${l.tr ? `<span class="tr">${esc(l.tr)}</span>` : ''}</div>`;
    }
    setHTML(html);
    lastLine = cur;
  }
  // צביעת מילה-מילה
  if (cur >= 0) {
    const el = box.querySelector(`.ln[data-i="${cur}"]`); const l = lines[cur];
    if (el && l.words?.length) el.querySelectorAll('.w').forEach((s, k) => s.classList.toggle('sung', l.words[k].s <= tm));
    else if (el) el.querySelectorAll('.w').forEach(s => s.classList.add('sung'));
  }
}
$('#duetChk').onchange = () => renderLyrics(true);
$('#fontSize').oninput = e => { document.documentElement.style.setProperty('--lyric', e.target.value + 'px'); store.set('font', e.target.value); };
$('#bgSel').onchange = e => {
  const box = $('#lyrics'); box.classList.remove('bg-1', 'bg-2', 'bg-3', 'bg-4'); box.style.backgroundImage = '';
  if (e.target.value === 'img') { $('#bgImg').click(); return; }
  if (e.target.value) box.classList.add(e.target.value);
  store.set('bg', e.target.value);
};
$('#bgImg').onchange = e => { const f = e.target.files[0]; if (!f) return; $('#lyrics').style.backgroundImage = `linear-gradient(#0008,#0008),url(${URL.createObjectURL(f)})`; };
$('#fsBtn').onclick = () => { const b = $('#lyrics'); document.fullscreenElement ? document.exitFullscreen() : b.requestFullscreen?.().catch(() => {}); };

$('#autoLyrBtn').onclick = async () => {
  if (!song) return;
  const b = $('#autoLyrBtn'); b.disabled = true; b.textContent = t('transcribing');
  try {
    const r = await fetchT(`${song.server}/job/${song.id}/lyrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: $('#lyrLang').value }) }, 300000);
    if (!r.ok) throw new Error(await apiError(r));
    const data = await r.json(); song.lyrics = { lines: data.lines }; persist(); renderLyrics(true); toast(t('lyricsReady'));
  } catch (e) { toast('❌ ' + (e.message || t('netErr')), 5000); }
  finally { b.disabled = false; b.textContent = t('autoLyrics'); }
};
$('#editLyrBtn').onclick = () => {
  $('#lyrEditor').classList.toggle('hidden');
  $('#lyrText').value = lyricLines().map(l => (l.singer ? l.singer + ': ' : '') + lineText(l)).join('\n');
};
$('#lyrSave').onclick = () => {
  const old = lyricLines();
  const lines = $('#lyrText').value.split('\n').map(s => s.trim()).filter(Boolean).map((txt, i) => {
    let singer = null; const m = txt.match(/^(AB|A\+B|A|B|יחד|ביחד)\s*:\s*(.*)$/i); if (m) { const k = m[1].toUpperCase(); singer = k === 'A' || k === 'B' ? k : 'AB'; txt = m[2]; }
    const prev = old[i];
    const same = prev && lineText(prev) === txt;
    return same ? Object.assign({}, prev, { singer }) : { text: txt, s: prev?.s ?? null, e: prev?.e ?? null, singer, words: null };
  });
  song.lyrics = { lines }; retimeWords(); persist(); $('#lyrEditor').classList.add('hidden'); renderLyrics(true);
};
// כשיש רק זמן התחלה לשורה – מפזרים את המילים לאורך השורה
function retimeWords() {
  const L = lyricLines(); const d = duration();
  L.forEach((l, i) => {
    if (l.s == null) return;
    const end = l.e ?? (L[i + 1]?.s ?? Math.min(d, l.s + 5));
    if (!l.words || !l.words.length || l.words[0].s == null || l._manual) {
      const ws = (l.text || lineText(l)).split(/\s+/).filter(Boolean); const step = (end - l.s) / Math.max(1, ws.length);
      l.words = ws.map((w, k) => ({ w, s: +(l.s + k * step).toFixed(2), e: +(l.s + (k + 1) * step).toFixed(2) }));
      l.e = end; l._manual = true;
    }
  });
}
/* תזמון בהקשה (17) */
let tapIdx = 0;
$('#tapBtn').onclick = () => {
  if (!lyricLines().length) { toast(t('typeFirst')); $('#editLyrBtn').click(); return; }
  tapIdx = 0; $('#tapBox').classList.remove('hidden'); $('#tapPos').textContent = `0 / ${lyricLines().length}`;
  lyricLines().forEach(l => { l.s = null; l.e = null; l.text = lineText(l); l.words = null; l._manual = true; });
  seek(0); playAll(false);
};
function tap() {
  const L = lyricLines(); if (tapIdx >= L.length) return;
  L[tapIdx].s = +curTime().toFixed(2); if (tapIdx > 0) L[tapIdx - 1].e = L[tapIdx].s;
  tapIdx++; $('#tapPos').textContent = `${tapIdx} / ${L.length}`;
  if (tapIdx >= L.length) finishTap();
}
function finishTap() { $('#tapBox').classList.add('hidden'); retimeWords(); persist(); renderLyrics(true); toast(t('timingSaved')); }
$('#tapNow').onclick = tap; $('#tapDone').onclick = finishTap;
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!$('#tapBox').classList.contains('hidden')) tap(); else if (song) $('#playBtn').click();
  }
});
/* LRC (19) */
$('#lrcBtn').onclick = () => {
  const L = lyricLines(); if (!L.length) { toast(t('noLyricsShort')); return; }
  const ts = s => { const m = Math.floor(s / 60), x = (s % 60).toFixed(2).padStart(5, '0'); return `[${String(m).padStart(2, '0')}:${x}]`; };
  const txt = `[ti:${song.title}]\n[by:${t('appName')}]\n` + L.map(l => (l.s != null ? ts(l.s) : '') + lineText(l)).join('\n');
  download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), safeName(song.title) + '.lrc');
};
/* הדפסה (75) */
$('#printBtn').onclick = () => {
  const L = lyricLines(); if (!L.length) { toast(t('noLyricsShort')); return; }
  $('#printArea').innerHTML = `<h1 style="text-align:center">${esc(song.title)}</h1>` +
    L.map(l => `<p style="font-size:20px;text-align:center;margin:6px">${l.singer ? `<b>${l.singer}:</b> ` : ''}${esc(lineText(l))}${l.tr ? `<br><small>${esc(l.tr)}</small>` : ''}</p>`).join('');
  window.print();
};
/* תרגום (71) */
$('#trLang').onchange = async e => {
  const to = e.target.value; const L = lyricLines();
  if (!to) { L.forEach(l => delete l.tr); renderLyrics(true); return; }
  if (!L.length) { toast(t('noLyricsShort')); e.target.value = ''; return; }
  toast(t('translating'));
  try {
    const r = await fetchT(server() + '/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: L.map(lineText), to }) }, 120000);
    if (!r.ok) throw new Error(await apiError(r));
    const d = await r.json(); L.forEach((l, i) => { l.tr = d.lines[i] || ''; }); persist(); renderLyrics(true);
  } catch (err) { toast('❌ ' + err.message, 5000); e.target.value = ''; }
};

/* ===================== מד גובה צליל (24, 51, 52) ===================== */
function detectPitch(an, buf) {
  an.getFloatTimeDomainData(buf);
  let rms = 0; for (const v of buf) rms += v * v; rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return null;
  const sr = an.context.sampleRate, minL = Math.floor(sr / 1000), maxL = Math.floor(sr / 70);
  let best = -1, bestC = 0;
  for (let lag = minL; lag <= maxL; lag++) {
    let c = 0; for (let i = 0; i < buf.length - lag; i += 2) c += buf[i] * buf[i + lag];
    if (c > bestC) { bestC = c; best = lag; }
  }
  return best > 0 && bestC > 0.01 ? sr / best : null;
}
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midi = f => 69 + 12 * Math.log2(f / 440);
function noteName(f) { const m = Math.round(midi(f)); return NOTE[(m % 12 + 12) % 12] + (Math.floor(m / 12) - 1); }
function drawPitch(canvas, hist) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height; g.clearRect(0, 0, w, h);
  const y = m => h - ((m - 40) / 40) * h;
  const plot = (key, color) => { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); let on = false;
    hist.forEach((p, i) => { const v = p[key]; if (v == null) { on = false; return; } const x = i / 200 * w;
      on ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); on = true; }); g.stroke(); };
  plot('ref', '#64748b'); plot('me', '#ec4899');
}

/* ===================== הקלטה (20–26, 61–66, 70) ===================== */
const REC = { active: false, stream: null, rec: null, chunks: [], start: 0, an: null, buf: null, hist: [], hits: 0, frames: 0,
  cam: null, camRec: null, camChunks: [] };
async function startRec() {
  if (!song) return;
  try {
    REC.stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: $('#noiseChk').checked,
      echoCancellation: true, autoGainControl: false } });
  } catch { toast(t('micDenied'), 5000); return; }
  if ($('#camChk').checked) {
    try { REC.cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      const v = $('#camPreview'); v.srcObject = REC.cam; v.classList.remove('hidden'); v.play(); }
    catch { toast(t('camDenied')); REC.cam = null; }
  }
  const ctx = audioCtx(); await ctx.resume();
  const src = ctx.createMediaStreamSource(REC.stream);
  REC.an = ctx.createAnalyser(); REC.an.fftSize = 2048; src.connect(REC.an); REC.buf = new Float32Array(2048);
  REC.refBuf = new Float32Array(2048);
  REC.hist = []; REC.hits = 0; REC.frames = 0; REC.chunks = []; REC.camChunks = [];
  REC.rec = new MediaRecorder(REC.stream); REC.rec.ondataavailable = e => e.data.size && REC.chunks.push(e.data);
  REC.rec.onstop = saveTake;
  if (REC.cam) { REC.camRec = new MediaRecorder(REC.cam); REC.camRec.ondataavailable = e => e.data.size && REC.camChunks.push(e.data); }
  if (curTime() > duration() - 1) seek(0);
  if ($('#countdownChk').checked) await countdown();
  REC.start = curTime();
  REC.rec.start(250); REC.camRec && REC.camRec.start(250);
  REC.active = true; setRecBtn(); window.track && track('record');
  if (!P.playing) await playAll(false);
}
function stopRec() {
  if (!REC.active) return; REC.active = false; setRecBtn();
  try { REC.rec.stop(); } catch {}
  try { REC.camRec && REC.camRec.stop(); } catch {}
  REC.stream.getTracks().forEach(tr => tr.stop());
  if (REC.cam) { REC.cam.getTracks().forEach(tr => tr.stop()); $('#camPreview').classList.add('hidden'); }
  pauseAll();
}
function setRecBtn() { $('#recBtn').innerHTML = REC.active ? `⏹ <span>${t('stopRec')}</span>` : `⏺ <span>${t('startRec')}</span>`; $('#recBtn').classList.toggle('on', REC.active); }
$('#recBtn').onclick = () => REC.active ? stopRec() : startRec();
function recTick() {
  const me = detectPitch(REC.an, REC.buf);
  const ref = P.analyser ? detectPitch(P.analyser, REC.refBuf) : null;
  const mm = me ? midi(me) : null, rm = ref ? midi(ref) : null;
  REC.hist.push({ me: mm, ref: rm }); if (REC.hist.length > 200) REC.hist.shift();
  if (mm != null && rm != null) {
    REC.frames++; let diff = Math.abs(mm - rm) % 12; diff = Math.min(diff, 12 - diff);
    if (diff <= 1) REC.hits++;
  }
  drawPitch($('#pitchCanvas'), REC.hist);
  if (REC.frames > 20) $('#liveScore').textContent = Math.round(REC.hits / REC.frames * 100);
}
async function saveTake() {
  const blob = new Blob(REC.chunks, { type: REC.rec.mimeType || 'audio/webm' });
  await sleep(300);
  const cam = REC.camChunks.length ? new Blob(REC.camChunks, { type: REC.camRec.mimeType || 'video/webm' }) : null;
  const score = REC.frames > 20 ? Math.round(REC.hits / REC.frames * 100) : null;
  const take = { id: Date.now(), offset: REC.start, date: Date.now(), score, inMix: true };
  song.takes = song.takes || [];
  song.takes.forEach(x => x.inMix = false);
  song.takes.push(take);
  TAKE_BLOBS[take.id] = blob; if (cam) TAKE_BLOBS[take.id + ':cam'] = cam;
  if (score != null) { song.scores = song.scores || []; song.scores.push({ d: Date.now(), s: score }); }
  if (await DB.get('songs', song.id)) { await DB.put('blobs', 'take:' + take.id, blob); if (cam) await DB.put('blobs', 'take:' + take.id + ':cam', cam); }
  persist(); renderTakes();
  if (score != null) toast(t('yourScore', { s: score }), 4000);
}
const TAKE_BLOBS = {};
async function takeBlob(id) { return TAKE_BLOBS[id] || (TAKE_BLOBS[id] = await DB.get('blobs', 'take:' + id)); }
function renderTakes() {
  const tk = song?.takes || [];
  if (!tk.length) { $('#takes').innerHTML = `<div class="muted">${t('noTakes')}</div>`; return; }
  $('#takes').innerHTML = tk.map((x, i) => `<div class="item">
    <label class="chk"><input type="checkbox" data-mix="${i}" ${x.inMix ? 'checked' : ''}> ${t('inExport')}</label>
    <span class="t grow">${t('take')} ${i + 1}</span>
    <span class="pill">${x.score != null ? t('score') + ' ' + x.score : '—'}</span>
    <button class="btn sm" data-play="${i}">▶</button>
    <button class="btn sm" data-del="${i}">🗑</button></div>`).join('');
  $$('#takes [data-mix]').forEach(c => c.onchange = () => { tk[c.dataset.mix].inMix = c.checked; persist(); });
  $$('#takes [data-del]').forEach(b => b.onclick = () => { const x = tk.splice(b.dataset.del, 1)[0]; DB.del('blobs', 'take:' + x.id); persist(); renderTakes(); });
  $$('#takes [data-play]').forEach(b => b.onclick = async () => {
    const x = tk[b.dataset.play]; const bl = await takeBlob(x.id); if (!bl) return;
    seek(x.offset); const a = new Audio(URL.createObjectURL(bl)); await playAll(false); a.play();
    const stop = () => { a.pause(); }; master().addEventListener('pause', stop, { once: true });
  });
}
['reverb', 'echo'].forEach(id => $('#' + id).oninput = e => { $('#' + (id === 'reverb' ? 'revLbl' : 'echoLbl')).textContent = e.target.value + '%'; });
$('#bassBoost').oninput = e => $('#bassLbl').textContent = '+' + e.target.value + 'dB';
$('#voiceVol').oninput = e => $('#voiceLbl').textContent = e.target.value + '%';

function impulse(ctx, sec = 2.5) {
  const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  return b;
}
async function renderMix() {
  const takes = (song.takes || []).filter(x => x.inMix);
  const stemBufs = {};
  for (const s of song.stems) stemBufs[s] = await decodeStem(s);
  const sr = 44100, full = duration();
  const t0 = Math.max(0, +$('#trimStart').value || 0), t1 = (+$('#trimEnd').value || 0) > t0 ? +$('#trimEnd').value : full;
  const len = Math.ceil((t1 - t0) * sr);
  const off = new OfflineAudioContext(2, len, sr);
  const bus = off.createGain(); bus.connect(off.destination);
  for (const s of song.stems) {
    const b = stemBufs[s]; if (!b) continue;
    let v = P.levels[s] ?? 1; if (s === 'vocals' && P.source === 'original') v = 1; if (P.muted?.[s]) v = 0;
    if (!v) continue;
    const src = off.createBufferSource(); src.buffer = b; const g = off.createGain(); g.gain.value = v;
    src.connect(g); g.connect(bus); src.start(0, t0);
  }
  if (takes.length) {
    const voice = off.createGain(); voice.gain.value = (+$('#voiceVol').value) / 100;
    const shelf = off.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 200; shelf.gain.value = +$('#bassBoost').value;
    voice.connect(shelf); shelf.connect(bus);
    const rv = +$('#reverb').value / 100; if (rv > 0) { const cv = off.createConvolver(); cv.buffer = impulse(off); const g = off.createGain(); g.gain.value = rv * .6; shelf.connect(cv); cv.connect(g); g.connect(bus); }
    const ec = +$('#echo').value / 100; if (ec > 0) { const dl = off.createDelay(1); dl.delayTime.value = .32; const fb = off.createGain(); fb.gain.value = ec * .5; const g = off.createGain(); g.gain.value = ec * .7;
      shelf.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(g); g.connect(bus); }
    for (const x of takes) {
      const bl = await takeBlob(x.id); if (!bl) continue;
      let buf = await off.decodeAudioData(await bl.arrayBuffer());
      const fxk = $('#voiceFx')?.value || 'none', fix = !!$('#pitchFix')?.checked;
      if (fxk !== 'none' || fix) buf = await voiceEffect(buf, fxk, fix);
      const src = off.createBufferSource(); src.buffer = buf; src.connect(voice);
      const when = x.offset - t0; if (when >= 0) src.start(when); else src.start(0, -when);
    }
  }
  if ($('#fadeChk').checked) { const f = Math.min(2, (t1 - t0) / 4); bus.gain.setValueAtTime(0, 0); bus.gain.linearRampToValueAtTime(1, f);
    bus.gain.setValueAtTime(1, Math.max(f, t1 - t0 - f)); bus.gain.linearRampToValueAtTime(0, t1 - t0); }
  const out = await off.startRendering();
  if ($('#normChk').checked) {
    let peak = 0; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i += 4) peak = Math.max(peak, Math.abs(d[i])); }
    const k = peak > 0 ? .95 / peak : 1; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
  }
  return out;
}
function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, ab = new ArrayBuffer(44 + len * ch * 2), v = new DataView(ab);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let o = 44; const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
async function toMp3(buf) {
  if (!window.lamejs) return toWav(buf);
  const enc = new lamejs.Mp3Encoder(2, buf.sampleRate, 192), L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const conv = a => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) { const s = Math.max(-1, Math.min(1, a[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; } return o; };
  const l = conv(L), r = conv(R), out = [];
  for (let i = 0; i < l.length; i += 1152) { const m = enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)); if (m.length) out.push(m); if (i % (1152 * 400) === 0) await sleep(0); }
  const e = enc.flush(); if (e.length) out.push(e);
  return new Blob(out, { type: 'audio/mpeg' });
}
async function exportAudio(kind) {
  if (!song) return;
  toast(t('rendering'), 6000);
  try { const buf = await renderMix(); const blob = kind === 'wav' ? toWav(buf) : await toMp3(buf);
    download(blob, `${safeName(song.title)} - ${t('myVersion')}.${kind === 'wav' ? 'wav' : 'mp3'}`); window.track && track('export'); return blob; }
  catch (e) { console.error(e); toast('❌ ' + t('exportFail'), 5000); }
}
$('#expMp3').onclick = () => exportAudio('mp3');
$('#expWav').onclick = () => exportAudio('wav');
$('#mailRec').onclick = async () => {
  const b = await exportAudio('mp3'); if (!b) return;
  location.href = `mailto:?subject=${encodeURIComponent(t('mailSubject', { t: song.title }))}&body=${encodeURIComponent(t('mailBody'))}`;
};

/* ----- סרטון (26, 70) – מצייר מסך קריוקי ומקליט בזמן אמת ----- */
$('#expVideo').onclick = async () => {
  if (!song) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast(t('noVideoSupport')); return; }
  const go = await new Promise(r => { const m = modal(`<h3>${t('video')}</h3><p>${t('videoHint')}</p><div class="row">
    <button class="btn pri" id="vOk">${t('start')}</button><button class="btn" id="vNo">${t('cancel')}</button></div>`);
    m.querySelector('#vOk').onclick = () => { m.remove(); r(true); }; m.querySelector('#vNo').onclick = () => { m.remove(); r(false); }; });
  if (!go) return;
  toast(t('rendering'), 5000);
  const buf = await renderMix(); const ctx = audioCtx(); await ctx.resume();
  const dest = ctx.createMediaStreamDestination(); const src = ctx.createBufferSource(); src.buffer = buf; src.connect(dest);
  const camTake = (song.takes || []).find(x => x.inMix && TAKE_BLOBS[x.id + ':cam']);
  let camVid = null;
  if (camTake) { camVid = document.createElement('video'); camVid.src = URL.createObjectURL(TAKE_BLOBS[camTake.id + ':cam']); camVid.muted = true; }
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
  const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
  const chunks = []; mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  const t0 = +$('#trimStart').value || 0; const L = lyricLines(); const startAt = ctx.currentTime;
  const m = modal(`<h3>${t('recordingVideo')}</h3><div class="progress"><div id="vBar"></div></div>`);
  let raf;
  const draw = () => {
    const tm = t0 + (ctx.currentTime - startAt);
    const grd = g.createLinearGradient(0, 0, 1280, 720); grd.addColorStop(0, '#1e1b4b'); grd.addColorStop(1, '#831843'); g.fillStyle = grd; g.fillRect(0, 0, 1280, 720);
    if (camVid && camTake && tm >= camTake.offset) { try { g.globalAlpha = .55; g.drawImage(camVid, 0, 0, 1280, 720); g.globalAlpha = 1; } catch {} }
    g.textAlign = 'center'; g.direction = document.documentElement.dir;
    let cur = -1; L.forEach((l, i) => { if (l.s != null && l.s <= tm) cur = i; });
    for (let k = -1; k <= 2; k++) { const l = L[cur + k]; if (!l) continue; g.fillStyle = k === 0 ? '#facc15' : '#ffffffaa'; g.font = `${k === 0 ? 'bold 56px' : '40px'} Rubik, Arial`; g.fillText(lineText(l), 640, 360 + k * 80); }
    g.fillStyle = '#fff9'; g.font = '28px Rubik, Arial'; g.fillText(song.title, 640, 60);
    g.font = '20px Rubik, Arial'; g.fillText(t('appName'), 640, 700);
    const bar = m.querySelector('#vBar'); if (bar) bar.style.width = Math.min(100, (ctx.currentTime - startAt) / buf.duration * 100) + '%';
    raf = requestAnimationFrame(draw);
  };
  mr.start(500); if (camVid) { camVid.currentTime = Math.max(0, t0 - camTake.offset); camVid.play(); } src.start(); draw();
  src.onended = () => { mr.stop(); cancelAnimationFrame(raf); };
  mr.onstop = () => { m.remove(); download(new Blob(chunks, { type: 'video/webm' }), safeName(song.title) + '.webm'); toast(t('videoReady')); };
};

/* ===================== שמירה, שיתוף, ZIP (28, 31, 32, 90) ===================== */
async function persist() { if (song && await DB.get('songs', song.id)) await DB.put('songs', song.id, song); }
$('#saveBtn').onclick = async () => {
  if (!song) return;
  toast(t('saving'), 5000);
  try {
    for (const s of [...song.stems, 'original']) {
      if (await DB.get('blobs', song.id + ':' + s)) continue;
      const r = await fetch(song.server + song.files[s]); if (!r.ok) throw 0;
      await DB.put('blobs', song.id + ':' + s, await r.blob());
    }
    for (const x of song.takes || []) { if (TAKE_BLOBS[x.id]) await DB.put('blobs', 'take:' + x.id, TAKE_BLOBS[x.id]); }
    song.offline = true; song.profile = song.profile || store.get('profile', 'main');
    await DB.put('songs', song.id, song); updateMeta(); toast('✅ ' + t('savedOffline'));
  } catch { toast('❌ ' + t('fileGone'), 5000); }
};
$('#favBtn').onclick = async () => {
  if (!song) return; song.fav = !song.fav; $('#favBtn').classList.toggle('on', song.fav);
  if (!(await DB.get('songs', song.id))) { await DB.put('songs', song.id, song); }
  persist();
};
$('#shareBtn').onclick = async () => {
  if (!song) return;
  const url = `${location.origin}${location.pathname}?job=${song.id}&srv=${encodeURIComponent(song.server)}`;
  try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); }
  catch { ask(t('copyLink'), url); }
};
$('#zipBtn').onclick = async () => {
  if (!song || !window.JSZip) return;
  toast(t('zipping'), 6000);
  const z = new JSZip(); const name = safeName(song.title);
  for (const s of [...song.stems, 'original']) { const b = s === 'original' ? await getOriginal() : await getStemBlob(s); if (b) z.file(`${name} - ${s === 'original' ? t('original') : t(STEM_NAMES[s])}.mp3`, b); }
  if (lyricLines().length) z.file(name + '.txt', lyricLines().map(lineText).join('\n'));
  for (const [i, x] of (song.takes || []).entries()) { const b = await takeBlob(x.id); if (b) z.file(`${t('take')} ${i + 1}.webm`, b); }
  download(await z.generateAsync({ type: 'blob' }), name + '.zip');
};
async function getOriginal() {
  if (song.offline) { const b = await DB.get('blobs', song.id + ':original'); if (b) return b; }
  try { const r = await fetch(song.server + song.files.original); return r.ok ? await r.blob() : null; } catch { return null; }
}

/* ===================== ספריה, פרופילים, רשימות (28–30, 60, 76, 77, 83) ===================== */
let libFilter = 'all', libTag = null;
function profiles() { return store.get('profiles', ['main']); }
function renderProfiles() {
  const cur = store.get('profile', 'main');
  $('#profileSel').innerHTML = profiles().map(p => `<option value="${esc(p)}" ${p === cur ? 'selected' : ''}>👤 ${esc(p === 'main' ? t('mainProfile') : p)}</option>`).join('');
}
$('#profileSel').onchange = e => { store.set('profile', e.target.value); renderLibrary(); };
$('#addProfile').onclick = async () => { const n = await ask(t('profileName')); if (!n) return; const p = profiles(); if (!p.includes(n)) p.push(n); store.set('profiles', p); store.set('profile', n); renderLibrary(); };
$$('#libFilter button').forEach(b => b.onclick = () => { libFilter = b.dataset.f; $$('#libFilter button').forEach(x => x.classList.toggle('on', x === b)); renderLibrary(); });
$('#libSearch').oninput = () => renderLibrary();

async function renderLibrary() {
  if (!$('#libList')) return;
  renderProfiles();
  const prof = store.get('profile', 'main');
  let songs = (await DB.all('songs')).filter(s => (s.profile || 'main') === prof);
  const tags = [...new Set(songs.flatMap(s => s.tags || []))];
  $('#tagBar').innerHTML = tags.map(tg => `<button class="btn sm ${tg === libTag ? 'on' : ''}" data-tag="${esc(tg)}">#${esc(tg)}</button>`).join('');
  $$('#tagBar [data-tag]').forEach(b => b.onclick = () => { libTag = libTag === b.dataset.tag ? null : b.dataset.tag; renderLibrary(); });
  const q = $('#libSearch').value.trim().toLowerCase();
  if (q) songs = songs.filter(s => (s.title + ' ' + (s.tags || []).join(' ') + ' ' + (s.lyrics?.lines || []).map(lineText).join(' ')).toLowerCase().includes(q));
  if (libTag) songs = songs.filter(s => (s.tags || []).includes(libTag));
  if (libFilter === 'fav') songs = songs.filter(s => s.fav);
  songs.sort(libFilter === 'recent' ? (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) : (a, b) => b.created - a.created);
  if (libFilter === 'recent') songs = songs.slice(0, 15);
  $('#libList').innerHTML = songs.length ? songs.map(s => `<div class="item">
    <button class="star ${s.fav ? 'on' : ''}" data-fav="${s.id}">★</button>
    <div class="grow"><div class="t">${esc(s.title)}</div>
      <div class="muted">${s.offline ? '💾 ' : '☁ '}${new Date(s.created).toLocaleDateString()} · ${(s.plays || 0)} ${t('plays')}
      ${(s.scores || []).length ? ' · ' + t('best') + ' ' + Math.max(...s.scores.map(x => x.s)) : ''}
      ${(s.tags || []).map(tg => `<span class="tagx">#${esc(tg)}</span>`).join(' ')}</div></div>
    <button class="btn sm" data-open="${s.id}">▶</button>
    <button class="btn sm" data-tags="${s.id}">#</button>
    <button class="btn sm" data-pl="${s.id}">+📃</button>
    <button class="btn sm" data-del="${s.id}">🗑</button></div>`).join('') : `<div class="muted">${t('libEmpty')}</div>`;
  const byId = Object.fromEntries(songs.map(s => [s.id, s]));
  $$('#libList [data-open]').forEach(b => b.onclick = () => { location.hash = 'studio'; openSong(byId[b.dataset.open]); });
  $$('#libList [data-fav]').forEach(b => b.onclick = async () => { const s = byId[b.dataset.fav]; s.fav = !s.fav; await DB.put('songs', s.id, s); renderLibrary(); });
  $$('#libList [data-del]').forEach(b => b.onclick = async () => {
    if (!confirm(t('confirmDelete'))) return;
    const s = byId[b.dataset.del]; await DB.del('songs', s.id);
    for (const k of await DB.keys('blobs')) if (String(k).startsWith(s.id + ':') || (s.takes || []).some(x => String(k).startsWith('take:' + x.id))) await DB.del('blobs', k);
    renderLibrary();
  });
  $$('#libList [data-tags]').forEach(b => b.onclick = async () => { const s = byId[b.dataset.tags];
    const v = await ask(t('tagsPrompt'), (s.tags || []).join(', ')); if (v == null) return;
    s.tags = v.split(/[,،]/).map(x => x.trim().replace(/^#/, '')).filter(Boolean); await DB.put('songs', s.id, s); renderLibrary(); });
  $$('#libList [data-pl]').forEach(b => b.onclick = () => addToPlaylist(b.dataset.pl));
  renderPlaylists(); renderProgress(songs);
}
function renderProgress(songs) {
  const all = songs.flatMap(s => (s.scores || []).map(x => ({ ...x, title: s.title }))).sort((a, b) => a.d - b.d).slice(-30);
  $('#progressBars').innerHTML = all.map(x => `<div style="height:${x.s}%" title="${esc(x.title)}: ${x.s}"></div>`).join('');
  if (!all.length) { $('#progressTxt').textContent = t('noScores'); return; }
  const week = all.filter(x => x.d > Date.now() - 7 * 864e5);
  const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x.s, 0) / a.length) : 0;
  $('#progressTxt').textContent = t('progressTxt', { n: week.length, avg: avg(week), all: avg(all) });
}
/* רשימות השמעה (29) */
async function addToPlaylist(songId) {
  const pls = await DB.all('playlists');
  const names = pls.map(p => p.name).join(', ');
  const name = await ask(t('plWhich') + (names ? ` (${names})` : ''), pls[0]?.name || t('myPlaylist'));
  if (!name) return;
  let pl = pls.find(p => p.name === name) || { id: 'pl' + Date.now(), name, songs: [] };
  if (!pl.songs.includes(songId)) pl.songs.push(songId);
  await DB.put('playlists', pl.id, pl); renderPlaylists(); toast(t('addedTo', { n: name }));
}
$('#newPl').onclick = async () => { const n = await ask(t('plName')); if (!n) return; const id = 'pl' + Date.now(); await DB.put('playlists', id, { id, name: n, songs: [] }); renderPlaylists(); };
async function renderPlaylists() {
  const pls = await DB.all('playlists');
  $('#plList').innerHTML = pls.length ? pls.map(p => `<div class="item"><span class="t grow">📃 ${esc(p.name)}</span><span class="muted">${p.songs.length} ${t('songs')}</span>
    <button class="btn sm" data-plplay="${p.id}">▶ ${t('playAll')}</button><button class="btn sm" data-plshare="${p.id}" title="share">👥 ${LANG === 'en' ? 'Share' : 'שתף'}</button><button class="btn sm" data-pldel="${p.id}">🗑</button></div>`).join('') : `<div class="muted">${t('noPlaylists')}</div>`;
  $$('[data-plplay]').forEach(b => b.onclick = () => PL.start(pls.find(p => p.id === b.dataset.plplay)));
  $$('[data-plshare]').forEach(b => b.onclick = () => sharePlaylist(pls.find(p => p.id === b.dataset.plshare)));
  $$('[data-pldel]').forEach(b => b.onclick = async () => { await DB.del('playlists', b.dataset.pldel); renderPlaylists(); });
}
const PL = { active: false, list: [], i: 0,
  async start(pl) { this.list = pl.songs; this.i = 0; this.active = true; location.hash = 'studio'; await this.play(); },
  async play() { const s = await DB.get('songs', this.list[this.i]); if (!s) return this.next(); await openSong(s); playAll(true); },
  next() { if (++this.i < this.list.length) this.play(); else { this.active = false; toast(t('plDone')); } } };

/* ===================== ערב קריוקי – ראו party.js ===================== */
async function renderParty() {}

/* ===================== חימום קולי (53) ===================== */
const WARMUPS = [
  { k: 'wuScale', notes: [60, 62, 64, 65, 67, 65, 64, 62, 60] },
  { k: 'wuArp', notes: [60, 64, 67, 72, 67, 64, 60] },
  { k: 'wuFive', notes: [60, 62, 64, 62, 60, 62, 64, 62, 60] },
  { k: 'wuHigh', notes: [65, 67, 69, 70, 72, 70, 69, 67, 65] },
  { k: 'wuLow', notes: [55, 57, 59, 60, 62, 60, 59, 57, 55] }
];
function renderWarmups() {
  $('#warmupBtns').innerHTML = WARMUPS.map((w, i) => `<button class="btn" data-wu="${i}">${t(w.k)}</button>`).join('');
  $$('[data-wu]').forEach(b => b.onclick = () => playNotes(WARMUPS[b.dataset.wu].notes));
}
async function playNotes(notes) {
  const ctx = audioCtx(); await ctx.resume(); let tt = ctx.currentTime + .1;
  for (const n of notes) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.2, tt + .05); g.gain.linearRampToValueAtTime(0, tt + .5);
    o.connect(g); g.connect(ctx.destination); o.start(tt); o.stop(tt + .55); tt += .55; }
}
let warm = null;
$('#warmMic').onclick = async () => {
  if (warm) { warm.s.getTracks().forEach(x => x.stop()); cancelAnimationFrame(warm.raf); warm = null; $('#warmMic').textContent = t('micOn'); return; }
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); const ctx = audioCtx(); await ctx.resume();
    const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(s).connect(an); const buf = new Float32Array(2048); const hist = [];
    warm = { s }; $('#warmMic').textContent = t('micOff');
    const tick = () => { const f = detectPitch(an, buf); hist.push({ me: f ? midi(f) : null }); if (hist.length > 200) hist.shift();
      drawPitch($('#warmCanvas'), hist); if (f) $('#warmNote').textContent = noteName(f); warm && (warm.raf = requestAnimationFrame(tick)); };
    tick();
  } catch { toast(t('micDenied')); }
};

/* ===================== הגדרות ומנהל (34–38) ===================== */
async function renderSettings() {
  $('#serverUrl').value = server();
  try { const e = await navigator.storage?.estimate?.(); if (e) $('#storageLbl').textContent = t('storageUsed', { mb: Math.round(e.usage / 1e6) }); } catch {}
}
$('#serverUrl').onchange = e => { store.set('server', e.target.value.trim()); };
$('#serverTest').onclick = async () => {
  store.set('server', $('#serverUrl').value.trim()); if (!store.get('server', '')) await discoverServer();
  const st = $('#serverStatus'); st.textContent = t('checking'); st.className = 'status';
  try { const r = await fetchT(server() + '/', {}, 60000); const d = await r.json(); st.textContent = '✅ ' + t('serverOk', { q: d.queue ?? 0 }); st.className = 'status ok'; }
  catch { st.textContent = '❌ ' + t('noServer'); st.className = 'status err'; }
};
$('#clearStore').onclick = async () => { if (!confirm(t('confirmClearAll'))) return; await DB.clear('songs'); await DB.clear('blobs'); await DB.clear('playlists'); renderSettings(); toast(t('cleared')); };

/* ===================== מדריך והדרכה ראשונה (42) ===================== */
function renderGuide() { const g = $('#guideBox'); if (g) g.innerHTML = t('guideHtml'); }
function onboarding() {
  if (store.get('onboarded', false)) return;
  const steps = ['ob1', 'ob2', 'ob3']; let i = 0;
  const m = modal('<div id="obBody"></div>');
  const draw = () => { m.querySelector('#obBody').innerHTML = `<h2>${t('obTitle')}</h2><p style="font-size:18px">${t(steps[i])}</p>
    <div class="row"><span class="muted grow">${i + 1} / ${steps.length}</span>
    <button class="btn" id="obSkip">${t('skip')}</button><button class="btn pri" id="obNext">${i < steps.length - 1 ? t('next') : t('letsGo')}</button></div>`;
    m.querySelector('#obSkip').onclick = done; m.querySelector('#obNext').onclick = () => { if (++i >= steps.length) done(); else draw(); }; };
  const done = () => { store.set('onboarded', true); m.remove(); };
  draw();
}

/* ===================== התקנה כאפליקציה (40) ===================== */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installBtn').classList.remove('hidden'); });
$('#installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').classList.add('hidden'); };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* ===================== הפעלה ===================== */
(async function init() {
  applyTheme();
  const f = store.get('font', null); if (f) { $('#fontSize').value = f; document.documentElement.style.setProperty('--lyric', f + 'px'); }
  const bg = store.get('bg', ''); if (bg && bg !== 'img') { $('#bgSel').value = bg; $('#lyrics').classList.add(bg); }
  applyLang(); renderWarmups(); discoverServer();
  const qs = new URLSearchParams(location.search);
  if (qs.get('job')) history.replaceState(null, '', location.pathname + location.search + '#studio');
  show(curView());
  if (qs.get('server')) { store.set('server', qs.get('server')); history.replaceState(null, '', location.pathname + location.hash); }
  if (qs.get('job')) {
    const srv = qs.get('srv') || server();
    try { setJob(50, t('loadingShared')); const r = await fetchT(srv + '/job/' + qs.get('job'), {}, 60000);
      if (!r.ok) throw new Error(await apiError(r)); const j = await r.json();
      if (j.status === 'done') { setJob(100, '✅', 'ok'); await openSong(songFromJob(j, srv)); }
      else { const prev = store.get('server'); store.set('server', srv); await poll(j.id); if (prev) store.set('server', prev); }
    } catch (e) { setJob(0, '❌ ' + e.message, 'err'); }
  }
})();
