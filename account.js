/* אולפן הקריוקי שלי – חשבונות, סנכרון ספרייה, צור קשר, סטטיסטיקות כניסה, הודעה לכולם, לוח מנהל, שיתוף */
'use strict';

/* ===================== חיבור לשרת ===================== */
let SRV_OK = 0;
async function ensureServer() {
  if (SRV_OK && Date.now() - SRV_OK < 60000) return true;
  if (await pingServer(server(), 4000) || await discoverServer()) { SRV_OK = Date.now(); return true; }
  return false;
}
const AUTH = {
  get data() { return store.get('auth', null); },
  get tok() { return this.data?.token || ''; },
  get user() { return this.data?.user || null; },
  set(d) { store.set('auth', d); renderUserChip(); }
};
async function api(path, { method = 'GET', body, admin, form, ms = 30000, srv } = {}) {
  const h = {};
  if (body !== undefined && !form) h['Content-Type'] = 'application/json';
  if (AUTH.tok) h.Authorization = 'Bearer ' + AUTH.tok;
  if (admin) h['X-Admin-Key'] = admin;
  const r = await fetchT((srv || server()) + path, { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined) }, ms);
  if (!r.ok) { const e = new Error(await apiError(r)); e.status = r.status; throw e; }
  return r.json();
}

/* ===================== סטטיסטיקות כניסה (אנונימי) ===================== */
const VID = store.get('vid', '') || (() => { const v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('vid', v); return v; })();
function devType() { const m = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); return m ? (Math.min(screen.width, screen.height) > 700 ? 'tablet' : 'mobile') : 'desktop'; }
let trackQ = Promise.resolve();
function track(ev, view) {
  if (new URLSearchParams(location.search).get('room')) return;   // טלפונים בערב קריוקי לא נספרים פעמיים
  trackQ = trackQ.then(async () => {
    try {
      if (!(await ensureServer())) return;
      let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch {}
      if (ref === location.hostname) ref = '';
      await fetchT(server() + '/track', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(AUTH.tok ? { Authorization: 'Bearer ' + AUTH.tok } : {}) },
        body: JSON.stringify({ vid: VID, ev, view: view || curView(), ref, lang: LANG, dev: devType() }) }, 8000);
    } catch {}
  });
}

/* ===================== הודעה לכולם (מהמנהל) ===================== */
async function loadAnnounce() {
  try {
    if (!(await ensureServer())) return;
    const d = await api('/announce', { ms: 8000 }); const txt = (d.text || '').trim();
    $('#annBar')?.remove();
    if (!txt || store.get('annSeen', '') === txt) return;
    const b = document.createElement('div'); b.id = 'annBar'; b.className = 'annbar noprint';
    b.innerHTML = `<span>📢 ${esc(txt)}</span><button class="btn sm" aria-label="close">✕</button>`;
    b.querySelector('button').onclick = () => { store.set('annSeen', txt); b.remove(); };
    document.body.prepend(b);
  } catch {}
}

/* ===================== כפתור משתמש בכותרת ===================== */
function renderUserChip() {
  let b = $('#userChip');
  if (!b) { b = document.createElement('button'); b.id = 'userChip'; b.className = 'btn sm userchip'; $('#themeBtn').before(b); b.onclick = () => { location.hash = 'account'; }; }
  const u = AUTH.user;
  b.textContent = u ? '👤 ' + (u.name || u.email.split('@')[0]) : '👤 ' + L('התחברות', 'Sign in');
}

