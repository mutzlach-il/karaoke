/* אולפן הקריוקי שלי – ערב קריוקי: מסך טלוויזיה, טלפונים כשלט, תחרות, הצבעה, גלגל, אתגרים, קבוצות,
   יום הולדת, סרטון סיכום, תעודות, אלבום, פרופילים לחברים */
'use strict';

/* ===================== מצב הערב ===================== */
const TEAM_COL = { A: '#38bdf8', B: '#f472b6' };
function newEvening() {
  return { id: Date.now(), mode: 'free', teams: { A: L('הכחולים', 'Blue team'), B: L('הוורודים', 'Pink team') }, birthday: '',
    queue: [], perfs: [], seen: [], nextChallenge: null, autoRec: false, current: null };
}
let EV = store.get('evening', null) || newEvening();
{ const old = store.get('party', []); if (old.length && !EV.queue.length) { EV.queue = old.map((x, i) => ({ eid: 'h' + Date.now() + i, name: x.name, song: x.id, title: x.title, team: '' })); store.set('party', []); } }
EV.current = null;
const saveEV = () => store.set('evening', EV);
let ROOM = store.get('room', null);   // {code, key, srv, pub}
let ROOMST = null;                    // המצב האחרון מהשרת

/* ===================== פרופילים לחברים (18) ===================== */
const EMOJIS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🦄', '🐙', '🦋', '🐬', '🦉', '🐝', '🌟', '🔥', '🎸', '👑', '🌈', '🍀', '🚀'];
const COLORS = ['#f472b6', '#38bdf8', '#facc15', '#a78bfa', '#4ade80', '#fb923c', '#f87171', '#2dd4bf'];
function friends() { return store.get('friends', {}); }
function friend(name) {
  const f = friends(); if (!name) return null;
  if (!f[name]) { const n = Object.keys(f).length; f[name] = { emoji: EMOJIS[n % EMOJIS.length], color: COLORS[n % COLORS.length], sung: 0, best: 0, sum: 0, scored: 0, songs: [] }; store.set('friends', f); }
  return f[name];
}
function updFriend(name, fn) { const f = friends(); friend(name); const all = friends(); fn(all[name]); store.set('friends', all); }
const avatar = name => { const f = friends()[name]; return `<span class="ava" style="background:${f?.color || '#64748b'}">${f?.emoji || '🎤'}</span>`; };

/* ===================== אתגרים (5) ===================== */
const CHALLENGES = [
  { he: 'לשיר בעיניים עצומות', en: 'Sing with your eyes closed' },
  { he: 'לשיר כמו זמר אופרה', en: 'Sing like an opera star' },
  { he: 'לרקוד כל הפזמון', en: 'Dance through the whole chorus' },
  { he: 'השיר מהר יותר!', en: 'The song is faster!', fx: 'fast' },
  { he: 'השיר לאט…', en: 'The song is slooow…', fx: 'slow' },
  { he: 'סולם גבוה יותר', en: 'Higher key', fx: 'high' },
  { he: 'סולם נמוך יותר', en: 'Lower key', fx: 'low' },
  { he: 'בלי מילים על המסך – מהזיכרון!', en: 'No lyrics on screen – from memory!', fx: 'nolyrics' },
  { he: 'לשיר עם הקול המקורי ברקע', en: 'Sing with the original voice in the background', fx: 'guide' },
  { he: 'לשיר בלחש את הבית הראשון', en: 'Whisper the first verse' },
  { he: 'להזמין מישהו מהקהל לדואט', en: 'Invite someone from the audience for a duet' },
  { he: 'לשיר עם מבטא מצחיק', en: 'Sing with a funny accent' },
  { he: 'כל הקהל שר את הפזמון', en: 'The whole audience sings the chorus' },
  { he: 'להחזיק את התו האחרון 5 שניות', en: 'Hold the last note for 5 seconds' }
];
const chText = c => c ? (LANG === 'en' ? c.en : c.he) : '';

/* ===================== חדר – תקשורת עם השרת ===================== */
async function hostPatch(patch) {
  if (!ROOM) return;
  try { await api(`/room/${ROOM.code}/host`, { method: 'POST', body: { key: ROOM.key, patch }, srv: ROOM.srv, ms: 10000 }); }
  catch (e) { if (e.status === 404) { ROOM = null; store.set('room', null); renderParty(); } }
}
async function librarySongs() { return (await DB.all('songs')).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 300).map(s => ({ id: s.id, title: s.title })); }
async function publishRoom() {
  if (!ROOM) return;
  await hostPatch({ songs: await librarySongs(), teams: EV.teams, birthday: EV.birthday, mode: EV.mode, challenge: chText(EV.nextChallenge),
    queue: EV.queue, scores: leaderboard().slice(0, 20) });
}
async function openRoom() {
  try {
    if (!(await ensureServer())) throw new Error(t('noServer'));
    const d = await api('/room', { method: 'POST' });
    ROOM = { code: d.code, key: d.key, srv: server(), pub: await publicServer() }; store.set('room', ROOM);
    await publishRoom(); track('room'); renderParty(); pollRoom();
  } catch (e) { toast('❌ ' + e.message, 5000); }
}
const roomLink = () => ROOM ? `${location.origin}${location.pathname}?room=${ROOM.code}&srv=${encodeURIComponent(ROOM.pub || ROOM.srv)}` : '';
function qrImg(text, cell = 6) {
  if (!window.qrcode) return '';
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return `<img class="qr" alt="QR" src="${q.createDataURL(cell, 2)}">`; } catch { return ''; }
}
let pollT = 0, lastReact = 0, lastSound = 0;
async function pollRoom() {
  clearTimeout(pollT); if (!ROOM) return;
  try {
    const st = await api(`/room/${ROOM.code}?since=${lastReact}`, { srv: ROOM.srv, ms: 8000 });
    ROOMST = st; lastReact = Math.max(lastReact, ...st.reactions.map(r => r.t));
    const EMO = { clap: '👏', cheer: '🎉', heart: '❤️', fire: '🔥', laugh: '😂', wow: '😮' };
    for (const r of st.reactions) { floatEmoji(EMO[r.type] || '👏', r.name); if (Date.now() - lastSound > 700) { lastSound = Date.now(); crowd(REACT_SOUND[r.type]); } }
    if (mergeQueue(st)) { saveEV(); renderParty(true); renderStage(); }
    if (EV.current && STAGE.mode === 'vote') renderStage();
    if (STAGE.mode === 'lobby') renderStageLobbyPeople();
  } catch (e) { if (e.status === 404) { ROOM = null; store.set('room', null); renderParty(); return; } }
  pollT = setTimeout(pollRoom, document.visibilityState === 'visible' ? 1500 : 5000);
}
function mergeQueue(st) {   // שירים שהוזמנו מהטלפונים
  let changed = false; const have = new Set(EV.queue.map(q => q.eid)), seen = new Set(EV.seen);
  for (const q of st.queue || []) if (!have.has(q.eid) && !seen.has(q.eid)) { EV.queue.push(q); friend(q.name); changed = true; toast('📱 ' + q.name + ' – ' + q.title, 3500); }
  // מי שהוסר מהטלפון
  const srvIds = new Set((st.queue || []).map(q => q.eid));
  const before = EV.queue.length; EV.queue = EV.queue.filter(q => !q.pid || srvIds.has(q.eid) || q._local); if (EV.queue.length !== before) changed = true;
  return changed;
}

/* ===================== לוח תוצאות וקבוצות (2, 6) ===================== */
function leaderboard() {
  const best = {};
  for (const p of EV.perfs) if (p.score != null) { const k = p.name; if (!best[k] || p.score > best[k].score) best[k] = { name: p.name, team: p.team, title: p.title, score: p.score, stars: p.avg }; }
  return Object.values(best).sort((a, b) => b.score - a.score);
}
function teamTotals() { const t = { A: 0, B: 0 }; for (const p of EV.perfs) if (p.team && p.score != null) t[p.team] += p.score; return t; }
function teamChip(team) { return team ? `<span class="tchip" style="background:${TEAM_COL[team]}">${esc(EV.teams[team])}</span>` : ''; }

