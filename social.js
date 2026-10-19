/* אולפן הקריוקי שלי – קהילה: פיד קליפים, סטורי, פרופילים, עוקבים, לייקים, תגובות, התראות, דואט,
   מצלמת קריוקי, עמודי ערב, זמר השבוע ואתגרים, הגבלות שימוש */
'use strict';

const SOC = { tab: 'foryou', items: [], more: true, muted: true, io: null, viewed: new Set(), unseen: 0 };
const mediaUrl = p => (p && p.startsWith('/') ? server() + p : p || '');
function hashParams() { const h = location.hash.split('?')[1] || ''; return new URLSearchParams(h); }
function ago(ts) {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return L('עכשיו', 'now');
  if (s < 3600) return L(`לפני ${Math.floor(s / 60)} דק׳`, `${Math.floor(s / 60)}m`);
  if (s < 86400) return L(`לפני ${Math.floor(s / 3600)} שע׳`, `${Math.floor(s / 3600)}h`);
  return L(`לפני ${Math.floor(s / 86400)} ימים`, `${Math.floor(s / 86400)}d`);
}
const uAva = (u, cls = '') => u?.avatar ? `<img class="uava ${cls}" src="${esc(mediaUrl(u.avatar))}" alt="">`
  : `<span class="uava ${cls} ph">${esc((u?.name || '?').trim().charAt(0) || '🎤')}</span>`;
function needLogin(msg) {
  if (AUTH.tok) return false;
  toast('👤 ' + (msg || L('צריך להתחבר כדי לעשות את זה (ההרשמה בחינם)', 'Please sign in first (free)')), 4500);
  location.hash = 'account'; return true;
}
async function serverOrMsg(box) {
  if (await ensureServer()) return true;
  if (box) box.innerHTML = `<div class="card"><div class="status err">⚠️ ${esc(t('noServer'))}</div></div>`;
  return false;
}

/* ===================== הגבלות – מונה באולפן ===================== */
async function refreshLimits() {
  const box = $('#limitBox'); if (!box) return;
  try {
    if (!(await ensureServer())) { box.textContent = ''; return; }
    const d = await api('/limits/me', { ms: 8000 });
    if (d.admin) { box.innerHTML = `👑 ${L('מנהל – בלי הגבלות', 'Admin – unlimited')}`; return; }
    if (d.unlimited) { box.innerHTML = `⭐ ${L('החשבון שלך בלי הגבלות', 'Your account is unlimited')}`; return; }
    const left = d.songs_left;
    box.innerHTML = `🎵 ${L('נשארו לך היום', 'Songs left today')}: <b>${left}</b> ${L('מתוך', 'of')} ${d.songs_cap}` +
      (d.logged_in ? ` · 💾 ${L('שמורים בחשבון', 'Saved')}: ${d.lib_used}/${d.limits.lib_max}`
        : ` · <a href="#account">${L(`הירשמו וקבלו ${d.limits.user_songs_day} ביום`, `Sign up for ${d.limits.user_songs_day}/day`)}</a>`);
    box.classList.toggle('empty', left <= 0);
  } catch { box.textContent = ''; }
}

/* ===================== התראות – פעמון בכותרת ===================== */
function renderBell() {
  let b = $('#bellBtn');
  if (!b) { b = document.createElement('button'); b.id = 'bellBtn'; b.className = 'btn sm bell'; b.onclick = () => { location.hash = 'notifs'; }; $('#userChip')?.before(b); }
  b.classList.toggle('hidden', !AUTH.tok);
  b.innerHTML = `🔔${SOC.unseen ? `<i>${SOC.unseen > 9 ? '9+' : SOC.unseen}</i>` : ''}`;
}
async function pollNotifs() {
  if (AUTH.tok && document.visibilityState === 'visible') {
    try { if (await ensureServer()) { SOC.unseen = (await api('/notifs/count', { ms: 8000 })).unseen; } } catch {}
  }
  renderBell();
}
setInterval(pollNotifs, 45000);