/* ===================== מסך חשבון ===================== */
let ACC = { step: 'login', email: '' };
function accMsg(txt, ok) { const m = $('#accMsg'); if (m) { m.textContent = txt; m.className = 'status ' + (ok ? 'ok' : 'err'); } }
async function accCall(btn, fn) {
  btn.disabled = true; accMsg(L('רגע…', 'One moment…'), true);
  try {
    if (!(await ensureServer())) throw new Error(t('noServer'));
    await fn();
  } catch (e) { accMsg('❌ ' + (e.message || t('netErr'))); }
  finally { btn.disabled = false; }
}
function renderAccount() {
  const box = $('#accBox'); if (!box) return;
  const u = AUTH.user;
  const field = (id, label, type = 'text', val = '') => `<label for="${id}">${label}</label><input type="${type}" id="${id}" value="${esc(val)}" ${type === 'password' ? 'autocomplete="current-password"' : ''}>`;
  if (u) {
    box.innerHTML = `<h2>👤 ${L('החשבון שלי', 'My account')}</h2>
      <div class="kv"><span>${L('שם', 'Name')}</span><b>${esc(u.name || '—')}</b></div>
      <div class="kv"><span>${L('מייל', 'Email')}</span><b dir="ltr">${esc(u.email)}</b></div>
      <div class="kv"><span>${L('נרשמת ב', 'Joined')}</span><b>${new Date(u.created * 1000).toLocaleDateString()}</b></div>
      <div class="kv"><span>${L('סנכרון אחרון', 'Last sync')}</span><b id="lastSync">${store.get('lastSync', 0) ? new Date(store.get('lastSync')).toLocaleString() : '—'}</b></div>
      <p class="muted">${L('השירים שלך נשמרים בחשבון – אפשר להיכנס מכל מחשב ולראות אותם.', 'Your songs are saved to your account – sign in on any computer to see them.')}</p>
      <div class="row"><button class="btn pri" id="accSync">🔄 ${L('סנכרן עכשיו', 'Sync now')}</button><button class="btn" id="accOut">${L('התנתקות', 'Sign out')}</button></div>
      <div class="status" id="accMsg"></div>`;
    $('#accSync').onclick = e => accCall(e.target, async () => { const r = await syncLib(); accMsg('✅ ' + L(`סונכרן: ${r.up} נשלחו, ${r.added} התקבלו`, `Synced: ${r.up} sent, ${r.added} received`), true); $('#lastSync').textContent = new Date().toLocaleString(); });
    $('#accOut').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} AUTH.set(null); ACC.step = 'login'; renderAccount(); };
    return;
  }
  const tabs = `<div class="seg" style="margin-bottom:14px"><button data-st="login" class="${ACC.step === 'login' ? 'on' : ''}">${L('התחברות', 'Sign in')}</button>
    <button data-st="register" class="${ACC.step === 'register' ? 'on' : ''}">${L('הרשמה', 'Sign up')}</button></div>`;
  let html = '';
  if (ACC.step === 'login') html = `${tabs}${field('aEmail', L('מייל', 'Email'), 'email', ACC.email)}${field('aPw', L('סיסמה', 'Password'), 'password')}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="aGo">${L('כניסה', 'Sign in')}</button><button class="btn link" id="aForgot">${L('שכחתי סיסמה', 'Forgot password')}</button></div>`;
  if (ACC.step === 'register') html = `${tabs}${field('aName', L('שם', 'Name'))}${field('aEmail', L('מייל', 'Email'), 'email', ACC.email)}${field('aPw', L('סיסמה (לפחות 6 תווים)', 'Password (6+ characters)'), 'password')}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="aGo">${L('הרשמה', 'Create account')}</button></div>
    <p class="muted">${L('נשלח אליך קוד אימות במייל.', 'We will email you a verification code.')} ${t('agreePriv')}<a href="#privacy">${t('privacyTitle')}</a>.</p>`;
  if (ACC.step === 'verify') html = `<h3>${L('אימות מייל', 'Verify email')}</h3><p>${L('שלחנו קוד בן 6 ספרות אל', 'We sent a 6-digit code to')} <b dir="ltr">${esc(ACC.email)}</b></p>
    ${field('aCode', L('הקוד מהמייל', 'Code from the email'))}<div class="row" style="margin-top:12px"><button class="btn pri" id="aGo">${L('אישור', 'Confirm')}</button><button class="btn link" id="aBack">${L('חזרה', 'Back')}</button></div>`;
  if (ACC.step === 'forgot') html = `<h3>${L('איפוס סיסמה', 'Reset password')}</h3>${field('aEmail', L('המייל שלך', 'Your email'), 'email', ACC.email)}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="aGo">${L('שלחו לי קוד', 'Send me a code')}</button><button class="btn link" id="aBack">${L('חזרה', 'Back')}</button></div>`;
  if (ACC.step === 'reset') html = `<h3>${L('סיסמה חדשה', 'New password')}</h3><p>${L('אם המייל רשום – נשלח אליו קוד.', 'If this email is registered, a code was sent.')}</p>
    ${field('aCode', L('הקוד מהמייל', 'Code from the email'))}${field('aPw', L('סיסמה חדשה', 'New password'), 'password')}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="aGo">${L('שמור סיסמה', 'Save password')}</button><button class="btn link" id="aBack">${L('חזרה', 'Back')}</button></div>`;
  box.innerHTML = `<h2>👤 ${L('חשבון', 'Account')}</h2>${html}<div class="status" id="accMsg"></div>`;
  $$('#accBox [data-st]').forEach(b => b.onclick = () => { ACC.step = b.dataset.st; renderAccount(); });
  $('#aBack') && ($('#aBack').onclick = () => { ACC.step = 'login'; renderAccount(); });
  $('#aForgot') && ($('#aForgot').onclick = () => { ACC.email = $('#aEmail').value.trim(); ACC.step = 'forgot'; renderAccount(); });
  const v = id => ($('#' + id)?.value || '').trim();
  const loggedIn = async d => { AUTH.set(d); ACC.step = 'login'; renderAccount(); toast('✅ ' + L('ברוך הבא, ', 'Welcome, ') + (d.user.name || d.user.email)); track('login'); syncLib().catch(() => {}); };
  $('#accBox input:last-of-type')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#aGo').click(); });
  $('#aGo').onclick = e => accCall(e.target, async () => {
    if (ACC.step === 'login') {
      ACC.email = v('aEmail');
      try { await loggedIn(await api('/auth/login', { method: 'POST', body: { email: ACC.email, password: $('#aPw').value } })); }
      catch (er) { if (er.status === 412) { ACC.step = 'verify'; renderAccount(); accMsg(er.message, true); return; } throw er; }
    } else if (ACC.step === 'register') {
      ACC.email = v('aEmail');
      await api('/auth/register', { method: 'POST', body: { email: ACC.email, name: v('aName'), password: $('#aPw').value } });
      ACC.step = 'verify'; renderAccount(); accMsg(L('הקוד נשלח – בדוק את המייל (גם בתיקיית הספאם).', 'Code sent – check your inbox (and spam).'), true); track('register');
    } else if (ACC.step === 'verify') {
      await loggedIn(await api('/auth/verify', { method: 'POST', body: { email: ACC.email, code: v('aCode') } }));
    } else if (ACC.step === 'forgot') {
      ACC.email = v('aEmail'); await api('/auth/forgot', { method: 'POST', body: { email: ACC.email } }); ACC.step = 'reset'; renderAccount();
    } else if (ACC.step === 'reset') {
      await loggedIn(await api('/auth/reset', { method: 'POST', body: { email: ACC.email, code: v('aCode'), password: $('#aPw').value } }));
    }
  });
}