/* ===================== עמוד ערב קריוקי ===================== */
async function renderParty(soft) {
  const box = $('#partyApp'); if (!box) return;
  if (soft && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { renderQueueList(); return; }
  const songs = await DB.all('songs'); songs.sort((a, b) => a.title.localeCompare(b.title));
  const fr = friends(); const lb = leaderboard(); const tt = teamTotals();
  box.innerHTML = `
  <div class="card partyhero">
    <div class="row"><h2 class="grow" style="margin:0">🎉 ${t('tabParty')}</h2>
      <button class="btn pri big2" id="pStage">📺 ${L('מסך במה לטלוויזיה', 'TV stage screen')}</button></div>
    <p class="muted">${L('מחברים את המחשב לטלוויזיה, לוחצים "מסך במה" – והאורחים מצטרפים מהטלפון שלהם עם הקוד.', 'Connect the computer to the TV, press "TV stage screen" – guests join from their phones with the code.')}</p>
    <div class="roombox">${ROOM ? `${qrImg(roomLink(), 5)}<div><div class="muted">${L('קוד החדר', 'Room code')}</div><div class="rcode">${ROOM.code}</div>
      <div class="muted" style="word-break:break-all" dir="ltr">${esc(roomLink())}</div>
      <div class="row" style="margin-top:6px"><button class="btn sm" id="pCopy">${L('העתק קישור', 'Copy link')}</button><button class="btn sm" id="pClose">${L('סגור חדר', 'Close room')}</button>
      <span class="pill">📱 ${Object.keys(ROOMST?.people || {}).length} ${L('מחוברים', 'connected')}</span></div></div>`
      : `<button class="btn" id="pRoom">📱 ${L('חיבור טלפונים – יצירת קוד QR', 'Connect phones – create QR code')}</button><span class="muted">${L('לחיצה כאן יוצרת קוד QR שהאורחים סורקים מהטלפון (צריך שהשרת יהיה דולק).', 'Creates a QR code guests scan with their phones (server must be on).')}</span>`}</div>
  </div>

  <div class="grid2">
    <div class="card">
      <h3>⚙️ ${L('סוג הערב', 'Evening type')}</h3>
      <div class="seg" id="pMode">${[['free', L('שירה חופשית', 'Free singing')], ['comp', L('תחרות 🏆', 'Competition 🏆')], ['teams', L('קבוצות 👥', 'Teams 👥')]]
        .map(([k, n]) => `<button data-m="${k}" class="${EV.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${EV.mode === 'teams' ? `<div class="row" style="margin-top:10px"><input type="text" id="tA" value="${esc(EV.teams.A)}" style="flex:1;border-color:${TEAM_COL.A}">
        <input type="text" id="tB" value="${esc(EV.teams.B)}" style="flex:1;border-color:${TEAM_COL.B}"></div>` : ''}
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="pAutoRec" ${EV.autoRec ? 'checked' : ''}> ${L('להקליט כל ביצוע (ציון שירה + אלבום הערב)', 'Record every performance (singing score + evening album)')}</label>
      <h3 style="margin-top:16px">🎂 ${L('מצב יום הולדת', 'Birthday mode')}</h3>
      <div class="row"><input type="text" id="pBday" placeholder="${L('שם בעל/ת השמחה', 'Birthday person name')}" value="${esc(EV.birthday)}" style="flex:1">
        <button class="btn" id="pBdayOn">${EV.birthday ? L('עדכן', 'Update') : L('הפעל', 'Turn on')}</button>${EV.birthday ? `<button class="btn sm" id="pBdayOff">✕</button>` : ''}</div>
      ${EV.birthday ? `<div class="row" style="margin-top:8px"><span class="bdaytag">🎂 ${L('מזל טוב', 'Happy birthday')} ${esc(EV.birthday)}!</span><button class="btn sm" id="pBdaySong">🎵 ${L('נגן שיר יום הולדת', 'Play birthday song')}</button></div>` : ''}
    </div>
    <div class="card">
      <h3>🎲 ${L('הפתעות', 'Surprises')}</h3>
      <div class="row"><button class="btn" id="pWheelS">🎡 ${L('גלגל זמרים', 'Singer wheel')}</button><button class="btn" id="pWheelSong">🎡 ${L('גלגל שירים', 'Song wheel')}</button>
        <button class="btn" id="pChal">🎯 ${L('אתגר לזמר הבא', 'Challenge for next singer')}</button></div>
      ${EV.nextChallenge ? `<div class="chalbox">🎯 ${esc(chText(EV.nextChallenge))} <button class="btn sm" id="pChalX">✕</button></div>` : ''}
      <h3 style="margin-top:16px">👏 ${L('קולות קהל', 'Crowd sounds')}</h3>
      <div class="row">${[['clap', '👏', L('מחיאות', 'Applause')], ['cheer', '🎉', L('תשואות', 'Cheers')], ['wow', '😮', L('וואו', 'Wow')], ['drum', '🥁', L('תופים', 'Drumroll')], ['horn', '📯', L('צופר', 'Horn')], ['laugh', '😂', L('צחוק', 'Laugh')]]
        .map(([k, e, n]) => `<button class="btn sm" data-cr="${k}" title="${n}">${e} ${n}</button>`).join('')}</div>
    </div>
  </div>

  <div class="card">
    <h3>🎤 ${L('תור הזמרים', 'Singer queue')}</h3>
    <div class="row">
      <input type="text" id="singerName" list="friendList" placeholder="${t('singerName')}" style="flex:1;min-width:140px">
      <datalist id="friendList">${Object.keys(fr).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <select id="partySong" style="flex:2;min-width:180px">${songs.length ? songs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('') : `<option value="">${t('libEmpty')}</option>`}</select>
      ${EV.mode === 'teams' ? `<select id="pTeam" style="width:auto"><option value="A">${esc(EV.teams.A)}</option><option value="B">${esc(EV.teams.B)}</option></select>` : ''}
      <button class="btn pri" id="partyAdd">${t('addToQueue')}</button>
    </div>
    <div class="list" id="partyQueue" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="partyNext">${t('nextSinger')}</button><button class="btn" id="partyClear">${t('clearQueue')}</button></div>
  </div>

  <div class="grid2">
    <div class="card">
      <h3>🏆 ${L('טבלת המובילים', 'Leaderboard')}</h3>
      ${EV.mode === 'teams' ? `<div class="teamsbar"><div style="background:${TEAM_COL.A}">${esc(EV.teams.A)}<b>${tt.A}</b></div><div style="background:${TEAM_COL.B}">${esc(EV.teams.B)}<b>${tt.B}</b></div></div>` : ''}
      <div class="list">${lb.length ? lb.map((p, i) => `<div class="item"><span class="place">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(p.name)}
        <span class="grow"><b>${esc(p.name)}</b> ${teamChip(p.team)}<div class="muted">${esc(p.title)}</div></span><span class="score">${p.score}</span>
        <button class="btn sm" data-cert="${esc(p.name)}" title="${L('תעודה', 'Certificate')}">📜</button></div>`).join('') : `<div class="muted">${L('עוד אין ציונים. אחרי כל שיר הקהל מדרג בכוכבים.', 'No scores yet. After every song the audience rates with stars.')}</div>`}</div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" id="pEnd">🏆 ${L('סיום הערב והכרזה', 'End & announce winner')}</button>
        <button class="btn" id="pVideo">🎬 ${L('סרטון סיכום', 'Summary video')}</button>
        <button class="btn" id="pAlbum">💿 ${L('אלבום הערב (ZIP)', 'Evening album (ZIP)')}</button>
        <button class="btn sm" id="pNew">🆕 ${L('ערב חדש', 'New evening')}</button>
      </div>
      ${EV.perfs.length ? `<details style="margin-top:10px"><summary>${L('כל הביצועים', 'All performances')} (${EV.perfs.length})</summary><div class="list">${EV.perfs.map(p => `<div class="item">${avatar(p.name)}<span class="grow">${esc(p.name)} – ${esc(p.title)}${p.challenge ? ` · 🎯` : ''}</span>
        <span class="muted">${p.avg ? '★' + p.avg.toFixed(1) : ''}${p.pitch != null ? ' · 🎵' + p.pitch : ''}</span><span class="score">${p.score ?? '—'}</span></div>`).join('')}</div></details>` : ''}
    </div>
    <div class="card">
      <div class="row"><h3 class="grow" style="margin:0">👥 ${L('החברים שלנו', 'Our friends')}</h3><button class="btn sm" id="pFriend">+ ${L('חבר', 'Friend')}</button></div>
      <div class="friends">${Object.entries(fr).map(([n, f]) => `<div class="friend" style="--fc:${f.color}"><button class="ava big" data-emo="${esc(n)}" title="${L('החלף סמל', 'Change icon')}" style="background:${f.color}">${f.emoji}</button>
        <b>${esc(n)}</b><span class="muted">${f.sung} ${L('שירים', 'songs')} · ${L('שיא', 'best')} ${f.best || '—'}${f.scored ? ` · ${L('ממוצע', 'avg')} ${Math.round(f.sum / f.scored)}` : ''}</span>
        <div class="row" style="justify-content:center"><button class="btn sm" data-fq="${esc(n)}">🎤</button><button class="btn sm" data-fdel="${esc(n)}">🗑</button></div></div>`).join('') || `<div class="muted">${L('כל מי ששר נכנס לכאן אוטומטית עם סמל וצבע משלו.', 'Everyone who sings is added here automatically with their own icon and color.')}</div>`}</div>
    </div>
  </div>`;
  renderQueueList(songs);
  bindParty();
}
function renderQueueList() {
  const el = $('#partyQueue'); if (!el) return;
  el.innerHTML = EV.queue.length ? EV.queue.map((x, i) => `<div class="item"><span class="pill">${i + 1}</span>${avatar(x.name)}
    <span class="t grow">${esc(x.name)} – ${esc(x.title)} ${x.pid ? '📱' : ''} ${EV.mode === 'teams' ? `<button class="tchip" data-tm="${i}" style="background:${TEAM_COL[x.team] || '#64748b'}">${esc(EV.teams[x.team] || L('בחר קבוצה', 'Pick team'))}</button>` : ''}</span>
    <button class="btn sm" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="btn sm" data-prm="${i}">✕</button></div>`).join('') : `<div class="muted">${t('queueEmpty')}</div>`;
  $$('[data-prm]').forEach(b => b.onclick = () => { const [x] = EV.queue.splice(b.dataset.prm, 1); EV.seen.push(x.eid); saveEV(); renderQueueList(); publishQueue(); });
  $$('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [EV.queue[i - 1], EV.queue[i]] = [EV.queue[i], EV.queue[i - 1]]; saveEV(); renderQueueList(); publishQueue(); });
  $$('[data-tm]').forEach(b => b.onclick = () => { const x = EV.queue[b.dataset.tm]; x.team = x.team === 'A' ? 'B' : 'A'; saveEV(); renderQueueList(); publishQueue(); });
}
let pubQT = 0;
function publishQueue() { clearTimeout(pubQT); pubQT = setTimeout(async () => { if (!ROOM) return; try { const st = await api(`/room/${ROOM.code}`, { srv: ROOM.srv }); mergeQueue(st); saveEV(); } catch {} hostPatch({ queue: EV.queue }); }, 300); }
function addToQueue(name, songId, title, team) {
  name = (name || '').trim() || t('guest'); friend(name);
  EV.queue.push({ eid: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, song: songId, title, team: team || '', _local: true });
  saveEV(); publishQueue();
}
function bindParty() {
  const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
  on('pStage', () => openStage());
  on('pRoom', () => openRoom());
  on('pCopy', async () => { try { await navigator.clipboard.writeText(roomLink()); toast(t('linkCopied')); } catch { ask(t('copyLink'), roomLink()); } });
  on('pClose', () => { ROOM = null; ROOMST = null; store.set('room', null); renderParty(); });
  $$('#pMode [data-m]').forEach(b => b.onclick = () => { EV.mode = b.dataset.m; saveEV(); renderParty(); publishRoom(); });
  ['tA', 'tB'].forEach(id => { const e = $('#' + id); if (e) e.onchange = () => { EV.teams[id.slice(1)] = e.value.trim() || EV.teams[id.slice(1)]; saveEV(); publishRoom(); renderParty(); }; });
  $('#pAutoRec').onchange = e => { EV.autoRec = e.target.checked; saveEV(); };
  on('pBdayOn', () => { const n = $('#pBday').value.trim(); if (!n) return; EV.birthday = n; saveEV(); renderParty(); publishRoom(); confetti(4000, ['🎂', '🎈', '🎁']); crowd('cheer'); });
  on('pBdayOff', () => { EV.birthday = ''; saveEV(); renderParty(); publishRoom(); });
  on('pBdaySong', () => birthdayStage());
  on('pWheelS', () => wheelSingers());
  on('pWheelSong', () => wheelSongs());
  on('pChal', () => pickChallenge());
  on('pChalX', () => { EV.nextChallenge = null; saveEV(); renderParty(); publishRoom(); });
  $$('#partyApp [data-cr]').forEach(b => b.onclick = () => { crowd(b.dataset.cr); floatEmoji(b.textContent.trim().split(' ')[0]); });
  on('partyAdd', async () => {
    const id = $('#partySong').value; if (!id) return; const s = await DB.get('songs', id);
    addToQueue($('#singerName').value, id, s.title, $('#pTeam')?.value); $('#singerName').value = ''; renderParty();
  });
  on('partyNext', () => nextSinger());
  on('partyClear', () => { EV.seen.push(...EV.queue.map(q => q.eid)); EV.queue = []; saveEV(); renderQueueList(); publishQueue(); });
  on('pEnd', () => podium());
  on('pVideo', () => summaryVideo());
  on('pAlbum', () => eveningAlbum());
  on('pNew', () => { if (!confirm(L('להתחיל ערב חדש? התוצאות של הערב הזה יימחקו (החברים נשארים).', 'Start a new evening? This evening\'s results will be cleared (friends stay).'))) return; EV = newEvening(); saveEV(); renderParty(); publishRoom(); });
  on('pFriend', async () => { const n = await ask(L('שם החבר/ה', 'Friend name')); if (n) { friend(n); renderParty(); } });
  $$('[data-emo]').forEach(b => b.onclick = () => updFriend(b.dataset.emo, f => { f.emoji = EMOJIS[(EMOJIS.indexOf(f.emoji) + 1) % EMOJIS.length]; f.color = COLORS[(COLORS.indexOf(f.color) + 1) % COLORS.length]; }) || renderParty());
  $$('[data-fq]').forEach(b => b.onclick = () => { $('#singerName').value = b.dataset.fq; $('#singerName').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $$('[data-fdel]').forEach(b => b.onclick = () => { if (!confirm(L('למחוק את הפרופיל?', 'Delete this profile?'))) return; const f = friends(); delete f[b.dataset.fdel]; store.set('friends', f); renderParty(); });
  $$('[data-cert]').forEach(b => b.onclick = () => downloadCert(b.dataset.cert));
}

/* ===================== מסך הבמה (1) ===================== */
const STAGE = { open: false, mode: 'lobby', votes: [], timer: 0 };
function stageEl() {
  let s = $('#stage');
  if (!s) { s = document.createElement('div'); s.id = 'stage'; s.className = 'stage hidden'; document.body.appendChild(s); }
  return s;
}
function goFull() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); }
function openStage() {
  STAGE.open = true; STAGE.mode = 'lobby'; document.body.classList.add('stage-mode');
  goFull(); renderStage(); if (ROOM) pollRoom();
}
function closeStage() {
  STAGE.open = false; document.body.classList.remove('stage-mode', 'stage-song'); stageEl().classList.add('hidden');
  $('#lyrics').querySelector(':scope > .hud')?.remove(); $('#lyrics').classList.remove('nolyrics');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (curView() !== 'party') location.hash = 'party';
}
function stageControls() {
  return `<div class="stagectl">
    <button class="btn pri" data-sa="next">▶ ${t('nextSinger').replace('▶', '').trim()}</button>
    <button class="btn" data-sa="wheel">🎡</button><button class="btn" data-sa="chal">🎯</button>
    ${EV.birthday ? `<button class="btn" data-sa="bday">🎂</button>` : ''}
    <button class="btn" data-sa="clap">👏</button><button class="btn" data-sa="drum">🥁</button>
    <button class="btn" data-sa="end">🏆</button><button class="btn" data-sa="close">✕</button></div>`;
}
function bindStage(s) {
  const A = { next: nextSinger, wheel: wheelSingers, chal: pickChallenge, bday: birthdayStage, clap: () => crowd('clap'), drum: () => crowd('drum'),
    end: podium, close: closeStage, back: () => { STAGE.mode = 'lobby'; renderStage(); } };
  s.querySelectorAll('[data-sa]').forEach(b => { if (A[b.dataset.sa]) b.onclick = () => A[b.dataset.sa](); });
}
function renderStageLobbyPeople() { const el = $('#stagePeople'); if (el && ROOMST) el.textContent = Object.keys(ROOMST.people || {}).length; }
function renderStage() {
  if (!STAGE.open) return; const s = stageEl();
  if (document.body.classList.contains('stage-song') && STAGE.mode === 'lobby') { s.classList.add('hidden'); return; }
  s.classList.remove('hidden');
  const lb = leaderboard(), tt = teamTotals(), nx = EV.queue[0];
  const bday = EV.birthday ? `<div class="bdaybanner">🎂 ${L('מזל טוב', 'Happy birthday')} ${esc(EV.birthday)}! 🎈</div>` : '';
  if (STAGE.mode === 'lobby') {
    s.innerHTML = `<div class="stbg"></div>${bday}<div class="stgrid">
      <div class="stmain"><div class="stlogo">🎤 ${t('tabParty')}</div>
        ${nx ? `<div class="stnext"><span>${L('הבא/ה על הבמה', 'Up next')}</span>${avatar(nx.name)}<b>${esc(nx.name)}</b><em>${esc(nx.title)}</em>${teamChip(nx.team)}</div>`
          : `<div class="stnext"><span>${L('מי ראשון לשיר?', 'Who sings first?')}</span><em>${ROOM ? L('סרקו את הקוד ובחרו שיר', 'Scan the code and pick a song') : L('הוסיפו זמרים לתור', 'Add singers to the queue')}</em></div>`}
        ${EV.nextChallenge ? `<div class="chalbox big">🎯 ${esc(chText(EV.nextChallenge))}</div>` : ''}
        <div class="stqueue">${EV.queue.slice(1, 6).map((q, i) => `<div>${i + 2}. ${avatar(q.name)} ${esc(q.name)} – <span class="muted">${esc(q.title)}</span></div>`).join('')}</div>
      </div>
      <div class="stside">
        ${ROOM ? `<div class="stjoin">${qrImg(roomLink(), 7)}<div>${L('סרקו להצטרפות', 'Scan to join')}</div><div class="rcode">${ROOM.code}</div><div class="muted">📱 <span id="stagePeople">${Object.keys(ROOMST?.people || {}).length}</span></div></div>` : ''}
        ${EV.mode === 'teams' ? `<div class="teamsbar"><div style="background:${TEAM_COL.A}">${esc(EV.teams.A)}<b>${tt.A}</b></div><div style="background:${TEAM_COL.B}">${esc(EV.teams.B)}<b>${tt.B}</b></div></div>` : ''}
        ${lb.length ? `<div class="stlb"><h3>🏆 ${L('המובילים', 'Leaders')}</h3>${lb.slice(0, 5).map((p, i) => `<div>${['🥇', '🥈', '🥉'][i] || i + 1} ${avatar(p.name)} <b>${esc(p.name)}</b> <span class="score">${p.score}</span></div>`).join('')}</div>` : ''}
      </div></div>${stageControls()}`;
  } else if (STAGE.mode === 'vote') {
    const c = EV.current; const rv = Object.values(ROOMST?.votes?.[c.eid] || {}); const all = [...rv, ...STAGE.votes];
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    s.innerHTML = `<div class="stbg"></div>${bday}<div class="stcenter"><div class="stlogo">⭐ ${L('דרגו את', 'Rate')} ${esc(c.name)}</div><div class="muted big">${esc(c.title)}</div>
      <div class="bigstars">${[1, 2, 3, 4, 5].map(n => `<button data-st="${n}" class="${n <= Math.round(avg) ? 'on' : ''}">★</button>`).join('')}</div>
      <div class="big">${all.length ? `${avg.toFixed(1)} · ${all.length} ${L('קולות', 'votes')}` : (ROOM ? L('מצביעים מהטלפון… או לוחצים כאן על הכוכבים', 'Vote on your phone… or click the stars here') : L('לחצו על הכוכבים כדי לדרג', 'Click the stars to rate'))}</div>
      <div class="timer">${STAGE.left ?? ''}</div><button class="btn pri big" data-sa="finish">✓ ${L('סיום הצבעה', 'Finish voting')}</button></div>`;
    s.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { STAGE.votes.push(+b.dataset.st); crowd(+b.dataset.st >= 4 ? 'cheer' : 'clap'); renderStage(); });
    s.querySelector('[data-sa=finish]').onclick = finishVote; return;
  } else if (STAGE.mode === 'result') {
    const p = STAGE.result;
    s.innerHTML = `<div class="stbg"></div>${bday}<div class="stcenter"><div class="stlogo">${avatar(p.name)} ${esc(p.name)}</div><div class="muted big">${esc(p.title)}</div>
      <div class="bigscore">${p.score ?? '—'}</div><div class="big">${p.avg ? '★'.repeat(Math.round(p.avg)) + ` ${p.avg.toFixed(1)}` : ''}${p.pitch != null ? ` · 🎵 ${L('דיוק', 'pitch')} ${p.pitch}` : ''}${p.bonus ? ` · 🎯 +${p.bonus}` : ''}</div>
      ${p.record ? `<div class="newrec">🎉 ${L('שיא חדש של הערב!', 'New evening record!')}</div>` : ''}
      <div class="row" style="justify-content:center;margin-top:20px"><button class="btn" data-sa="cert">📜 ${L('תעודה', 'Certificate')}</button><button class="btn pri" data-sa="back">${L('המשך', 'Continue')} ←</button></div></div>`;
    s.querySelector('[data-sa=cert]').onclick = () => downloadCert(p.name);
  } else if (STAGE.mode === 'podium') {
    const top = leaderboard().slice(0, 3); const tw = tt.A === tt.B ? '' : (tt.A > tt.B ? 'A' : 'B');
    s.innerHTML = `<div class="stbg"></div>${bday}<div class="stcenter"><div class="stlogo">🏆 ${L('הזוכים של הערב', 'Tonight\'s winners')}</div>
      ${EV.mode === 'teams' && tw ? `<div class="teamwin" style="background:${TEAM_COL[tw]}">👑 ${esc(EV.teams[tw])} – ${tt[tw]}</div>` : ''}
      <div class="podium">${[1, 0, 2].map(i => top[i] ? `<div class="pod p${i + 1}">${avatar(top[i].name)}<b>${esc(top[i].name)}</b><span class="score">${top[i].score}</span><div class="block">${['🥇', '🥈', '🥉'][i]}</div></div>` : '<div class="pod"></div>').join('')}</div>
      <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" data-sa="certs">📜 ${L('תעודות לכולם', 'Certificates for all')}</button><button class="btn" data-sa="video">🎬 ${L('סרטון סיכום', 'Summary video')}</button>
      <button class="btn" data-sa="album">💿 ${L('אלבום', 'Album')}</button><button class="btn pri" data-sa="back">${L('חזרה', 'Back')}</button></div></div>`;
    s.querySelector('[data-sa=certs]').onclick = async () => { for (const p of leaderboard()) { await downloadCert(p.name); await sleep(400); } };
    s.querySelector('[data-sa=video]').onclick = summaryVideo; s.querySelector('[data-sa=album]').onclick = eveningAlbum;
  }
  bindStage(s);
}