/* ===================== כרטיס קליפ ===================== */
function captionHtml(c) {
  return esc(c || '').replace(/#([\w֐-׿]{2,30})/g, (m, tg) => `<a href="#feed?tag=${encodeURIComponent(tg)}" class="tag">#${tg}</a>`);
}
function clipCard(c) {
  return `<article class="clip" data-cid="${esc(c.id)}">
    <div class="clipmedia">
      <video src="${esc(mediaUrl(c.file))}" ${c.thumb ? `poster="${esc(mediaUrl(c.thumb))}"` : ''} playsinline loop preload="metadata" ${SOC.muted ? 'muted' : ''}></video>
      <button class="mutebtn" data-act="mute">${SOC.muted ? '🔇' : '🔊'}</button>
      ${c.kind === 'story' ? `<span class="badge">${L('סטורי', 'Story')}</span>` : ''}
      ${c.visibility === 'followers' ? `<span class="badge lock">🔒 ${L('לעוקבים', 'Followers')}</span>` : ''}
      ${c.hidden ? `<span class="badge red">${L('מוסתר ע״י המנהל', 'Hidden by admin')}</span>` : ''}
      <div class="clipside">
        <button data-act="like" class="${c.liked ? 'on' : ''}">❤️<b>${c.likes}</b></button>
        <button data-act="comments">💬<b>${c.comments}</b></button>
        <button data-act="duet" title="${L('דואט', 'Duet')}">🎤<b>${L('דואט', 'Duet')}</b></button>
        <button data-act="share">🔗<b>${L('שתף', 'Share')}</b></button>
        <button data-act="more">⋯</button>
      </div>
    </div>
    <div class="clipinfo">
      <div class="row"><a href="#profile?u=${c.user.id}" class="clipuser">${uAva(c.user)}<b>${esc(c.user.name)}</b></a>
        ${!c.mine && AUTH.tok ? `<button class="btn sm ${c.i_follow ? '' : 'pri'}" data-act="follow" data-uid="${c.user.id}">${c.i_follow ? L('עוקב ✓', 'Following ✓') : L('+ עקוב', '+ Follow')}</button>` : ''}
        <span class="muted grow" style="text-align:end">${ago(c.ts)} · 👁 ${c.views}</span></div>
      ${c.song ? `<div class="clipsong">🎵 ${esc(c.song)}</div>` : ''}
      ${c.caption ? `<div class="clipcap">${captionHtml(c.caption)}</div>` : ''}
      ${c.duet_of ? `<a class="muted" href="#clip?id=${esc(c.duet_of)}">🎤 ${L('דואט על קליפ אחר – לצפייה', 'Duet of another clip – watch')}</a>` : ''}
      ${c.event ? ` <a class="muted" href="#event?code=${esc(c.event)}">🎉 ${L('מערב קריוקי', 'From karaoke night')} ${esc(c.event)}</a>` : ''}
    </div></article>`;
}
function bindClips(root, list) {
  const byId = Object.fromEntries(list.map(c => [c.id, c]));
  root.querySelectorAll('.clip').forEach(el => {
    const c = byId[el.dataset.cid]; if (!c) return; const v = el.querySelector('video');
    v.onclick = () => { if (v.paused) v.play().catch(() => {}); else v.pause(); };
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = async e => {
      e.stopPropagation(); const act = b.dataset.act;
      if (act === 'mute') { SOC.muted = !SOC.muted; $$('.clip video').forEach(x => x.muted = SOC.muted); $$('.mutebtn').forEach(x => x.textContent = SOC.muted ? '🔇' : '🔊'); }
      if (act === 'like') { if (needLogin()) return; try { const d = await api(`/clip/${c.id}/like`, { method: 'POST' }); c.liked = d.liked; c.likes = d.likes; b.classList.toggle('on', d.liked); b.querySelector('b').textContent = d.likes; if (d.liked) { b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 400); } } catch (er) { toast('❌ ' + er.message); } }
      if (act === 'comments') openComments(c, b);
      if (act === 'duet') { if (needLogin()) return; location.hash = 'create?duet=' + encodeURIComponent(c.id); }
      if (act === 'share') shareClip(c);
      if (act === 'follow') { if (needLogin()) return; const on = !c.i_follow; try { await api('/follow/' + c.user.id, { method: on ? 'POST' : 'DELETE' });
        list.filter(x => x.user.id === c.user.id).forEach(x => x.i_follow = on);
        root.querySelectorAll(`[data-act=follow][data-uid="${c.user.id}"]`).forEach(x => { x.textContent = on ? L('עוקב ✓', 'Following ✓') : L('+ עקוב', '+ Follow'); x.classList.toggle('pri', !on); }); } catch (er) { toast('❌ ' + er.message); } }
      if (act === 'more') clipMenu(c, el);
    });
  });
  observeClips(root);
}
function observeClips(root) {
  if (!('IntersectionObserver' in window)) return;
  SOC.io = SOC.io || new IntersectionObserver(ents => {
    for (const en of ents) {
      const v = en.target;
      if (en.isIntersecting && en.intersectionRatio > .6) {
        $$('.clip video').forEach(x => { if (x !== v) x.pause(); });
        v.play().catch(() => {});
        const cid = v.closest('.clip')?.dataset.cid;
        if (cid && !SOC.viewed.has(cid)) { SOC.viewed.add(cid); setTimeout(() => { if (!v.paused) api(`/clip/${cid}/view`, { method: 'POST' }).catch(() => {}); }, 2000); }
      } else v.pause();
    }
  }, { threshold: [0, .6, 1] });
  root.querySelectorAll('.clip video').forEach(v => SOC.io.observe(v));
}
async function shareClip(c) {
  const url = `${location.origin}${location.pathname}?clip=${encodeURIComponent(c.id)}&srv=${encodeURIComponent(await publicServer())}`;
  modal(`<h3>🔗 ${L('שיתוף הקליפ', 'Share clip')}</h3><input type="text" readonly value="${esc(url)}" dir="ltr" id="clUrl">
    <div class="row" style="margin-top:10px"><button class="btn pri" id="clCopy">${L('העתק', 'Copy')}</button>
    <a class="btn" href="mailto:?subject=${encodeURIComponent(L('תראו אותי שר!', 'Watch me sing!'))}&body=${encodeURIComponent(url)}">✉ ${L('במייל', 'By email')}</a>
    <a class="btn" href="${esc(mediaUrl(c.file))}" download="clip.webm">⬇ ${L('הורד', 'Download')}</a></div>`, m => {
    m.querySelector('#clCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { m.querySelector('#clUrl').select(); } };
  });
  track('share');
}
function clipMenu(c, el) {
  const m = modal(`<h3>⋯</h3><div class="list">
    ${c.mine ? `<button class="btn" id="cmDel">🗑 ${L('מחק את הקליפ', 'Delete clip')}</button>` : ''}
    <button class="btn" id="cmRep">🚩 ${L('דווח על תוכן לא ראוי', 'Report inappropriate content')}</button>
    <a class="btn" href="#profile?u=${c.user.id}">👤 ${L('לפרופיל של', 'Profile of')} ${esc(c.user.name)}</a></div>`);
  m.querySelector('a').onclick = () => m.remove();
  m.querySelector('#cmDel') && (m.querySelector('#cmDel').onclick = async () => {
    if (!confirm(L('למחוק את הקליפ לתמיד?', 'Delete this clip forever?'))) return;
    try { await api('/clip/' + c.id, { method: 'DELETE' }); el.remove(); m.remove(); toast('🗑 ' + L('נמחק', 'Deleted')); } catch (e) { toast('❌ ' + e.message); }
  });
  m.querySelector('#cmRep').onclick = async () => {
    const reason = await ask(L('למה לדווח? (לא חובה)', 'Why report? (optional)')); if (reason === null) return;
    try { await api('/report', { method: 'POST', body: { clip_id: c.id, reason } }); m.remove(); toast('✅ ' + L('תודה! המנהל יבדוק.', 'Thanks! The admin will review.')); } catch (e) { toast('❌ ' + e.message); }
  };
}
async function openComments(c, btn) {
  const m = modal(`<h3>💬 ${L('תגובות', 'Comments')}</h3><div class="list cmts" id="cmList">${t('checking')}</div>
    ${AUTH.tok ? `<div class="row" style="margin-top:10px"><input type="text" id="cmText" maxlength="500" placeholder="${L('כתבו תגובה…', 'Write a comment…')}" style="flex:1"><button class="btn pri" id="cmSend">${L('שלח', 'Send')}</button></div>`
      : `<p class="muted"><a href="#account">${L('התחברו', 'Sign in')}</a> ${L('כדי להגיב', 'to comment')}</p>`}`);
  m.querySelector('a[href="#account"]') && (m.querySelector('a[href="#account"]').onclick = () => m.remove());
  const draw = list => {
    m.querySelector('#cmList').innerHTML = list.length ? list.map(x => `<div class="item cmt">${uAva(x.user)}<div class="grow"><a href="#profile?u=${x.user.id}"><b>${esc(x.user.name)}</b></a> <span class="muted">${ago(x.ts)}</span><div>${esc(x.text)}</div></div>
      ${x.mine ? `<button class="btn sm" data-cdel="${x.id}">🗑</button>` : ''}${AUTH.tok && !x.mine ? `<button class="btn sm" data-crep="${x.id}" title="report">🚩</button>` : ''}</div>`).join('') : `<div class="muted">${L('עוד אין תגובות. תהיו הראשונים!', 'No comments yet. Be the first!')}</div>`;
    m.querySelectorAll('#cmList a').forEach(a => a.onclick = () => m.remove());
    m.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { await api('/comment/' + b.dataset.cdel, { method: 'DELETE' }); load(); });
    m.querySelectorAll('[data-crep]').forEach(b => b.onclick = async () => { await api('/report', { method: 'POST', body: { comment_id: +b.dataset.crep, reason: 'comment' } }); toast('✅ ' + L('דווח', 'Reported')); });
    c.comments = list.length; if (btn) btn.querySelector('b').textContent = list.length;
  };
  const load = async () => { try { draw(await api(`/clip/${c.id}/comments`)); } catch (e) { m.querySelector('#cmList').textContent = '❌ ' + e.message; } };
  load();
  const send = async () => { const i = m.querySelector('#cmText'); const txt = i.value.trim(); if (!txt) return; i.value = '';
    try { draw(await api(`/clip/${c.id}/comments`, { method: 'POST', body: { text: txt } })); } catch (e) { toast('❌ ' + e.message); } };
  m.querySelector('#cmSend') && (m.querySelector('#cmSend').onclick = send);
  m.querySelector('#cmText') && (m.querySelector('#cmText').onkeydown = e => { if (e.key === 'Enter') send(); });
}