/* ===================== סנכרון הספרייה לחשבון ===================== */
function songMeta(s) { const m = { ...s }; delete m.offline; m.takes = []; return m; }
async function syncLib() {
  if (!AUTH.tok || !(await ensureServer())) return { up: 0, added: 0 };
  let remote;
  try { remote = await api('/lib'); } catch (e) { if (e.status === 401) AUTH.set(null); throw e; }
  const local = await DB.all('songs'); const lmap = Object.fromEntries(local.map(s => [s.id, s]));
  const rmap = Object.fromEntries(remote.map(m => [m.id, m])); let added = 0, up = 0;
  for (const m of remote) if (m && m.id && !lmap[m.id]) { await DB.put('songs', m.id, { ...m, offline: false }); added++; }
  for (const s of local) { const m = songMeta(s); if (!rmap[s.id] || JSON.stringify(rmap[s.id]) !== JSON.stringify(m)) { try { await api('/lib/' + encodeURIComponent(s.id), { method: 'PUT', body: m }); up++; } catch {} } }
  store.set('lastSync', Date.now());
  if (added && curView() === 'library') renderLibrary();
  return { up, added };
}
{ // מחיקה מקומית מוחקת גם מהחשבון
  const del = DB.del.bind(DB);
  DB.del = (st, k) => { if (st === 'songs' && AUTH.tok) api('/lib/' + encodeURIComponent(k), { method: 'DELETE' }).catch(() => {}); return del(st, k); };
}
setInterval(() => { if (AUTH.tok && document.visibilityState === 'visible') syncLib().catch(() => {}); }, 5 * 60000);