/* ===================== הזמר הבא → שיר → הצבעה → ציון ===================== */
async function nextSinger() {
  const x = EV.queue[0]; if (!x) { toast(t('queueEmpty')); return; }
  const s = await DB.get('songs', x.song); if (!s) { toast('❌ ' + t('fileGone')); EV.queue.shift(); EV.seen.push(x.eid); saveEV(); renderParty(); return; }
  EV.queue.shift(); EV.seen.push(x.eid);
  EV.current = { ...x, t0: Date.now(), challenge: EV.nextChallenge }; EV.nextChallenge = null; saveEV();
  if (!STAGE.open) { STAGE.open = true; document.body.classList.add('stage-mode'); }
  STAGE.mode = 'lobby'; document.body.classList.add('stage-song'); stageEl().classList.add('hidden');
  location.hash = 'studio'; await openSong(s); goFull();
  // אתגר עם אפקט
  const fx = EV.current.challenge?.fx; $('#lyrics').classList.toggle('nolyrics', fx === 'nolyrics');
  if (fx === 'fast') { $('#tempo').value = 115; setTempo(115); } if (fx === 'slow') { $('#tempo').value = 85; setTempo(85); }
  if (fx === 'high') { $('#pitch').value = 3; setPitch(3); } if (fx === 'low') { $('#pitch').value = -3; setPitch(-3); }
  if (fx === 'guide') setGuide(true);
  drawHud(); hostPatch({ now: { eid: x.eid, name: x.name, title: x.title, team: x.team }, queue: EV.queue, challenge: chText(EV.current.challenge) });
  crowd('clap'); renderParty(true);
  if (EV.autoRec) await startRec(); else await playAll(true);
}
function drawHud() {
  const c = EV.current; const h = keepLayer('hud');
  h.innerHTML = `<div class="hudtop">${avatar(c.name)}<b>${esc(c.name)}</b><span>${esc(c.title)}</span>${teamChip(c.team)}
    ${c.challenge ? `<span class="chalbox">🎯 ${esc(chText(c.challenge))}</span>` : ''}</div>
    ${EV.birthday ? `<div class="bdaybanner sm">🎂 ${L('מזל טוב', 'Happy birthday')} ${esc(EV.birthday)}!</div>` : ''}
    ${ROOM ? `<div class="hudqr">${qrImg(roomLink(), 3)}<b>${ROOM.code}</b></div>` : ''}
    <div class="hudctl"><button class="btn sm" data-h="pp">⏯</button><button class="btn sm" data-h="end">⏭ ${L('סיום', 'Finish')}</button>
      <button class="btn sm" data-h="clap">👏</button><button class="btn sm" data-h="cheer">🎉</button><button class="btn sm" data-h="horn">📯</button></div>`;
  h.querySelectorAll('[data-h]').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.h;
    if (k === 'pp') P.playing ? pauseAll() : playAll(false); else if (k === 'end') { if (REC.active) stopRec(); else pauseAll(); endPerformance(); } else crowd(k); });
}
{ const orig = onEnded; onEnded = function () { orig(); if (EV.current && STAGE.mode !== 'vote') endPerformance(); }; }
async function endPerformance() {
  if (!EV.current || STAGE.mode === 'vote') return;
  document.body.classList.remove('stage-song'); $('#lyrics').querySelector(':scope > .hud')?.remove(); $('#lyrics').classList.remove('nolyrics');
  setGuide(false); if (+$('#tempo').value !== 100) { $('#tempo').value = 100; setTempo(100); } if (+$('#pitch').value !== 0) { $('#pitch').value = 0; setPitch(0); }
  crowd('cheer');
  if (EV.mode === 'free' && !ROOM) { await sleep(900); finalize([]); return; }
  STAGE.mode = 'vote'; STAGE.votes = []; STAGE.left = 25; renderStage();
  clearInterval(STAGE.timer);
  STAGE.timer = setInterval(() => { STAGE.left--; const tm = $('#stage .timer'); if (tm) tm.textContent = STAGE.left; if (STAGE.left <= 0) finishVote(); }, 1000);
}
function finishVote() {
  if (STAGE.mode !== 'vote') return; clearInterval(STAGE.timer);
  const c = EV.current; const rv = Object.values(ROOMST?.votes?.[c.eid] || {}); finalize([...rv, ...STAGE.votes]);
}
async function finalize(votes) {
  const c = EV.current; if (!c) return; await sleep(600);   // מחכים שההקלטה תישמר
  const take = (song?.takes || []).filter(x => x.date >= c.t0).pop();
  const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
  const pitch = take?.score ?? null;
  let score = avg != null && pitch != null ? Math.round(avg * 20 * .6 + pitch * .4) : avg != null ? Math.round(avg * 20) : pitch;
  let bonus = 0; if (c.challenge && score != null) { bonus = avg == null || avg >= 4 ? 10 : 5; score += bonus; }
  const prevBest = Math.max(0, ...EV.perfs.map(p => p.score || 0));
  const p = { id: Date.now(), name: c.name, team: c.team, title: c.title, songId: c.song, votes: votes.length, avg, pitch, bonus, score,
    takeId: take?.id || null, challenge: chText(c.challenge), t: c.t0, record: score != null && score > prevBest && EV.perfs.length > 0 };
  EV.perfs.push(p); EV.current = null; saveEV();
  if (take && !(await DB.get('blobs', 'take:' + take.id)) && TAKE_BLOBS[take.id]) await DB.put('blobs', 'take:' + take.id, TAKE_BLOBS[take.id]);
  updFriend(p.name, f => { f.sung++; if (score != null) { f.best = Math.max(f.best, score); f.sum += score; f.scored++; } f.songs = [...(f.songs || []), p.title].slice(-30); });
  hostPatch({ now: null, scores: leaderboard().slice(0, 20) });
  if (score == null) { STAGE.mode = 'lobby'; renderStage(); renderParty(true); return; }
  STAGE.result = p; STAGE.mode = 'result'; renderStage(); renderParty(true);
  if (score >= 80 || p.record) { confetti(3500, EV.birthday ? ['🎂', '🎈'] : null); crowd('cheer'); } else crowd('clap');
}
function setGuide(on) {   // מצב מדריך (17): הקול המקורי חלש ברקע
  if (!song || !song.stems.includes('vocals')) return;
  P.source = 'karaoke'; setSourceBtns(); P.levels.vocals = on ? .15 : 0; applyGains(); renderMixer();
  $('#guideBtn')?.classList.toggle('on', on);
}