/* ===================== פיד ===================== */
async function renderFeed(more) {
  const box = $('#feedBox'); if (!box) return;
  const hp = hashParams(); const tag = hp.get('tag');
  if (!more) {
    box.innerHTML = `<div class="feedtop">
      <div class="row"><h2 class="grow" style="margin:0">🌟 ${L('קהילה', 'Community')}</h2>
        <button class="btn pri" id="fdCreate">🎬 ${L('קליפ חדש', 'New clip')}</button>
        ${AUTH.tok ? `<a class="btn" href="#profile?u=${AUTH.user.id}">👤 ${L('הפרופיל שלי', 'My profile')}</a>` : `<a class="btn" href="#account">👤 ${L('התחברות', 'Sign in')}</a>`}</div>
      <div class="storybar" id="storyBar"></div>
      <div class="row"><div class="seg" id="fdTabs">${[['foryou', L('✨ בשבילך', '✨ For you')], ['following', L('👥 עוקב', '👥 Following')], ['new', L('🆕 חדש', '🆕 New')], ['week', L('⭐ השבוע', '⭐ This week')]]
        .map(([k, n]) => `<button data-tab="${k}" class="${!tag && SOC.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <input type="search" id="fdSearch" placeholder="🔍 ${L('חיפוש זמרים…', 'Search singers…')}" style="flex:1;min-width:150px"></div>
      <div id="fdSearchRes" class="list"></div>
      ${tag ? `<div class="tagbar">#${esc(tag)} <a class="btn sm" href="#feed">✕</a></div>` : ''}</div>
      <div id="feedList" class="feedlist"><div class="muted">${t('checking')}</div></div>`;
    $('#fdCreate').onclick = () => { if (needLogin(L('כדי להעלות קליפ צריך להתחבר', 'Sign in to post a clip'))) return; location.hash = 'create'; };
    $$('#fdTabs [data-tab]').forEach(b => b.onclick = () => { SOC.tab = b.dataset.tab; if (tag) location.hash = 'feed'; else renderFeed(); });
    let st = 0; $('#fdSearch').oninput = e => { clearTimeout(st); st = setTimeout(async () => { const q = e.target.value.trim(); const r = $('#fdSearchRes');
      if (!q) { r.innerHTML = ''; return; } try { const us = await api('/search/users?q=' + encodeURIComponent(q));
        r.innerHTML = us.length ? us.map(u => `<a class="item" href="#profile?u=${u.id}">${uAva(u)}<b>${esc(u.name)}</b></a>`).join('') : `<div class="muted">${L('לא נמצאו', 'None found')}</div>`; } catch {} }, 300); };
    SOC.items = []; SOC.more = true;
    if (!(await serverOrMsg($('#feedList')))) return;
    renderStories();
  }
  const list = $('#feedList');
  try {
    if (!tag && SOC.tab === 'week') { await renderWeek(list); return; }
    if (!tag && SOC.tab === 'following' && !AUTH.tok) { list.innerHTML = `<div class="card muted">${L('התחברו כדי לראות קליפים של מי שאתם עוקבים אחריו.', 'Sign in to see clips from people you follow.')} <a href="#account">${L('התחברות', 'Sign in')}</a></div>`; return; }
    const before = more ? (SOC.tab === 'foryou' && !tag ? SOC.items.length : SOC.items[SOC.items.length - 1]?.ts) : '';
    const items = await api(`/feed?tab=${SOC.tab}${tag ? '&tag=' + encodeURIComponent(tag) : ''}${before ? '&before=' + before : ''}`);
    SOC.items.push(...items); SOC.more = items.length >= 20;
    if (!SOC.items.length) { list.innerHTML = `<div class="card emptyfeed"><div style="font-size:60px">🎤</div><h3>${L('עוד אין כאן קליפים', 'No clips here yet')}</h3><p class="muted">${L('תהיו הראשונים! צלמו קליפ קריוקי ושתפו את כולם.', 'Be the first! Record a karaoke clip and share it.')}</p><button class="btn pri" onclick="location.hash='create'">🎬 ${L('קליפ חדש', 'New clip')}</button></div>`; return; }
    list.innerHTML = SOC.items.map(clipCard).join('') + (SOC.more ? `<button class="btn" id="fdMore">${L('טען עוד', 'Load more')}</button>` : '');
    bindClips(list, SOC.items);
    $('#fdMore') && ($('#fdMore').onclick = () => renderFeed(true));
  } catch (e) { list.innerHTML = `<div class="status err">❌ ${esc(e.message)}</div>`; }
}
async function renderWeek(list) {
  const d = await api('/weekly');
  list.innerHTML = `<div class="card weekcard"><h3>🎯 ${L('האתגר השבועי', 'Weekly challenge')}: <a href="#feed?tag=${encodeURIComponent(d.challenge.tag)}" class="tag">#${esc(d.challenge.tag)}</a></h3>
      <p>${esc(d.challenge.text || '')}</p><button class="btn pri" id="wkGo">🎬 ${L('אני משתתף!', 'I\'m in!')}</button></div>
    ${d.singers.length ? `<div class="card"><h3>👑 ${L('זמרי השבוע', 'Singers of the week')}</h3><div class="list">${d.singers.map((u, i) => `<a class="item" href="#profile?u=${u.id}"><span class="place">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${uAva(u)}<b class="grow">${esc(u.name)}</b><span>❤️ ${u.likes}</span></a>`).join('')}</div></div>` : ''}
    ${d.tags.length ? `<div class="card"><h3>🔥 ${L('תגיות חמות', 'Hot tags')}</h3><div class="row">${d.tags.map(([tg, n]) => `<a class="btn sm" href="#feed?tag=${encodeURIComponent(tg)}">#${esc(tg)} <span class="muted">${n}</span></a>`).join('')}</div></div>` : ''}
    <h3>⭐ ${L('הקליפים הכי אהובים השבוע', 'Most loved clips this week')}</h3><div id="wkClips"></div>`;
  $('#wkGo').onclick = () => { if (needLogin()) return; location.hash = 'create?tag=' + encodeURIComponent(d.challenge.tag); };
  const w = $('#wkClips'); w.innerHTML = d.top.map(clipCard).join('') || `<div class="muted">${L('עוד אין', 'None yet')}</div>`; bindClips(w, d.top);
}

/* ===================== סטורי ===================== */
async function renderStories() {
  const bar = $('#storyBar'); if (!bar) return;
  try {
    const groups = await api('/stories');
    bar.innerHTML = `<button class="story add" id="stAdd"><span class="ring">${AUTH.user ? uAva({ name: AUTH.user.name }) : '<span class="uava ph">+</span>'}<i>+</i></span><small>${L('הסטורי שלי', 'My story')}</small></button>` +
      groups.map((g, i) => `<button class="story" data-g="${i}"><span class="ring">${uAva(g.user)}</span><small>${esc(g.user.name)}</small></button>`).join('');
    $('#stAdd').onclick = () => { if (needLogin()) return; location.hash = 'create?kind=story'; };
    bar.querySelectorAll('[data-g]').forEach(b => b.onclick = () => storyViewer(groups, +b.dataset.g));
  } catch { bar.innerHTML = ''; }
}
function storyViewer(groups, gi, ii = 0) {
  $('#storyView')?.remove();
  const g = groups[gi]; if (!g) return; const it = g.items[ii]; if (!it) return storyViewer(groups, gi + 1, 0);
  const o = document.createElement('div'); o.id = 'storyView'; o.className = 'storyview';
  o.innerHTML = `<div class="sv-bars">${g.items.map((x, k) => `<i><b style="width:${k < ii ? 100 : 0}%"></b></i>`).join('')}</div>
    <div class="sv-top">${uAva(g.user)}<b>${esc(g.user.name)}</b><span>${ago(it.ts)}</span><button class="sv-x">✕</button></div>
    <video src="${esc(mediaUrl(it.file))}" playsinline autoplay></video>
    ${it.caption ? `<div class="sv-cap">${captionHtml(it.caption)}</div>` : ''}
    <button class="sv-prev" aria-label="prev"></button><button class="sv-next" aria-label="next"></button>`;
  document.body.appendChild(o);
  const v = o.querySelector('video'), bar = o.querySelectorAll('.sv-bars b')[ii]; let raf;
  const next = () => { cancelAnimationFrame(raf); o.remove(); storyViewer(groups, ii + 1 < g.items.length ? gi : gi + 1, ii + 1 < g.items.length ? ii + 1 : 0); };
  const prev = () => { cancelAnimationFrame(raf); o.remove(); if (ii > 0) storyViewer(groups, gi, ii - 1); else if (gi > 0) storyViewer(groups, gi - 1, 0); };
  const tickBar = () => { const d = isFinite(v.duration) ? v.duration : 15; bar.style.width = Math.min(100, v.currentTime / d * 100) + '%'; if (v.currentTime >= 60) return next(); raf = requestAnimationFrame(tickBar); };
  v.onended = next; v.onplay = tickBar; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  o.querySelector('.sv-next').onclick = next; o.querySelector('.sv-prev').onclick = prev;
  o.querySelector('.sv-x').onclick = () => { cancelAnimationFrame(raf); o.remove(); };
  if (!SOC.viewed.has(it.id)) { SOC.viewed.add(it.id); api(`/clip/${it.id}/view`, { method: 'POST' }).catch(() => {}); }
}

/* ===================== קליפ בודד, עמוד ערב ===================== */
async function renderClipPage() {
  const box = $('#clipBox'); if (!box) return; const id = hashParams().get('id'); if (!id) return;
  if (!(await serverOrMsg(box))) return;
  box.innerHTML = `<div class="muted">${t('checking')}</div>`;
  try {
    const c = await api('/clip/' + encodeURIComponent(id));
    box.innerHTML = `<div class="feedlist">${clipCard(c)}${c.duet ? `<h3 style="text-align:center">🎤 ${L('הקליפ המקורי של הדואט', 'Original clip of the duet')}</h3>${clipCard(c.duet)}` : ''}</div>
      <div style="text-align:center;margin:16px"><a class="btn pri" href="#feed">🌟 ${L('לכל הקליפים בקהילה', 'See all community clips')}</a></div>`;
    bindClips(box, [c, ...(c.duet ? [c.duet] : [])]);
  } catch (e) { box.innerHTML = `<div class="card"><div class="status err">❌ ${esc(e.message)}</div><a class="btn" href="#feed">🌟 ${L('לקהילה', 'Community')}</a></div>`; }
}
async function renderEventPage() {
  const box = $('#eventBox'); if (!box) return; const code = (hashParams().get('code') || '').toUpperCase();
  if (!(await serverOrMsg(box))) return;
  try {
    const items = await api('/feed?event=' + encodeURIComponent(code));
    box.innerHTML = `<div class="card evhead"><h2>🎉 ${L('ערב קריוקי', 'Karaoke night')} ${esc(code)}</h2><p class="muted">${items.length} ${L('קליפים מהערב', 'clips from the night')} · ${new Set(items.map(c => c.user.id)).size} ${L('זמרים', 'singers')}</p>
      <button class="btn pri" id="evShare">🔗 ${L('שתף את עמוד הערב', 'Share this page')}</button></div>
      <div class="feedlist">${items.map(clipCard).join('') || `<div class="muted">${L('עוד אין קליפים מהערב הזה', 'No clips from this night yet')}</div>`}</div>`;
    bindClips(box, items);
    $('#evShare').onclick = async () => { const url = `${location.origin}${location.pathname}?event=${code}&srv=${encodeURIComponent(await publicServer())}`; try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { ask(t('copyLink'), url); } };
  } catch (e) { box.innerHTML = `<div class="status err">❌ ${esc(e.message)}</div>`; }
}

/* ===================== פרופיל ===================== */
async function renderProfile() {
  const box = $('#profileBox'); if (!box) return;
  const uid = +hashParams().get('u') || AUTH.user?.id;
  if (!uid) { needLogin(); return; }
  if (!(await serverOrMsg(box))) return;
  box.innerHTML = `<div class="muted">${t('checking')}</div>`;
  try {
    const p = await api('/u/' + uid);
    const invite = `${location.origin}${location.pathname}?invite=${p.id}`;
    box.innerHTML = `<div class="card profhead">
      <div class="profava ${p.me ? 'editable' : ''}" id="pfAva" title="${p.me ? L('החלף תמונה', 'Change photo') : ''}">${uAva(p, 'big')}${p.me ? '<i>📷</i>' : ''}</div>
      <input type="file" id="pfAvaIn" accept="image/*" hidden>
      <div class="grow"><h2 style="margin:0">${esc(p.name)}</h2>${p.bio ? `<p>${esc(p.bio)}</p>` : (p.me ? `<p class="muted">${L('עוד לא כתבת כלום על עצמך', 'No bio yet')}</p>` : '')}
        <div class="profstats"><span><b>${p.clips_count}</b>${L('קליפים', 'clips')}</span><a href="#" data-fl="followers"><b>${p.followers}</b>${L('עוקבים', 'followers')}</a>
          <a href="#" data-fl="following"><b>${p.following}</b>${L('עוקב אחרי', 'following')}</a><span><b>${p.likes_total}</b>❤️</span></div>
        <div class="row" style="margin-top:10px">${p.me ? `<button class="btn" id="pfEdit">✏️ ${L('עריכת פרופיל', 'Edit profile')}</button><button class="btn pri" onclick="location.hash='create'">🎬 ${L('קליפ חדש', 'New clip')}</button>`
          : (AUTH.tok ? `<button class="btn ${p.i_follow ? '' : 'pri'}" id="pfFollow">${p.i_follow ? L('עוקב ✓', 'Following ✓') : L('+ עקוב', '+ Follow')}</button>` : `<a class="btn pri" href="#account">${L('התחברו כדי לעקוב', 'Sign in to follow')}</a>`)}</div></div></div>
      ${p.me ? `<div class="card invitecard">🎁 <b>${L('הזמינו חברים וקבלו עוד שירים!', 'Invite friends, get more songs!')}</b> ${L('כל חבר שנרשם דרך הקישור שלכם = עוד שיר ביום.', 'Every friend who signs up with your link = one more song per day.')}
        <div class="row" style="margin-top:8px"><input type="text" readonly value="${esc(invite)}" dir="ltr" id="pfInv" style="flex:1"><button class="btn" id="pfInvCopy">${L('העתק', 'Copy')}</button></div></div>` : ''}
      <div class="clipgrid">${p.clips.map(c => `<a class="gitem" href="#clip?id=${esc(c.id)}">${c.thumb ? `<img src="${esc(mediaUrl(c.thumb))}" alt="">` : '<span>🎤</span>'}<i>❤️ ${c.likes}</i>${c.visibility === 'followers' ? '<em>🔒</em>' : ''}</a>`).join('')
        || `<div class="muted">${L('עוד אין קליפים', 'No clips yet')}</div>`}</div>`;
    $$('[data-fl]').forEach(a => a.onclick = async e => { e.preventDefault(); const list = await api(`/u/${p.id}/${a.dataset.fl}`);
      const m = modal(`<h3>${a.dataset.fl === 'followers' ? L('עוקבים', 'Followers') : L('עוקב אחרי', 'Following')}</h3><div class="list">${list.map(u => `<a class="item" href="#profile?u=${u.id}">${uAva(u)}<b>${esc(u.name)}</b></a>`).join('') || `<div class="muted">${t('none')}</div>`}</div>`);
      m.querySelectorAll('a').forEach(x => x.onclick = () => m.remove()); });
    if (p.me) {
      $('#pfAva').onclick = () => $('#pfAvaIn').click();
      $('#pfAvaIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; const fd = new FormData();
        fd.append('file', await shrinkImage(f), 'avatar.jpg'); try { await api('/me/avatar', { method: 'POST', form: fd }); renderProfile(); } catch (er) { toast('❌ ' + er.message); } };
      $('#pfEdit').onclick = () => { const m = modal(`<h3>✏️ ${L('עריכת פרופיל', 'Edit profile')}</h3><label>${L('שם', 'Name')}</label><input type="text" id="peName" maxlength="40" value="${esc(p.name)}">
        <label>${L('כמה מילים עליי', 'About me')}</label><textarea id="peBio" maxlength="200" rows="3">${esc(p.bio || '')}</textarea>
        <div class="row" style="margin-top:10px"><button class="btn pri" id="peSave">${t('save')}</button></div>`);
        m.querySelector('#peSave').onclick = async () => { try { await api('/me/profile', { method: 'POST', body: { name: m.querySelector('#peName').value, bio: m.querySelector('#peBio').value } });
          const a = AUTH.data; a.user.name = m.querySelector('#peName').value.trim() || a.user.name; AUTH.set(a); m.remove(); renderProfile(); } catch (e) { toast('❌ ' + e.message); } }; };
      $('#pfInvCopy').onclick = async () => { try { await navigator.clipboard.writeText(invite); toast(t('linkCopied')); } catch { $('#pfInv').select(); } };
    } else if ($('#pfFollow')) {
      $('#pfFollow').onclick = async () => { try { await api('/follow/' + p.id, { method: p.i_follow ? 'DELETE' : 'POST' }); renderProfile(); } catch (e) { toast('❌ ' + e.message); } };
    }
  } catch (e) { box.innerHTML = `<div class="card"><div class="status err">❌ ${esc(e.message)}</div></div>`; }
}
function shrinkImage(file, max = 512) {
  return new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => res(b || file), 'image/jpeg', .85); }; img.onerror = () => res(file); img.src = URL.createObjectURL(file); });
}

/* ===================== התראות ===================== */
async function renderNotifs() {
  const box = $('#notifBox'); if (!box) return;
  if (needLogin()) return;
  if (!(await serverOrMsg(box))) return;
  try {
    const d = await api('/notifs');
    const T = { follow: L('התחיל/ה לעקוב אחריך', 'started following you'), like: L('אהב/ה את הקליפ שלך ❤️', 'liked your clip ❤️'),
      comment: L('הגיב/ה על הקליפ שלך:', 'commented on your clip:'), duet: L('עשה/תה דואט על הקליפ שלך 🎤', 'made a duet with your clip 🎤'),
      new_clip: L('העלה/תה קליפ חדש', 'posted a new clip'), new_story: L('העלה/תה סטורי חדש', 'posted a new story') };
    box.innerHTML = `<div class="card"><h2>🔔 ${L('התראות', 'Notifications')}</h2><div class="list">${d.items.map(n => `<a class="item ${n.seen ? '' : 'unseen'}" href="${n.clip_id ? '#clip?id=' + encodeURIComponent(n.clip_id) : '#profile?u=' + (n.actor?.id || '')}">
      ${uAva(n.actor)}<span class="grow"><b>${esc(n.actor?.name || '')}</b> ${T[n.kind] || n.kind} ${n.text ? `<i>"${esc(n.text)}"</i>` : ''}</span><span class="muted">${ago(n.ts)}</span></a>`).join('')
      || `<div class="muted">${L('אין עדיין התראות', 'No notifications yet')}</div>`}</div></div>`;
    if (d.unseen) { api('/notifs/seen', { method: 'POST' }).catch(() => {}); SOC.unseen = 0; renderBell(); }
  } catch (e) { box.innerHTML = `<div class="status err">❌ ${esc(e.message)}</div>`; }
}

/* ===================== מצלמת קריוקי – יצירת קליפ / סטורי / דואט ===================== */
const CR = { cam: null, mic: null, rec: null, chunks: [], raf: 0, recording: false, blob: null, thumb: null, duet: null, duetVid: null, t0: 0, dest: null, dur: 0 };
function crStopStreams() {
  cancelAnimationFrame(CR.raf); CR.raf = 0;
  [CR.cam, CR.mic].forEach(s => s && s.getTracks().forEach(t => t.stop())); CR.cam = CR.mic = null;
  if (CR.duetVid) { CR.duetVid.pause(); }
}
async function renderCreate() {
  const box = $('#createBox'); if (!box) return;
  if (needLogin(L('כדי ליצור קליפ צריך להתחבר', 'Sign in to create a clip'))) return;
  crStopStreams(); CR.blob = null;
  const hp = hashParams(); const duetId = hp.get('duet'); const kind0 = hp.get('kind') === 'story' ? 'story' : 'clip'; const tag0 = hp.get('tag');
  const songs = (await DB.all('songs')).sort((a, b) => a.title.localeCompare(b.title));
  CR.duet = null;
  if (duetId) { try { CR.duet = await api('/clip/' + encodeURIComponent(duetId)); } catch (e) { toast('❌ ' + e.message); } }
  box.innerHTML = `<div class="card">
    <h2>🎬 ${CR.duet ? L('דואט עם', 'Duet with') + ' ' + esc(CR.duet.user.name) : L('מצלמת קריוקי', 'Karaoke camera')}</h2>
    <div class="crgrid">
      <div class="crstage"><canvas id="crCv" width="720" height="1280"></canvas><video id="crOut" class="hidden" controls playsinline></video>
        <div id="crCount" class="crcount hidden"></div><div id="crTimer" class="crtimer hidden">0:00</div></div>
      <div class="crctl">
        ${CR.duet ? `<p class="muted">${L('הקליפ שלו יתנגן בצד אחד, ואתה תצטלם בצד השני. מומלץ אוזניות!', 'Their clip plays on one side, you on the other. Headphones recommended!')}</p>` : `
        <label>🎵 ${L('שיר', 'Song')}</label>
        <select id="crSong">${songs.length ? songs.map(s => `<option value="${esc(s.id)}" ${song && song.id === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('') : `<option value="">${t('libEmpty')}</option>`}</select>
        <label>⏱ ${L('להתחיל מהשנייה', 'Start at second')}</label>
        <div class="row"><input type="number" id="crStart" min="0" value="0" style="width:110px"><button class="btn sm" id="crChorus">🎯 ${L('מהפזמון', 'From chorus')}</button></div>`}
        <label>📷 ${L('מצב', 'Mode')}</label>
        <div class="seg" id="crMode"><button data-m="video" class="on">🎥 ${L('וידאו', 'Video')}</button><button data-m="audio">🎵 ${L('רק קול', 'Voice only')}</button></div>
        <div id="crBgRow" class="hidden"><label>🌌 ${L('רקע', 'Background')}</label><select id="crBg"><option value="space">🌌 ${L('חלל', 'Space')}</option><option value="sea">🌊 ${L('ים', 'Sea')}</option><option value="fireworks">🎆 ${L('זיקוקים', 'Fireworks')}</option><option value="disco">🪩 ${L('דיסקו', 'Disco')}</option></select></div>
        <label>📌 ${L('סוג', 'Type')}</label>
        <div class="seg" id="crKind"><button data-k="clip" class="${kind0 === 'clip' ? 'on' : ''}">🎞 ${L('קליפ', 'Clip')}</button><button data-k="story" class="${kind0 === 'story' ? 'on' : ''}">⭕ ${L('סטורי (24 שעות)', 'Story (24h)')}</button></div>
        <label class="chk" style="margin-top:8px"><input type="checkbox" id="crMirror" checked> ${L('מראה (כמו סלפי)', 'Mirror (selfie)')}</label>
        <div class="row" style="margin-top:14px"><button class="btn pri big2" id="crRec">⏺ ${L('התחל לצלם', 'Start recording')}</button></div>
        <p class="muted small">${L('עד 60 שניות. השיר מתנגן, המילים על המסך, והקול שלך מוקלט יחד עם הפלייבק. מומלץ עם אוזניות.', 'Up to 60 seconds. The song plays with lyrics on screen; your voice is recorded with the backing track. Headphones recommended.')}</p>
        <div id="crAfter" class="hidden">
          <label>✍️ ${L('כיתוב', 'Caption')}</label><textarea id="crCap" rows="2" maxlength="300" placeholder="${L('כתבו משהו… אפשר להוסיף #תגית', 'Write something… add a #tag')}">${tag0 ? '#' + esc(tag0) + ' ' : ''}</textarea>
          <label>👁 ${L('מי יכול לראות', 'Who can see')}</label><div class="seg" id="crVis"><button data-v="public" class="on">🌍 ${L('כולם', 'Everyone')}</button><button data-v="followers">🔒 ${L('רק העוקבים שלי', 'Only my followers')}</button></div>
          ${typeof ROOM !== 'undefined' && ROOM ? `<label class="chk"><input type="checkbox" id="crEvent" checked> 🎉 ${L('שייך לערב הקריוקי', 'Link to karaoke night')} ${ROOM.code}</label>` : ''}
          <div class="row" style="margin-top:12px"><button class="btn pri big2" id="crPost">🚀 ${L('פרסם', 'Post')}</button><button class="btn" id="crAgain">🔄 ${L('צלם שוב', 'Retake')}</button><button class="btn" id="crSave">⬇ ${L('הורד למחשב', 'Download')}</button></div>
        </div>
      </div></div></div>`;
  let mode = 'video', kind = kind0, vis = 'public';
  const seg = (sel, attr, cb) => $$(sel + ' button').forEach(b => b.onclick = () => { $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset[attr]); });
  seg('#crMode', 'm', m => { mode = m; $('#crBgRow').classList.toggle('hidden', m !== 'audio'); startPreview(mode); });
  seg('#crKind', 'k', k => kind = k);
  seg('#crVis', 'v', v => vis = v);
  $('#crBg').onchange = () => startPreview(mode);
  $('#crChorus') && ($('#crChorus').onclick = async () => { const s = await DB.get('songs', $('#crSong').value); const ch = (s?.markers || []).find(m => m.type === 'chorus');
    if (ch) $('#crStart').value = Math.floor(ch.t); else toast(L('לשיר הזה עוד לא סומן פזמון (באולפן: "סמן פזמון")', 'No chorus marked for this song yet')); });
  $('#crRec').onclick = () => CR.recording ? stopRecording() : startRecording(mode);
  $('#crAgain').onclick = () => renderCreate();
  $('#crSave').onclick = () => CR.blob && download(CR.blob, `${safeName(L('קליפ קריוקי', 'karaoke clip'))}.webm`);
  $('#crPost').onclick = async e => {
    if (!CR.blob) return; const b = e.target; b.disabled = true; b.textContent = L('מעלה…', 'Uploading…');
    try {
      const fd = new FormData(); fd.append('file', CR.blob, 'clip.webm'); if (CR.thumb) fd.append('thumb', CR.thumb, 'thumb.jpg');
      fd.append('kind', kind); fd.append('media', mode); fd.append('caption', $('#crCap').value); fd.append('visibility', vis); fd.append('duration', String(CR.dur || 0));
      fd.append('song', CR.duet ? (CR.duet.song || '') : ((await DB.get('songs', $('#crSong')?.value))?.title || ''));
      if (CR.duet) fd.append('duet_of', CR.duet.id);
      if ($('#crEvent')?.checked) fd.append('event', ROOM.code);
      const c = await api('/clips', { method: 'POST', form: fd, ms: 300000 }); track('clip');
      toast('🎉 ' + L('פורסם!', 'Posted!'), 4000); confetti(2500);
      location.hash = kind === 'story' ? 'feed' : 'clip?id=' + encodeURIComponent(c.id);
    } catch (er) { toast('❌ ' + er.message, 6000); b.disabled = false; b.textContent = '🚀 ' + L('פרסם', 'Post'); }
  };
  startPreview(mode);
}
async function startPreview(mode) {
  crStopStreams();
  const cv = $('#crCv'); if (!cv) return; cv.classList.remove('hidden'); $('#crOut').classList.add('hidden');
  const g = cv.getContext('2d'); const W = cv.width, H = cv.height;
  let camVid = null;
  if (mode === 'video') {
    try { CR.cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      camVid = document.createElement('video'); camVid.srcObject = CR.cam; camVid.muted = true; camVid.playsInline = true; await camVid.play(); }
    catch { toast(t('camDenied') || L('אין גישה למצלמה – עוברים למצב "רק קול"', 'No camera – using voice only'), 5000); mode = 'audio'; }
  }
  if (CR.duet && !CR.duetVid) { CR.duetVid = document.createElement('video'); CR.duetVid.crossOrigin = 'anonymous'; CR.duetVid.src = mediaUrl(CR.duet.file); CR.duetVid.playsInline = true; CR.duetVid.preload = 'auto'; }
  const parts = [...Array(120)].map(() => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), c: COLORS[Math.random() * COLORS.length | 0] }));
  const bgKind = $('#crBg')?.value || 'space'; let T = 0;
  const cover = (src, sw, sh, dx, dy, dw, dh, mirror) => { const k = Math.max(dw / sw, dh / sh), w = sw * k, h = sh * k;
    g.save(); g.beginPath(); g.rect(dx, dy, dw, dh); g.clip(); if (mirror) { g.translate(dx + dw, 0); g.scale(-1, 1); dx = 0; }
    g.drawImage(src, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h); g.restore(); };
  const drawBg = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    const pal = { space: ['#05040f', '#2e1065'], sea: ['#082f49', '#0e7490'], fireworks: ['#0a0612', '#312e81'], disco: ['#1a0526', '#701a75'] }[bgKind] || ['#05040f', '#2e1065'];
    gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fillRect(x, y, w, h);
    for (const p of parts) { p.y -= (bgKind === 'sea' ? .4 : 1.2) * (p.z + .3); if (p.y < y) p.y = y + h;
      g.globalAlpha = .3 + p.z * .6; g.fillStyle = bgKind === 'space' ? '#fff' : p.c; g.beginPath(); g.arc(x + (p.x % w), p.y, 1 + p.z * (bgKind === 'disco' ? 6 : 2.5), 0, 7); g.fill(); }
    g.globalAlpha = 1;
    if (bgKind === 'disco' || bgKind === 'fireworks') { const r = 120 + Math.sin(T / 15) * 40; g.globalAlpha = .25; g.fillStyle = COLORS[Math.floor(T / 20) % COLORS.length]; g.beginPath(); g.arc(x + w / 2, y + h * .35, r, 0, 7); g.fill(); g.globalAlpha = 1; }
    const me = AUTH.user?.name || ''; g.fillStyle = '#fff'; g.font = 'bold 120px serif'; g.textAlign = 'center'; g.fillText('🎤', x + w / 2, y + h * .38);
    g.font = 'bold 54px Rubik, Arial'; g.fillText(me, x + w / 2, y + h * .38 + 110);
  };
  const draw = () => {
    T++;
    const mirror = $('#crMirror')?.checked;
    if (CR.duet) {
      const half = W / 2;
      if (CR.duetVid && CR.duetVid.readyState >= 2) cover(CR.duetVid, CR.duetVid.videoWidth || 720, CR.duetVid.videoHeight || 1280, 0, 0, half, H, false); else { g.fillStyle = '#111'; g.fillRect(0, 0, half, H); }
      if (camVid) cover(camVid, camVid.videoWidth, camVid.videoHeight, half, 0, half, H, mirror); else drawBg(half, 0, half, H);
      g.fillStyle = '#fff'; g.fillRect(half - 2, 0, 4, H);
    } else {
      if (camVid) cover(camVid, camVid.videoWidth, camVid.videoHeight, 0, 0, W, H, mirror); else drawBg(0, 0, W, H);
      // מילים
      if (song) { const Ls = lyricLines(); const tm = curTime(); let cur = -1; Ls.forEach((l, i) => { if (l.s != null && l.s <= tm + .05) cur = i; });
        const grd = g.createLinearGradient(0, H * .62, 0, H); grd.addColorStop(0, 'transparent'); grd.addColorStop(1, '#000c'); g.fillStyle = grd; g.fillRect(0, H * .62, W, H * .38);
        g.textAlign = 'center'; g.direction = 'rtl';
        [0, 1].forEach(k => { const l = Ls[cur + k]; if (!l) return; g.font = k ? '40px Rubik, Arial' : 'bold 56px Rubik, Arial'; g.fillStyle = k ? '#ffffffaa' : '#facc15';
          wrapText(g, lineText(l), W / 2, H * .82 + k * 90, W - 60, k ? 46 : 62); });
        g.font = 'bold 34px Rubik, Arial'; g.fillStyle = '#fff'; g.fillText('🎵 ' + song.title, W / 2, 70); }
    }
    g.font = '26px Rubik, Arial'; g.fillStyle = '#ffffffcc'; g.textAlign = 'center'; g.fillText('🎤 ' + t('appName'), CR.duet ? W * .75 : W / 2, H - 24);
    if (CR.recording) { const el = (performance.now() - CR.t0) / 1000; $('#crTimer').textContent = fmt(el); if (el >= 60) stopRecording();
      if (!CR.thumb && el > 1.2) cv.toBlob(b => { CR.thumb = b; }, 'image/jpeg', .8); }
    CR.raf = requestAnimationFrame(draw);
  };
  draw();
}
function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = '', lines = [];
  for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line); lines.slice(0, 2).forEach((l, i) => g.fillText(l, x, y + i * lh));
}
async function startRecording(mode) {
  const ctx = audioCtx(); await ctx.resume();
  if (!CR.duet) {
    const sid = $('#crSong').value; if (!sid) { toast(t('libEmpty')); return; }
    if (!song || song.id !== sid) { const s = await DB.get('songs', sid); await openSong(s); history.replaceState(null, '', '#create'); }
    if (!(song.stems || []).length) { toast('❌ ' + t('fileGone')); return; }
  }
  try { CR.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }); }
  catch { toast(t('micDenied'), 5000); return; }
  CR.dest = ctx.createMediaStreamDestination();
  const micSrc = ctx.createMediaStreamSource(CR.mic); const micG = ctx.createGain(); micG.gain.value = 1.1; micSrc.connect(micG); micG.connect(CR.dest);
  let duetSrc = null;
  if (CR.duet) { if (!CR.duetVid._src) { CR.duetVid._src = ctx.createMediaElementSource(CR.duetVid); } duetSrc = CR.duetVid._src; duetSrc.connect(CR.dest); duetSrc.connect(ctx.destination); }
  else P.master.connect(CR.dest);
  // ספירה לאחור
  const cd = $('#crCount'); cd.classList.remove('hidden');
  for (const n of [3, 2, 1]) { cd.textContent = n; tick(); await sleep(800); }
  cd.classList.add('hidden');
  const cv = $('#crCv');
  const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...CR.dest.stream.getAudioTracks()]);
  const mt = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
  CR.rec = new MediaRecorder(stream, { mimeType: mt, videoBitsPerSecond: 2500000 }); CR.chunks = []; CR.thumb = null;
  CR.rec.ondataavailable = e => e.data.size && CR.chunks.push(e.data);
  CR.rec.onstop = () => {
    try { if (CR.duet) duetSrc.disconnect(CR.dest); else P.master.disconnect(CR.dest); } catch {}
    micSrc.disconnect(); CR.mic && CR.mic.getTracks().forEach(t => t.stop()); CR.mic = null;
    CR.blob = new Blob(CR.chunks, { type: 'video/webm' }); CR.dur = (performance.now() - CR.t0) / 1000;
    crStopStreams();
    const out = $('#crOut'); out.src = URL.createObjectURL(CR.blob); out.classList.remove('hidden'); $('#crCv').classList.add('hidden');
    $('#crAfter').classList.remove('hidden'); $('#crTimer').classList.add('hidden');
    $('#crRec').textContent = '⏺ ' + L('צלם שוב', 'Record again'); $('#crRec').onclick = () => renderCreate();
    if (!CR.thumb) cv.toBlob(b => { CR.thumb = b; }, 'image/jpeg', .8);
  };
  if (CR.duet) { CR.duetVid.currentTime = 0; CR.duetVid.onended = () => stopRecording(); await CR.duetVid.play().catch(() => {}); }
  else { seek(+$('#crStart').value || 0); await playAll(false); }
  CR.t0 = performance.now(); CR.recording = true; CR.rec.start(500);
  $('#crTimer').classList.remove('hidden'); $('#crRec').textContent = '⏹ ' + L('סיום', 'Stop'); $('#crRec').classList.add('rec');
}
function stopRecording() {
  if (!CR.recording) return; CR.recording = false;
  $('#crRec')?.classList.remove('rec');
  try { CR.rec.stop(); } catch {}
  if (CR.duet) CR.duetVid.pause(); else pauseAll();
}
{ const orig = onEnded; onEnded = function () { orig(); if (CR.recording) stopRecording(); }; }