/* ===================== צור קשר ===================== */
function renderContact() {
  const box = $('#contactBox'); if (!box) return; const u = AUTH.user;
  box.innerHTML = `<h2>✉ ${L('צור קשר', 'Contact us')}</h2>
    <p class="muted">${L('שאלה, רעיון או בעיה? כתבו לנו ונחזור אליכם במייל.', 'A question, idea or problem? Write to us and we will reply by email.')}</p>
    <label for="cName">${L('שם', 'Name')}</label><input type="text" id="cName" value="${esc(u?.name || '')}">
    <label for="cEmail">${L('מייל לחזרה', 'Your email')}</label><input type="email" id="cEmail" dir="ltr" value="${esc(u?.email || '')}">
    <label for="cText">${L('ההודעה', 'Message')}</label><textarea id="cText" rows="6"></textarea>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="cSend">${L('שליחה', 'Send')}</button>
      <a class="btn link" href="mailto:bnyytmrkwt@gmail.com">${L('או שלחו מייל ישיר', 'or email us directly')}</a></div>
    <div class="status" id="cMsg"></div>`;
  $('#cSend').onclick = async e => {
    const m = $('#cMsg'), b = e.target; const text = $('#cText').value.trim();
    if (text.length < 2) { m.textContent = L('כתבו הודעה', 'Write a message'); m.className = 'status err'; return; }
    b.disabled = true; m.textContent = L('שולח…', 'Sending…'); m.className = 'status';
    try {
      if (!(await ensureServer())) throw new Error('offline');
      await api('/contact', { method: 'POST', body: { name: $('#cName').value.trim(), email: $('#cEmail').value.trim(), text } });
      m.textContent = '✅ ' + L('ההודעה נשלחה! נחזור אליכם בהקדם.', 'Message sent! We will get back to you soon.'); m.className = 'status ok'; $('#cText').value = ''; track('contact');
    } catch (er) {
      if (er.message === 'offline') {   // אין שרת – פותחים מייל רגיל
        location.href = `mailto:bnyytmrkwt@gmail.com?subject=${encodeURIComponent(t('appName'))}&body=${encodeURIComponent(text)}`;
        m.textContent = ''; } else { m.textContent = '❌ ' + er.message; m.className = 'status err'; }
    } finally { b.disabled = false; }
  };
}