/* ===================== יום הולדת (8) ===================== */
async function birthdayStage() {
  if (!EV.birthday) { toast(L('קודם כותבים שם בעמוד ערב קריוקי', 'Enter a name on the Karaoke Night page first')); return; }
  if (P.playing) pauseAll();
  const m = modal(`<div class="bdaymodal"><div class="bdaycake">🎂</div><h1>${L('מזל טוב', 'Happy birthday')}<br>${esc(EV.birthday)}!</h1><p>🎈🎁🎉</p></div>`);
  m.classList.add('bdayfull'); confetti(9000, ['🎂', '🎈', '🎁', '🎉']);
  const ms = await birthdayTune(); setTimeout(() => m.remove(), ms + 2500);
}

/* ===================== גלגל המזל (4) ===================== */
function wheel(items, title) {
  return new Promise(res => {
    if (items.length < 2) { toast(L('צריך לפחות 2 אפשרויות לגלגל', 'Need at least 2 options to spin')); return res(null); }
    const m = modal(`<h2 style="text-align:center">🎡 ${esc(title)}</h2><div class="wheelwrap"><canvas width="520" height="520" id="wheelCv"></canvas><div class="wheelptr">▼</div></div>
      <div class="row" style="justify-content:center"><button class="btn pri big" id="wSpin">${L('סובב!', 'Spin!')}</button></div><h2 id="wRes" style="text-align:center;min-height:1.4em"></h2>`);
    m.classList.add('wide'); const cv = m.querySelector('#wheelCv'), g = cv.getContext('2d'), n = items.length; let ang = 0;
    const draw = () => { g.clearRect(0, 0, 520, 520); for (let i = 0; i < n; i++) { const a0 = ang + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
      g.beginPath(); g.moveTo(260, 260); g.arc(260, 260, 250, a0, a1); g.closePath(); g.fillStyle = COLORS[i % COLORS.length]; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.save(); g.translate(260, 260); g.rotate(a0 + Math.PI / n); g.fillStyle = '#111'; g.font = `bold ${n > 12 ? 15 : 20}px Rubik, Arial`; g.textAlign = 'right';
      const lbl = String(items[i].label); g.fillText(lbl.length > 18 ? lbl.slice(0, 17) + '…' : lbl, 235, 7); g.restore(); }
      g.beginPath(); g.arc(260, 260, 28, 0, 7); g.fillStyle = '#fff'; g.fill(); g.font = '28px serif'; g.textAlign = 'center'; g.fillText('🎤', 260, 270); };
    draw();
    m.querySelector('#wSpin').onclick = e => {
      e.target.disabled = true; const pick = Math.random() * n | 0;
      // החץ למעלה = זווית -90°. מסובבים כך שמרכז הפלח שנבחר יהיה מתחת לחץ
      const target = -Math.PI / 2 - (pick + .5) * 2 * Math.PI / n; const start = ang;
      let end = target; while (end > start - 10 * Math.PI) end -= 2 * Math.PI;
      const t0 = performance.now(), dur = 4200; let lastSeg = -1;
      const step = now => { const k = Math.min(1, (now - t0) / dur), e2 = 1 - Math.pow(1 - k, 3); ang = start + (end - start) * e2; draw();
        const seg = Math.floor(((-Math.PI / 2 - ang) / (2 * Math.PI / n) % n + n) % n); if (seg !== lastSeg) { lastSeg = seg; tick(); }
        if (k < 1) requestAnimationFrame(step); else { m.querySelector('#wRes').textContent = '🎉 ' + items[pick].label; crowd('cheer'); confetti(2500);
          hostPatch({ wheel: { result: items[pick].label, t: Date.now() / 1000 } }); setTimeout(() => res(items[pick]), 300);
          const ok = document.createElement('button'); ok.className = 'btn pri'; ok.textContent = L('מעולה!', 'Great!'); ok.onclick = () => m.remove(); m.querySelector('.box').appendChild(ok); } };
      requestAnimationFrame(step);
    };
  });
}
function tick() { try { const ctx = audioCtx(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1500; g.gain.setValueAtTime(.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .03); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .04); } catch {} }
async function wheelSingers() {
  const names = [...new Set([...EV.queue.map(q => q.name), ...Object.values(ROOMST?.people || {}).map(p => p.name), ...Object.keys(friends())])].filter(Boolean);
  const r = await wheel(names.map(n => ({ label: n })), L('מי שר עכשיו?', 'Who sings now?')); if (!r) return;
  const i = EV.queue.findIndex(q => q.name === r.label);
  if (i > 0) { EV.queue.unshift(EV.queue.splice(i, 1)[0]); saveEV(); publishQueue(); renderParty(true); renderStage(); }
  else if (i < 0) { const n = $('#singerName'); if (n) n.value = r.label; }
}
async function wheelSongs() {
  const songs = await DB.all('songs'); const r = await wheel(songs.map(s => ({ label: s.title, id: s.id })), L('איזה שיר?', 'Which song?')); if (!r) return;
  const sel = $('#partySong'); if (sel) sel.value = r.id;
}
async function pickChallenge() {
  const c = CHALLENGES[Math.random() * CHALLENGES.length | 0];
  const m = modal(`<h2 style="text-align:center">🎯 ${L('אתגר לזמר הבא', 'Challenge for the next singer')}</h2><div class="slot" id="slot"></div>`); m.classList.add('wide');
  const sl = m.querySelector('#slot'); crowd('drum');
  for (let i = 0; i < 18; i++) { sl.textContent = chText(CHALLENGES[Math.random() * CHALLENGES.length | 0]); tick(); await sleep(60 + i * 6); }
  sl.textContent = chText(c); sl.classList.add('done');
  EV.nextChallenge = c; saveEV(); publishRoom(); renderParty(true); renderStage();
  const p = document.createElement('p'); p.className = 'muted'; p.style.textAlign = 'center'; p.textContent = L('מי שמצליח באתגר מקבל בונוס 10 נקודות!', 'Complete the challenge for a 10-point bonus!'); m.querySelector('.box').appendChild(p);
  const ok = document.createElement('button'); ok.className = 'btn pri'; ok.textContent = L('יאללה!', 'Let\'s go!'); ok.onclick = () => m.remove(); m.querySelector('.box').appendChild(ok);
}