/* ===================== ניתוב וחיבורים ===================== */
Object.assign(PAGE_TITLES, { feed: 'commTitle', profile: 'profTitle', create: 'createTitle', notifs: 'notifTitle', clip: 'commTitle', event: 'tabParty' });
function onSocialView() {
  const v = curView();
  if (v !== 'create' && (CR.cam || CR.recording)) { if (CR.recording) stopRecording(); crStopStreams(); }
  if (v !== 'feed' && v !== 'clip' && v !== 'event' && v !== 'profile') $$('.clip video').forEach(x => x.pause());
  if (v === 'feed') renderFeed();
  if (v === 'profile') renderProfile();
  if (v === 'create') renderCreate();
  if (v === 'notifs') renderNotifs();
  if (v === 'clip') renderClipPage();
  if (v === 'event') renderEventPage();
  if (v === 'studio') refreshLimits();
}
window.addEventListener('hashchange', onSocialView);
{ const orig = AUTH.set.bind(AUTH); AUTH.set = d => { orig(d); renderBell(); pollNotifs(); }; }
(function socialInit() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('invite')) store.set('invite', qs.get('invite'));
  if (qs.get('clip')) { if (qs.get('srv')) AUTO_SERVER = qs.get('srv'); history.replaceState(null, '', location.pathname + '#clip?id=' + encodeURIComponent(qs.get('clip'))); show('clip'); }
  if (qs.get('event')) { if (qs.get('srv')) AUTO_SERVER = qs.get('srv'); history.replaceState(null, '', location.pathname + '#event?code=' + encodeURIComponent(qs.get('event'))); show('event'); }
  if (qs.get('invite') && !qs.get('clip')) { history.replaceState(null, '', location.pathname + '#account'); show('account'); ACC.step = 'register'; renderAccount(); toast('🎁 ' + L('הוזמנת לאולפן הקריוקי! נרשמים בחינם', 'You were invited! Sign up for free'), 5000); }
  renderBell(); pollNotifs(); onSocialView();
})();