/* ===================== לוח מנהל ===================== */
const ADM = { key: '', tab: 'overview', data: {} };
try { ADM.key = sessionStorage.getItem('kp_admin') || store.get('adminKey', ''); } catch {}
const flag = cc => /^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0))) + ' ' + cc : (cc || '—');
const DEV_NAME = { desktop: ['מחשב', 'Desktop'], mobile: ['טלפון', 'Phone'], tablet: ['טאבלט', 'Tablet'] };
function topTable(rows, fmtKey = k => esc(k)) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return rows.length ? `<table class="toptbl">${rows.map(([k, n]) => `<tr><td>${fmtKey(k)}</td><td class="barcell"><span style="width:${n / max * 100}%"></span></td><td><b>${n}</b></td></tr>`).join('')}</table>` : `<div class="muted">${t('none')}</div>`;
}
const when = ts => ts ? new Date(ts * 1000).toLocaleString() : '—';
async function renderAdmin() {
  const box = $('#adminPanel'); if (!box) return;
  if (!ADM.key) {
    box.innerHTML = `<h2>🛠 ${t('admin')}</h2><p class="muted">${L('הסיסמה נמצאת בקובץ admin-key.txt בתיקיית השרת במחשב.', 'The password is in admin-key.txt in the server folder.')}</p>
      <div class="row"><input type="password" id="admKey" placeholder="${L('סיסמת מנהל', 'Admin password')}" style="flex:1"><button class="btn pri" id="admGo">${t('enter')}</button></div>
      <label class="chk"><input type="checkbox" id="admRemember"> ${L('זכור אותי במחשב הזה', 'Remember me on this computer')}</label><div class="status" id="admMsg"></div>`;
    $('#admKey').onkeydown = e => { if (e.key === 'Enter') $('#admGo').click(); };
    $('#admGo').onclick = async () => {
      const k = $('#admKey').value; const m = $('#admMsg'); m.textContent = t('checking'); m.className = 'status';
      try { if (!(await ensureServer())) throw new Error(t('noServer')); await api('/admin/analytics', { admin: k });
        ADM.key = k; try { sessionStorage.setItem('kp_admin', k); } catch {} if ($('#admRemember').checked) store.set('adminKey', k); renderAdmin(); }
      catch (e) { m.textContent = '❌ ' + e.message; m.className = 'status err'; }
    };
    return;
  }
  const TABS = [['overview', L('📊 כניסות', '📊 Visits')], ['users', L('👥 משתמשים', '👥 Users')], ['messages', L('✉ הודעות', '✉ Messages')],
    ['outbox', L('📤 מיילים שנשלחו', '📤 Sent emails')], ['announce', L('📢 הודעה לכולם', '📢 Announcement')], ['server', L('🖥 שרת ושירים', '🖥 Server & songs')]];
  box.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">🛠 ${t('admin')}</h2><button class="btn sm" id="admRef">🔄</button><button class="btn sm" id="admOut">${L('יציאה', 'Log out')}</button></div>
    <div class="seg admtabs" style="margin:12px 0">${TABS.map(([k, n]) => `<button data-at="${k}" class="${ADM.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="admBody">${t('checking')}</div>`;
  $$('[data-at]').forEach(b => b.onclick = () => { ADM.tab = b.dataset.at; renderAdmin(); });
  $('#admOut').onclick = () => { ADM.key = ''; store.set('adminKey', ''); try { sessionStorage.removeItem('kp_admin'); } catch {} renderAdmin(); };
  $('#admRef').onclick = () => renderAdmin();
  const body = $('#admBody'); const k = ADM.key;
  try {
    if (ADM.tab === 'overview') {
      const d = await api('/admin/analytics', { admin: k }); const maxD = Math.max(1, ...d.per_day.map(x => x[1]));
      const card = (n, lbl, sub) => `<div class="stat"><b>${n}</b><span>${lbl}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
      body.innerHTML = `<div class="stats">
        ${card(d.visitors.today, L('מבקרים היום', 'Visitors today'), L(`${d.opens.today} כניסות`, `${d.opens.today} visits`))}
        ${card(d.visitors.week, L('מבקרים השבוע', 'Visitors this week'), L(`${d.opens.week} כניסות`, `${d.opens.week} visits`))}
        ${card(d.visitors.month, L('מבקרים החודש', 'Visitors this month'), L(`${d.opens.month} כניסות`, `${d.opens.month} visits`))}
        ${card(d.users_total, L('משתמשים רשומים', 'Registered users'), L(`${d.users_verified} מאומתים`, `${d.users_verified} verified`))}
        ${card(d.users_new_week, L('נרשמו השבוע', 'New this week'))}${card(d.users_active_week, L('פעילים השבוע', 'Active this week'))}</div>
        <h3>${L('כניסות ב-30 הימים האחרונים', 'Visits – last 30 days')}</h3>
        <div class="daybars">${d.per_day.map(([day, n]) => `<div title="${day}: ${n}"><span style="height:${n / maxD * 100}%"></span><i>${n || ''}</i><em>${day.slice(8)}</em></div>`).join('')}</div>
        <div class="grid2" style="margin-top:14px">
          <div class="ch"><b>${L('🌍 מדינות', '🌍 Countries')}</b>${topTable(d.countries, flag)}</div>
          <div class="ch"><b>${L('💻 מכשירים', '💻 Devices')}</b>${topTable(d.devices, x => esc((DEV_NAME[x] || [x, x])[LANG === 'en' ? 1 : 0]))}</div>
          <div class="ch"><b>${L('🔗 הגיעו מ', '🔗 Came from')}</b>${topTable(d.refs, x => esc(x === '—' ? L('ישיר', 'Direct') : x))}</div>
          <div class="ch"><b>${L('📄 עמודים', '📄 Pages')}</b>${topTable(d.views, x => esc(PAGE_TITLES[x] ? t(PAGE_TITLES[x]) : x))}</div>
          <div class="ch"><b>${L('🗣 שפה', '🗣 Language')}</b>${topTable(d.langs, x => esc(x === 'he' ? 'עברית' : x === 'en' ? 'English' : x))}</div>
          <div class="ch"><b>${L('⚡ פעולות', '⚡ Actions')}</b>${topTable(d.events, x => esc(EV_NAMES[x] ? L(...EV_NAMES[x]) : x))}</div></div>`;
    } else if (ADM.tab === 'users') {
      const us = await api('/admin/users', { admin: k });
      body.innerHTML = `<input type="text" id="admUserQ" placeholder="${L('חיפוש לפי שם או מייל…', 'Search name or email…')}">
        <div class="tblwrap"><table class="admtbl"><tr><th>${L('שם', 'Name')}</th><th>${L('מייל', 'Email')}</th><th>${L('נרשם', 'Joined')}</th><th>${L('נראה לאחרונה', 'Last seen')}</th><th>${L('שירים', 'Songs')}</th><th></th></tr>
        ${us.map(u => `<tr data-q="${esc((u.name + ' ' + u.email).toLowerCase())}" class="${u.blocked ? 'blocked' : ''}"><td>${esc(u.name || '—')}</td><td dir="ltr">${esc(u.email)} ${u.verified ? '✅' : '⏳'}</td>
          <td>${when(u.created)}</td><td>${when(u.last_seen)}</td><td>${u.songs_count || 0}</td>
          <td><button class="btn sm" data-blk="${u.id}" data-b="${u.blocked ? 0 : 1}">${u.blocked ? L('שחרר', 'Unblock') : L('חסום', 'Block')}</button></td></tr>`).join('') || `<tr><td>${t('none')}</td></tr>`}</table></div>
        <p class="muted">✅ ${L('מאומת', 'verified')} · ⏳ ${L('עוד לא אימת את המייל', 'not verified yet')} · ${L('סה״כ', 'Total')} ${us.length}</p>`;
      $('#admUserQ').oninput = e => { const q = e.target.value.toLowerCase(); $$('.admtbl tr[data-q]').forEach(r => r.classList.toggle('hidden', !r.dataset.q.includes(q))); };
      $$('[data-blk]').forEach(b => b.onclick = async () => { await api(`/admin/users/${b.dataset.blk}/block`, { method: 'POST', admin: k, body: { blocked: b.dataset.b === '1' } }); renderAdmin(); });
    } else if (ADM.tab === 'messages') {
      const ms = await api('/admin/messages', { admin: k });
      body.innerHTML = ms.length ? ms.map(m => `<div class="msg ${m.handled ? 'done' : ''}"><div class="row"><b class="grow">${esc(m.name || L('ללא שם', 'No name'))} ${m.email ? `· <a dir="ltr" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + t('appName'))}">${esc(m.email)}</a>` : ''}</b>
        <span class="muted">${when(m.ts)}</span>${m.handled ? `<span class="pill">✓ ${L('טופל', 'Handled')}</span>` : `<button class="btn sm" data-hd="${m.id}">✓ ${L('סמן כטופל', 'Mark handled')}</button>`}</div>
        <div class="msgtext">${esc(m.text)}</div></div>`).join('') : `<div class="muted">${L('אין הודעות עדיין.', 'No messages yet.')}</div>`;
      $$('[data-hd]').forEach(b => b.onclick = async () => { await api(`/admin/messages/${b.dataset.hd}/handled`, { method: 'POST', admin: k }); renderAdmin(); });
    } else if (ADM.tab === 'outbox') {
      const d = await api('/admin/outbox', { admin: k });
      body.innerHTML = `<div class="status ${d.configured ? 'ok' : 'err'}">${d.configured ? '✅ ' + L('שליחת מיילים מחוברת.', 'Email sending is connected.')
        : '⚠️ ' + L('שליחת מיילים עוד לא חוברה – המיילים נשמרים כאן בלבד. כאן אפשר לראות את קודי האימות ולהעביר אותם למשתמש ידנית.', 'Email sending is not connected yet – emails are only stored here. You can see verification codes here and pass them on manually.')}</div>
        <div class="tblwrap"><table class="admtbl"><tr><th>${L('זמן', 'Time')}</th><th>${L('אל', 'To')}</th><th>${L('נושא', 'Subject')}</th><th>${L('תוכן', 'Body')}</th><th>${L('מצב', 'Status')}</th></tr>
        ${d.items.map(x => `<tr><td>${when(x.ts)}</td><td dir="ltr">${esc(x.to_addr || x.to || '')}</td><td>${esc(x.subject)}</td><td class="pre">${esc(x.body)}</td><td>${x.status === 'sent' ? '✅' : x.status === 'saved' ? '💾' : '❌ ' + esc(x.status)}</td></tr>`).join('') || `<tr><td>${t('none')}</td></tr>`}</table></div>`;
    } else if (ADM.tab === 'announce') {
      const d = await api('/announce');
      body.innerHTML = `<p class="muted">${L('ההודעה תופיע בראש האתר לכל המבקרים. השאירו ריק כדי להסיר.', 'The message appears at the top of the site for all visitors. Leave empty to remove.')}</p>
        <textarea id="annText" rows="3" maxlength="300">${esc(d.text || '')}</textarea><div class="row" style="margin-top:10px"><button class="btn pri" id="annSave">${t('save')}</button><span class="status" id="annMsg"></span></div>`;
      $('#annSave').onclick = async () => { await api('/admin/announce', { method: 'POST', admin: k, body: { text: $('#annText').value.trim() } }); $('#annMsg').textContent = '✅'; store.set('annSeen', ''); loadAnnounce(); };
    } else if (ADM.tab === 'server') {
      const d = await api('/admin/stats', { admin: k }); const maxH = Math.max(1, ...Object.values(d.hourly));
      body.innerHTML = `<div class="stats">
        <div class="stat"><b>${d.done}</b><span>${t('adDone')}</span></div><div class="stat"><b>${d.failed}</b><span>${t('adFailed')}</span></div>
        <div class="stat"><b>${d.youtube}</b><span>${t('adYoutube')}</span></div><div class="stat"><b>${d.upload}</b><span>${t('adUpload')}</span></div>
        <div class="stat"><b>${d.avg_seconds}s</b><span>${t('adAvg')}</span></div><div class="stat"><b>${d.queue}</b><span>${t('adQueue')}</span></div>
        <div class="stat"><b>${d.disk_mb}MB</b><span>${t('adDisk')}</span></div><div class="stat"><b>${d.uptime_hours}h</b><span>${t('adUptime')}</span></div></div>
        <h3>${t('adHours')}</h3><div class="bars">${[...Array(24)].map((_, h) => `<div title="${h}:00 – ${d.hourly[h] || 0}" style="height:${(d.hourly[h] || 0) / maxH * 100}%"></div>`).join('')}</div>
        <h3>${t('adJobs')}</h3><div class="tblwrap"><table class="admtbl"><tr><th>${t('song')}</th><th>${t('status')}</th><th>${t('time')}</th></tr>
        ${d.jobs.map(j => `<tr><td>${esc(j.title)}</td><td>${esc(j.status)}${j.error ? ' – ' + esc(j.error) : ''}</td><td>${when(j.created)}</td></tr>`).join('')}</table></div>
        <h3>${t('adErrors')}</h3><div class="tblwrap"><table class="admtbl">${d.errors.map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.where)}</td><td>${esc(e.msg)}</td></tr>`).join('') || `<tr><td>${t('none')}</td></tr>`}</table></div>`;
    }
  } catch (e) {
    if (e.status === 401) { ADM.key = ''; store.set('adminKey', ''); try { sessionStorage.removeItem('kp_admin'); } catch {} return renderAdmin(); }
    body.innerHTML = `<div class="status err">❌ ${esc(e.message || t('noServer'))}</div>`;
  }
}
const EV_NAMES = { login: ['התחברות', 'Sign in'], register: ['הרשמה', 'Sign up'], contact: ['צור קשר', 'Contact'], song: ['שיר הופרד', 'Song separated'],
  record: ['הקלטה', 'Recording'], export: ['ייצוא', 'Export'], room: ['ערב קריוקי נפתח', 'Karaoke night opened'], share: ['שיתוף', 'Share'], video: ['סרטון', 'Video'] };

/* ===================== שיתוף ביצוע בקישור (20) ===================== */
async function sharePerformance() {
  if (!song) return;
  if (!(song.takes || []).some(x => x.inMix)) { toast(L('קודם הקליטו את עצמכם, ואז שתפו', 'Record yourself first, then share'), 4000); return; }
  const name = await ask(L('איך לכתוב את שם הזמר/ת?', 'Singer name?'), AUTH.user?.name || store.get('lastSinger', ''));
  if (name == null) return; store.set('lastSinger', name);
  toast(t('rendering'), 8000);
  try {
    if (!(await ensureServer())) throw new Error(t('noServer'));
    const buf = await renderMix(); const blob = await toMp3(buf);
    const fd = new FormData(); fd.append('file', blob, blob.type === 'audio/mpeg' ? 'perf.mp3' : 'perf.wav'); fd.append('title', song.title); fd.append('name', name);
    const d = await api('/share/perf', { method: 'POST', form: fd, ms: 300000 });
    const url = `${location.origin}${location.pathname}?perf=${d.id}&srv=${encodeURIComponent(await publicServer())}`;
    track('share');
    modal(`<h3>🔗 ${L('הקישור לביצוע שלך', 'Link to your performance')}</h3><p class="muted">${L('כל מי שמקבל את הקישור יכול להאזין.', 'Anyone with the link can listen.')}</p>
      <input type="text" readonly value="${esc(url)}" dir="ltr" id="shUrl"><div class="row" style="margin-top:10px"><button class="btn pri" id="shCopy">${L('העתק', 'Copy')}</button>
      <a class="btn" href="mailto:?subject=${encodeURIComponent(L('תשמעו אותי שר!', 'Listen to me sing!'))}&body=${encodeURIComponent(url)}">✉ ${L('במייל', 'By email')}</a></div>`, m => {
      m.querySelector('#shCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { m.querySelector('#shUrl').select(); } };
    });
  } catch (e) { toast('❌ ' + (e.message || t('netErr')), 5000); }
}
// השרת הציבורי (לא 127.0.0.1) – כדי שקישורים יעבדו גם אצל אחרים
async function publicServer() {
  const s = server(); if (!/127\.0\.0\.1|localhost/.test(s)) return s;
  try { const d = await api('/whoami', { ms: 5000 }); if (d.public) return d.public; } catch {}
  return s;
}
async function showSharedPerf(id, srv) {
  const box = $('#perfBox'); box.innerHTML = `<div class="muted">${t('checking')}</div>`;
  try {
    const d = await api('/share/' + encodeURIComponent(id), { srv });
    box.innerHTML = `<div class="perfcard"><div class="perfmic">🎤</div><h1>${esc(d.name || L('זמר/ת', 'Singer'))}</h1><h2>${esc(d.title || '')}</h2>
      <audio controls src="${esc(srv + d.file)}" style="width:100%;margin:14px 0"></audio>
      <div class="row" style="justify-content:center"><button class="btn" data-cr="clap">👏</button><button class="btn" data-cr="cheer">🎉</button><button class="btn" data-cr="wow">😮</button></div>
      <p class="muted">${new Date(d.ts * 1000).toLocaleDateString()}</p><a class="btn pri" href="${location.pathname}#home">🎤 ${L('גם אני רוצה לשיר!', 'I want to sing too!')}</a></div>`;
    $$('#perfBox [data-cr]').forEach(b => b.onclick = () => { crowd(b.dataset.cr); floatEmoji(b.textContent); });
  } catch (e) { box.innerHTML = `<div class="status err">❌ ${esc(e.message)}</div>`; }
}

/* ===================== רשימה משותפת לקבוצה (19) ===================== */
async function sharePlaylist(pl) {
  try {
    if (!(await ensureServer())) throw new Error(t('noServer'));
    const songs = [];
    for (const id of pl.songs) { const s = await DB.get('songs', id); if (s) songs.push(songMeta(s)); }
    const d = await api('/share/playlist', { method: 'POST', body: { title: pl.name, songs } });
    const url = `${location.origin}${location.pathname}?pl=${d.id}&srv=${encodeURIComponent(await publicServer())}`;
    track('share');
    modal(`<h3>👥 ${L('רשימה משותפת', 'Shared playlist')}: ${esc(pl.name)}</h3><p class="muted">${L('שלחו את הקישור לחברים – הם יוכלו להוסיף את כל השירים לספרייה שלהם ולשיר.', 'Send the link to friends – they can add all songs to their library and sing.')}</p>
      <input type="text" readonly value="${esc(url)}" dir="ltr" id="plUrl"><div class="row" style="margin-top:10px"><button class="btn pri" id="plCopy">${L('העתק', 'Copy')}</button>
      <a class="btn" href="mailto:?subject=${encodeURIComponent(pl.name)}&body=${encodeURIComponent(url)}">✉ ${L('במייל', 'By email')}</a></div>`, m => {
      m.querySelector('#plCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { m.querySelector('#plUrl').select(); } };
    });
  } catch (e) { toast('❌ ' + (e.message || t('netErr')), 5000); }
}
async function importSharedPlaylist(id, srv) {
  try {
    const d = await api('/share/' + encodeURIComponent(id), { srv });
    const m = modal(`<h3>👥 ${esc(d.title || L('רשימה משותפת', 'Shared playlist'))}</h3><div class="list">${(d.songs || []).map(s => `<div class="item">🎵 ${esc(s.title)}</div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="plImp">${L('הוסף לספרייה שלי', 'Add to my library')}</button><button class="btn" id="plNo">${t('cancel')}</button></div>`);
    m.querySelector('#plNo').onclick = () => m.remove();
    m.querySelector('#plImp').onclick = async () => {
      const ids = [];
      for (const s of d.songs || []) { if (!s?.id) continue; const ex = await DB.get('songs', s.id); if (!ex) await DB.put('songs', s.id, { ...s, server: s.server || srv, offline: false, profile: store.get('profile', 'main') }); ids.push(s.id); }
      const plId = 'pl' + Date.now(); await DB.put('playlists', plId, { id: plId, name: (d.title || '') + ' 👥', songs: ids, shared: id });
      m.remove(); toast('✅ ' + L('הרשימה נוספה לספרייה', 'Playlist added to your library')); if (curView() === 'library') renderLibrary(); else location.hash = 'library';
    };
  } catch (e) { toast('❌ ' + e.message, 5000); }
}