/* ===================== סיום הערב, תעודות, אלבום, סרטון (2, 9, 10, 11) ===================== */
function podium() {
  if (!leaderboard().length) { toast(L('עוד אין ציונים בערב הזה', 'No scores yet tonight')); return; }
  if (!STAGE.open) { STAGE.open = true; document.body.classList.add('stage-mode'); goFull(); }
  STAGE.mode = 'podium'; renderStage(); confetti(6000, ['🏆', '⭐']); crowd('drum'); setTimeout(() => crowd('cheer'), 2000);
}
async function downloadCert(name) {
  const lb = leaderboard(); const i = lb.findIndex(p => p.name === name); const p = lb[i] || { name };
  const blob = await certificate({ name, title: p.title, score: p.score, stars: p.stars, place: i >= 0 && EV.mode !== 'free' ? i + 1 : null, birthday: EV.birthday && EV.birthday === name ? EV.birthday : '' });
  download(blob, `${L('תעודה', 'Certificate')} - ${safeName(name)}.png`);
}
async function eveningAlbum() {
  if (!window.JSZip) { toast('❌ ZIP'); return; }
  if (!EV.perfs.length) { toast(L('עוד אין ביצועים בערב הזה', 'No performances yet tonight')); return; }
  toast(t('zipping'), 6000);
  const z = new JSZip(); const lb = leaderboard(); let n = 0;
  const lines = [`${t('appName')} – ${new Date(EV.id).toLocaleDateString()}`, EV.birthday ? `🎂 ${L('מזל טוב', 'Happy birthday')} ${EV.birthday}` : '', ''];
  for (const [i, p] of EV.perfs.entries()) {
    lines.push(`${i + 1}. ${p.name} – ${p.title}${p.score != null ? ` · ${p.score}` : ''}${p.avg ? ` · ★${p.avg.toFixed(1)}` : ''}${p.challenge ? ` · 🎯 ${p.challenge}` : ''}`);
    if (p.takeId) { const b = await takeBlob(p.takeId); if (b) { z.file(`${L('הקלטות', 'Recordings')}/${String(i + 1).padStart(2, '0')}. ${safeName(p.name)} - ${safeName(p.title)}.webm`, b); n++; } }
  }
  lines.push('', L('טבלת המובילים:', 'Leaderboard:'), ...lb.map((p, i) => `${i + 1}. ${p.name} – ${p.score}`));
  if (EV.mode === 'teams') { const tt = teamTotals(); lines.push('', `${EV.teams.A}: ${tt.A}`, `${EV.teams.B}: ${tt.B}`); }
  z.file(L('תוצאות.txt', 'results.txt'), lines.filter(x => x !== null).join('\n'));
  for (const [i, p] of lb.entries()) z.file(`${L('תעודות', 'Certificates')}/${safeName(p.name)}.png`, await certificate({ name: p.name, title: p.title, score: p.score, stars: p.stars, place: EV.mode !== 'free' ? i + 1 : null, birthday: EV.birthday === p.name ? p.name : '' }));
  if (STAGE.video) z.file(L('סרטון סיכום.webm', 'summary video.webm'), STAGE.video);
  download(await z.generateAsync({ type: 'blob' }), `${L('אלבום ערב קריוקי', 'Karaoke night album')} ${new Date(EV.id).toLocaleDateString().replace(/\//g, '-')}.zip`);
  if (!n) toast(L('טיפ: סמנו "להקליט כל ביצוע" כדי שההקלטות ייכנסו לאלבום', 'Tip: turn on "Record every performance" to include recordings'), 6000);
}
async function summaryVideo() {
  if (!EV.perfs.length) { toast(L('עוד אין ביצועים בערב הזה', 'No performances yet tonight')); return; }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast(t('noVideoSupport')); return; }
  const W = 1280, H = 720, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const lb = leaderboard(), tt = teamTotals(), fr = friends();
  const slides = [{ k: 'intro' }]; if (EV.birthday) slides.push({ k: 'bday' });
  EV.perfs.forEach(p => slides.push({ k: 'perf', p })); if (EV.mode === 'teams') slides.push({ k: 'teams' }); if (lb.length) slides.push({ k: 'podium' }); slides.push({ k: 'end' });
  const per = 3.6, total = slides.length * per;
  const ctx = audioCtx(); await ctx.resume(); const dest = ctx.createMediaStreamDestination();
  // מוזיקת רקע עליזה (אקורדים ותוף)
  const bus = ctx.createGain(); bus.gain.value = .5; bus.connect(dest); bus.connect(ctx.destination);
  const t0a = ctx.currentTime + .2, beat = .5, prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
  for (let b = 0; b * beat < total; b++) { const st = t0a + b * beat; const ch = prog[Math.floor(b / 4) % 4];
    const k = ctx.createOscillator(), kg = ctx.createGain(); k.frequency.setValueAtTime(120, st); k.frequency.exponentialRampToValueAtTime(45, st + .15); kg.gain.setValueAtTime(b % 2 ? .25 : .5, st); kg.gain.exponentialRampToValueAtTime(.001, st + .2); k.connect(kg); kg.connect(bus); k.start(st); k.stop(st + .25);
    if (b % 4 === 0) ch.forEach(m => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); og.gain.setValueAtTime(0, st); og.gain.linearRampToValueAtTime(.06, st + .1); og.gain.linearRampToValueAtTime(0, st + beat * 4); o.connect(og); og.connect(bus); o.start(st); o.stop(st + beat * 4 + .05); }); }
  const podT = slides.findIndex(s => s.k === 'podium'); if (podT >= 0) CROWD.cheer(ctx, bus, t0a + podT * per + .5);
  const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
  const chunks = []; mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  const m = modal(`<h3>🎬 ${L('יוצר סרטון סיכום…', 'Creating summary video…')}</h3><div class="progress"><div id="svBar"></div></div><p class="muted">${L('זה לוקח בערך', 'This takes about')} ${Math.ceil(total)} ${L('שניות', 'seconds')}</p>`);
  const stars = [...Array(80)].map(() => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + .5 }));
  const confs = [...Array(120)].map(() => ({ x: Math.random() * W, y: Math.random() * -H, v: 2 + Math.random() * 3, c: COLORS[Math.random() * COLORS.length | 0] }));
  const T = (txt, y, size, col = '#fff', bold = true) => { g.font = `${bold ? 'bold ' : ''}${size}px Rubik, Arial`; g.fillStyle = col; g.fillText(txt, W / 2, y); };
  g.textAlign = 'center'; g.direction = LANG === 'en' ? 'ltr' : 'rtl';
  const start = performance.now(); let raf;
  const draw = () => {
    const el = (performance.now() - start) / 1000; const si = Math.min(slides.length - 1, Math.floor(el / per)), k = (el % per) / per, sl = slides[si];
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, si % 2 ? '#831843' : '#4c1d95'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff55'; stars.forEach(s => { s.x = (s.x + s.s) % W; g.fillRect(s.x, s.y, s.s, s.s); });
    g.globalAlpha = Math.min(1, k * 5, (1 - k) * 6); const zoom = 1 + k * .04; g.save(); g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2, -H / 2);
    if (sl.k === 'intro') { T('🎤', 250, 120); T(L('ערב הקריוקי שלנו', 'Our Karaoke Night'), 380, 72); T(new Date(EV.id).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'he-IL'), 450, 36, '#e9d5ff', false); T(`${EV.perfs.length} ${L('ביצועים', 'performances')} · ${new Set(EV.perfs.map(p => p.name)).size} ${L('זמרים', 'singers')}`, 510, 32, '#f9a8d4', false); }
    if (sl.k === 'bday') { T('🎂', 260, 140); T(`${L('מזל טוב', 'Happy birthday')} ${EV.birthday}!`, 400, 76, '#facc15'); T('🎈 🎁 🎉', 490, 60); }
    if (sl.k === 'perf') { const p = sl.p; const f = fr[p.name] || {}; g.beginPath(); g.arc(W / 2, 200, 80, 0, 7); g.fillStyle = f.color || '#8b5cf6'; g.fill(); T(f.emoji || '🎤', 228, 80);
      T(p.name, 360, 70); T(p.title, 425, 38, '#e9d5ff', false);
      if (p.avg) T('★'.repeat(Math.round(p.avg)) + '☆'.repeat(5 - Math.round(p.avg)), 500, 54, '#facc15');
      if (p.score != null) T(String(p.score), 600, 84, '#facc15'); if (p.challenge) T('🎯 ' + p.challenge, 670, 28, '#a5f3fc', false);
      if (p.team) { g.fillStyle = TEAM_COL[p.team]; g.fillRect(W / 2 - 120, 40, 240, 46); T(EV.teams[p.team], 74, 28); } }
    if (sl.k === 'teams') { T(L('תוצאות הקבוצות', 'Team results'), 160, 60); ['A', 'B'].forEach((tm, i) => { const x = W / 2 + (i ? 1 : -1) * 260 * (LANG === 'en' ? 1 : -1); g.fillStyle = TEAM_COL[tm]; g.fillRect(x - 200, 260, 400, 260);
      g.font = 'bold 44px Rubik, Arial'; g.fillStyle = '#fff'; g.fillText(EV.teams[tm], x, 340); g.font = 'bold 100px Rubik, Arial'; g.fillText(String(tt[tm]), x, 470); }); }
    if (sl.k === 'podium') { T('🏆 ' + L('הזוכים', 'Winners'), 120, 64); const pos = [[W / 2, 300, '🥇'], [W / 2 - 330, 380, '🥈'], [W / 2 + 330, 430, '🥉']];
      lb.slice(0, 3).forEach((p, i) => { const [x, y, md] = pos[i]; g.fillStyle = '#ffffff22'; g.fillRect(x - 140, y + 60, 280, H - y - 60);
        g.font = '80px serif'; g.fillText(md, x, y); g.font = 'bold 46px Rubik, Arial'; g.fillStyle = '#fff'; g.fillText(p.name, x, y + 120); g.font = 'bold 56px Rubik, Arial'; g.fillStyle = '#facc15'; g.fillText(String(p.score), x, y + 190); });
      confs.forEach(c => { c.y += c.v; if (c.y > H) c.y = -10; g.fillStyle = c.c; g.fillRect(c.x, c.y, 8, 4); }); }
    if (sl.k === 'end') { T(L('תודה שבאתם!', 'Thanks for coming!'), 330, 76); T('🎤 ' + t('appName'), 420, 36, '#e9d5ff', false); }
    g.restore(); g.globalAlpha = 1;
    const bar = m.querySelector('#svBar'); if (bar) bar.style.width = Math.min(100, el / total * 100) + '%';
    if (el < total) raf = requestAnimationFrame(draw); else mr.stop();
  };
  mr.onstop = () => { cancelAnimationFrame(raf); bus.disconnect(); const blob = new Blob(chunks, { type: 'video/webm' }); STAGE.video = blob; m.remove();
    download(blob, `${L('סיכום ערב קריוקי', 'Karaoke night summary')}.webm`); track('video'); };
  mr.start(500); draw();
}

/* ===================== שלט בטלפון (?room=CODE) ===================== */
const RM = { code: '', srv: '', me: null, st: null, t: 0, myVote: {}, q: '' };
function remoteInit(code, srv) {
  RM.code = code.toUpperCase(); RM.srv = srv || server(); RM.me = store.get('rm_' + RM.code, null);
  document.body.classList.add('remote-mode'); remotePoll();
}
async function remotePoll() {
  clearTimeout(RM.t);
  try { RM.st = await api(`/room/${RM.code}`, { srv: RM.srv, ms: 8000 }); renderRemote(); }
  catch (e) { if (e.status === 404) { $('#remoteBox').innerHTML = `<div class="card"><h2>😕 ${L('החדר לא נמצא', 'Room not found')}</h2><p>${esc(e.message)}</p></div>`; return; }
    if (!RM.st) $('#remoteBox').innerHTML = `<div class="card"><p>${L('מתחבר…', 'Connecting…')}</p></div>`; }
  RM.t = setTimeout(remotePoll, 1500);
}
async function rmCall(path, body) {
  try { return await api(`/room/${RM.code}/${path}`, { method: 'POST', body, srv: RM.srv, ms: 10000 }); }
  catch (e) { toast('❌ ' + e.message, 4000); if (e.status === 403 && path !== 'react') { RM.me = null; store.set('rm_' + RM.code, null); renderRemote(); } return null; }
}
function renderRemote() {
  const box = $('#remoteBox'); const st = RM.st; if (!box || !st) return;
  if (box.contains(document.activeElement) && document.activeElement.id === 'rmSearch') { renderRemoteSongs(); return; }
  const me = RM.me; const myQ = st.queue.filter(q => q.pid === me?.pid); const now = st.now;
  const bday = st.birthday ? `<div class="bdaybanner sm">🎂 ${L('מזל טוב', 'Happy birthday')} ${esc(st.birthday)}!</div>` : '';
  if (!me) {
    box.innerHTML = `${bday}<div class="card rmjoin"><div class="perfmic">🎤</div><h2>${L('הצטרפות לערב קריוקי', 'Join the karaoke night')}</h2>
      <input type="text" id="rmName" placeholder="${L('השם שלך', 'Your name')}" maxlength="24">
      ${st.mode === 'teams' ? `<div class="row" style="margin-top:10px">${['A', 'B'].map(tm => `<button class="btn rmteam" data-tm="${tm}" style="background:${TEAM_COL[tm]};color:#fff;flex:1">${esc(st.teams[tm])}</button>`).join('')}</div>` : ''}
      <button class="btn pri big" id="rmJoin" style="margin-top:14px;width:100%">${L('הצטרפות', 'Join')}</button></div>`;
    let team = '';
    $$('.rmteam').forEach(b => b.onclick = () => { team = b.dataset.tm; $$('.rmteam').forEach(x => x.classList.toggle('on', x === b)); });
    $('#rmJoin').onclick = async () => { const name = $('#rmName').value.trim(); if (!name) { $('#rmName').focus(); return; }
      if (st.mode === 'teams' && !team) { toast(L('בחרו קבוצה', 'Pick a team')); return; }
      const d = await rmCall('join', { name, team }); if (d) { RM.me = { pid: d.pid, name, team }; store.set('rm_' + RM.code, RM.me); renderRemote(); } };
    return;
  }
  const EMO = [['clap', '👏'], ['cheer', '🎉'], ['heart', '❤️'], ['fire', '🔥'], ['laugh', '😂'], ['wow', '😮']];
  const tt = { A: 0, B: 0 }; (st.scores || []).forEach(s => { if (s.team) tt[s.team] += s.score; });
  box.innerHTML = `${bday}
    <div class="card rmhead"><span>🎤 ${L('חדר', 'Room')} <b>${RM.code}</b></span><span>${L('שלום', 'Hi')} ${esc(me.name)} ${me.team ? teamChipR(st, me.team) : ''}</span></div>
    ${st.wheel && Date.now() / 1000 - st.wheel.t < 20 ? `<div class="card chalbox big">🎡 ${L('הגלגל בחר', 'The wheel picked')}: <b>${esc(st.wheel.result)}</b></div>` : ''}
    <div class="card"><h3>${now ? `🎙 ${L('על הבמה', 'On stage')}: ${esc(now.name)}` : L('אין כרגע מישהו על הבמה', 'No one on stage right now')}</h3>
      ${now ? `<div class="muted">${esc(now.title)}</div><div class="bigstars sm">${[1, 2, 3, 4, 5].map(n => `<button data-v="${n}" class="${n <= (RM.myVote[now.eid] || 0) ? 'on' : ''}">★</button>`).join('')}</div>
      <div class="muted">${RM.myVote[now.eid] ? L('הדירוג שלך נשלח ✓ (אפשר לשנות)', 'Your rating was sent ✓ (you can change it)') : L('דרגו את הביצוע', 'Rate the performance')}</div>` : ''}
      ${st.challenge ? `<div class="chalbox">🎯 ${esc(st.challenge)}</div>` : ''}
      <div class="rmreact">${EMO.map(([k, e]) => `<button data-r="${k}">${e}</button>`).join('')}</div></div>
    <div class="card"><h3>🎵 ${L('בחרו שיר לשיר', 'Pick a song to sing')}</h3>
      <input type="search" id="rmSearch" placeholder="${L('חיפוש שיר…', 'Search a song…')}" value="${esc(RM.q)}"><div class="list rmsongs" id="rmSongs"></div></div>
    <div class="card"><h3>📋 ${L('התור', 'Queue')}</h3><div class="list">${st.queue.length ? st.queue.map((q, i) => `<div class="item"><span class="pill">${i + 1}</span><span class="grow">${esc(q.name)} – ${esc(q.title)}</span>
      ${q.pid === me.pid ? `<button class="btn sm" data-un="${q.eid}">✕</button>` : ''}</div>`).join('') : `<div class="muted">${t('queueEmpty')}</div>`}</div>
      ${myQ.length ? `<div class="muted">${L('יש לך', 'You have')} ${myQ.length} ${L('שירים בתור', 'songs in the queue')}</div>` : ''}</div>
    ${(st.scores || []).length ? `<div class="card"><h3>🏆 ${L('המובילים', 'Leaders')}</h3>
      ${st.mode === 'teams' ? `<div class="teamsbar"><div style="background:${TEAM_COL.A}">${esc(st.teams.A)}<b>${tt.A}</b></div><div style="background:${TEAM_COL.B}">${esc(st.teams.B)}<b>${tt.B}</b></div></div>` : ''}
      <div class="list">${st.scores.slice(0, 10).map((s, i) => `<div class="item"><span class="place">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="grow">${esc(s.name)}</span><span class="score">${s.score}</span></div>`).join('')}</div></div>` : ''}`;
  renderRemoteSongs();
  $('#rmSearch').oninput = e => { RM.q = e.target.value; renderRemoteSongs(); };
  $$('[data-v]').forEach(b => b.onclick = async () => { const n = +b.dataset.v; if (await rmCall('vote', { pid: me.pid, eid: now.eid, stars: n })) { RM.myVote[now.eid] = n; renderRemote(); } });
  let cool = 0;
  $$('[data-r]').forEach(b => b.onclick = () => { if (Date.now() - cool < 800) return; cool = Date.now(); b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 300); rmCall('react', { type: b.dataset.r, pid: me.pid }); });
  $$('[data-un]').forEach(b => b.onclick = async () => { await rmCall('unqueue', { pid: me.pid, eid: b.dataset.un }); remotePoll(); });
}
function teamChipR(st, tm) { return `<span class="tchip" style="background:${TEAM_COL[tm]}">${esc(st.teams[tm])}</span>`; }
function renderRemoteSongs() {
  const el = $('#rmSongs'); if (!el || !RM.st) return; const q = RM.q.trim().toLowerCase();
  const songs = RM.st.songs.filter(s => !q || s.title.toLowerCase().includes(q)).slice(0, 60);
  el.innerHTML = songs.length ? songs.map(s => `<button class="item rmsong" data-s="${esc(s.id)}">🎵 <span class="grow">${esc(s.title)}</span><b>+</b></button>`).join('') : `<div class="muted">${L('לא נמצאו שירים', 'No songs found')}</div>`;
  el.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const d = await rmCall('queue', { pid: RM.me.pid, song: b.dataset.s }); if (d) { toast('✅ ' + L('נוספת לתור!', 'You are in the queue!')); remotePoll(); } });
}

/* ===================== חיבורים לאולפן ===================== */
function bindStudioExtras() {
  const on = (id, ev, fn) => { const e = $('#' + id); if (e) e[ev] = fn; };
  on('guideBtn', 'onclick', () => setGuide(!(P.levels.vocals > 0 && P.levels.vocals < .5)));
  on('aniBgSel', 'onchange', e => setAniBg(e.target.value));
  on('lightsChk', 'onchange', e => setLights(e.target.checked));
  on('sharePerfBtn', 'onclick', () => sharePerformance());
  $$('#studioCrowd [data-cr]').forEach(b => b.onclick = () => { crowd(b.dataset.cr); floatEmoji(b.textContent.trim()); });
  on('duetChk', 'onchange', () => { $('#duetNames')?.classList.toggle('hidden', !$('#duetChk').checked); renderLyrics(true); });
  const dn = store.get('duetNames', { A: '', B: '' });
  ['A', 'B'].forEach(k => { const e = $('#duet' + k); if (e) { e.value = dn[k] || ''; e.oninput = () => { const d = store.get('duetNames', { A: '', B: '' }); d[k] = e.value.trim(); store.set('duetNames', d); renderLyrics(true); }; } });
  const bg = store.get('aniBg', ''); if (bg && $('#aniBgSel')) { $('#aniBgSel').value = bg; setAniBg(bg); }
  if (store.get('lights', false) && $('#lightsChk')) { $('#lightsChk').checked = true; setLights(true); }
}

/* ===================== ניתוב לעמודים החדשים והפעלה ===================== */
Object.assign(PAGE_TITLES, { home: 'tabHome', welcome: 'welcomeTitle', account: 'accTitle', contact: 'contact', admin: 'admin', remote: 'tabParty', perf: 'perfTitle', privacy: 'privacyTitle' });
/* כפתור חזרה לעמוד הקודם */
const NAVSTACK = [];
let navBack = false, lastView = curView();
window.addEventListener('hashchange', () => { const v = curView(); if (!navBack && v !== lastView) NAVSTACK.push(lastView); navBack = false; lastView = v; });
function goBack() {
  let prev = NAVSTACK.pop(); while (prev === curView()) prev = NAVSTACK.pop();
  navBack = true; location.hash = !prev || prev === 'welcome' ? 'home' : prev;
}
{ const b = $('#backBtn'); if (b) b.onclick = e => { e.stopPropagation(); goBack(); }; }
/* תוכן העניינים במדריך – גלילה בלי לשנות עמוד */
document.addEventListener('click', e => { const a = e.target.closest('.gtoc a, .guide a[href^="#g-"]'); if (!a) return; e.preventDefault();
  document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
function renderPrivacy() { const b = $('#privacyBox'); if (b) b.innerHTML = t('privacyHtml'); }
Object.assign(I18N.he, { accTitle: 'החשבון שלי', perfTitle: 'ביצוע ששותף' });
Object.assign(I18N.en, { accTitle: 'My account', perfTitle: 'Shared performance' });
function onExtraView() {
  const v = curView();
  if (v === 'account') renderAccount();
  if (v === 'contact') renderContact();
  if (v === 'admin') renderAdmin();
  if (v === 'privacy') renderPrivacy();
  if (v !== 'welcome') track('view', v);
}
window.addEventListener('hashchange', onExtraView);
{ const orig = applyLang; applyLang = function () { orig(); renderUserChip(); const v = curView(); if (v === 'account') renderAccount(); if (v === 'contact') renderContact(); if (v === 'admin') renderAdmin(); if (v === 'remote') renderRemote(); if (v === 'privacy') renderPrivacy(); }; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && STAGE.open && !document.fullscreenElement && !$('.modal')) closeStage(); });

(function extraInit() {
  renderUserChip(); bindStudioExtras();
  const qs = new URLSearchParams(location.search);
  if (qs.get('room')) { history.replaceState(null, '', location.pathname + location.search + '#remote'); show('remote'); remoteInit(qs.get('room'), qs.get('srv')); return; }
  if (qs.get('perf')) { history.replaceState(null, '', location.pathname + location.search + '#perf'); show('perf'); showSharedPerf(qs.get('perf'), qs.get('srv') || server()); }
  if (qs.get('pl')) { const srv = qs.get('srv') || server(); history.replaceState(null, '', location.pathname + '#library'); show('library'); importSharedPlaylist(qs.get('pl'), srv); }
  track('open'); onExtraView(); loadAnnounce();
  if (curView() === 'party') renderParty();
  if (ROOM) pollRoom();
  if (AUTH.tok) syncLib().catch(() => {});
})();
