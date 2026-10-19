/* אולפן הקריוקי שלי – אפקטים: קולות קהל, קונפטי, אורות, רקעים מונפשים, אפקטי קול, תיקון זיופים, תעודה */
'use strict';
const L = (he, en) => (LANG === 'en' ? en : he);

/* ===================== קולות קהל (15) ===================== */
function noiseBuf(ctx, sec) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function crowdOut() {
  const ctx = audioCtx();
  if (!P.crowd) { P.crowd = ctx.createGain(); P.crowd.gain.value = .9; P.crowd.connect(ctx.destination); }
  return P.crowd;
}
const CROWD = {
  clap(ctx, out, t0, dur = 3.2, n = 70) {           // מחיאות כפיים – הרבה מחיאות קצרות
    const nb = noiseBuf(ctx, .08);
    for (let i = 0; i < n; i++) {
      const tt = t0 + Math.random() * dur, s = ctx.createBufferSource(); s.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 1600; f.Q.value = 1.2;
      const g = ctx.createGain(); const fade = 1 - Math.max(0, (tt - t0) / dur - .6) * 2;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.55 * fade, tt + .003); g.gain.exponentialRampToValueAtTime(.001, tt + .07);
      s.connect(f); f.connect(g); g.connect(out); s.start(tt); s.stop(tt + .08);
    }
  },
  cheer(ctx, out, t0, dur = 3) {                    // תשואות – רעש קהל + "וווו"
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.35, t0 + .4); g.gain.linearRampToValueAtTime(0, t0 + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t0);
    for (let k = 0; k < 6; k++) {
      const o = ctx.createOscillator(), og = ctx.createGain(), bp = ctx.createBiquadFilter(); o.type = 'sawtooth';
      const st = t0 + Math.random() * .8, base = 350 + Math.random() * 300;
      o.frequency.setValueAtTime(base, st); o.frequency.linearRampToValueAtTime(base * 1.5, st + .5); o.frequency.linearRampToValueAtTime(base * 1.2, st + 1.6);
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      og.gain.setValueAtTime(0, st); og.gain.linearRampToValueAtTime(.05, st + .2); og.gain.linearRampToValueAtTime(0, st + 1.7);
      o.connect(bp); bp.connect(og); og.connect(out); o.start(st); o.stop(st + 1.8);
    }
    this.clap(ctx, out, t0 + .2, dur - .4, 40);
  },
  horn(ctx, out, t0) {                               // צופר שמחה
    [233, 294, 349].forEach(fq => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = fq;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.09, t0 + .03); g.gain.setValueAtTime(.09, t0 + .9); g.gain.linearRampToValueAtTime(0, t0 + 1.1);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1.2); });
  },
  drum(ctx, out, t0) {                               // תופים (טרררר... בום)
    const nb = noiseBuf(ctx, .05);
    for (let i = 0; i < 40; i++) { const tt = t0 + i * .045, s = ctx.createBufferSource(); s.buffer = nb; const g = ctx.createGain();
      g.gain.setValueAtTime(.15 + i / 120, tt); g.gain.exponentialRampToValueAtTime(.001, tt + .04); s.connect(g); g.connect(out); s.start(tt); }
    const tb = t0 + 1.85, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, tb); o.frequency.exponentialRampToValueAtTime(40, tb + .5);
    g.gain.setValueAtTime(.8, tb); g.gain.exponentialRampToValueAtTime(.001, tb + .6); o.connect(g); g.connect(out); o.start(tb); o.stop(tb + .7);
    this.clap(ctx, out, tb + .05, .5, 10);
  },
  wow(ctx, out, t0) {                                // "וואו" של קהל
    for (let k = 0; k < 8; k++) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth';
      const st = t0 + Math.random() * .2, b = 180 + Math.random() * 160; o.frequency.setValueAtTime(b, st); o.frequency.linearRampToValueAtTime(b * 1.35, st + .5); o.frequency.linearRampToValueAtTime(b * .9, st + 1.3);
      f.type = 'lowpass'; f.frequency.setValueAtTime(500, st); f.frequency.linearRampToValueAtTime(1300, st + .5); f.frequency.linearRampToValueAtTime(600, st + 1.3);
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.04, st + .15); g.gain.linearRampToValueAtTime(0, st + 1.4);
      o.connect(f); f.connect(g); g.connect(out); o.start(st); o.stop(st + 1.5); }
  },
  laugh(ctx, out, t0) {
    for (let i = 0; i < 6; i++) { const st = t0 + i * .17, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(320 - i * 12, st); o.frequency.linearRampToValueAtTime(260 - i * 12, st + .12); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.12, st + .02); g.gain.linearRampToValueAtTime(0, st + .13);
      o.connect(f); f.connect(g); g.connect(out); o.start(st); o.stop(st + .15); }
  },
  chime(ctx, out, t0) {
    [880, 1109, 1319, 1760].forEach((fq, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fq; const st = t0 + i * .09;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.12, st + .01); g.gain.exponentialRampToValueAtTime(.001, st + 1.2); o.connect(g); g.connect(out); o.start(st); o.stop(st + 1.3); });
  }
};
const REACT_SOUND = { clap: 'clap', cheer: 'cheer', heart: 'chime', fire: 'horn', laugh: 'laugh', wow: 'wow' };
async function crowd(kind) {
  const ctx = audioCtx(); if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
  const fn = CROWD[kind] || CROWD.clap; fn.call(CROWD, ctx, crowdOut(), ctx.currentTime + .02);
}

/* ===================== שיר יום הולדת (8) – הלחן הוותיק "Happy Birthday", נחלת הכלל ===================== */
async function birthdayTune() {
  const ctx = audioCtx(); if (ctx.state === 'suspended') await ctx.resume();
  const out = crowdOut(); let tt = ctx.currentTime + .1; const b = .42;
  // [midi, beats]
  const mel = [[67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2], [67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2],
    [67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2], [77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 3]];
  const chords = [[48, 3], [55, 3], [55, 3], [48, 3], [48, 3], [53, 3], [48, 2], [55, 1], [48, 3]];
  const note = (m, st, d, type, vol) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(vol, st + .02); g.gain.setValueAtTime(vol, st + d * .7); g.gain.linearRampToValueAtTime(0, st + d * .95);
    o.connect(g); g.connect(out); o.start(st); o.stop(st + d); };
  let start = tt + b;   // הקדמה קצרה
  let x = start; for (const [m, d] of mel) { note(m, x, d * b, 'triangle', .22); note(m + 12, x, d * b, 'sine', .05); x += d * b; }
  let y = start + b; for (const [m, d] of chords) { [0, 4, 7].forEach(iv => note(m + iv, y, d * b, 'sine', .05)); y += d * b; }
  setTimeout(() => crowd('cheer'), (x - ctx.currentTime) * 1000);
  return (x - ctx.currentTime) * 1000;
}

/* ===================== קונפטי (2, 8) ===================== */
function confetti(ms = 3500, emojis) {
  const cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
  const g = cv.getContext('2d'); const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ['#f472b6', '#facc15', '#38bdf8', '#a78bfa', '#4ade80', '#fb923c'];
  const ps = [...Array(180)].map(() => ({ x: Math.random() * W, y: -20 - Math.random() * H * .6, vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4,
    r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0],
    e: emojis && Math.random() < .25 ? emojis[Math.random() * emojis.length | 0] : null }));
  const t0 = performance.now();
  const tick = now => {
    g.clearRect(0, 0, W, H); const el = now - t0;
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += .04; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.globalAlpha = el > ms - 800 ? Math.max(0, (ms - el) / 800) : 1;
      if (p.e) { g.font = '26px serif'; g.fillText(p.e, 0, 0); } else { g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); } g.restore(); }
    if (el < ms) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
function floatEmoji(ch, name) {
  const d = document.createElement('div'); d.className = 'floatemo';
  d.innerHTML = `${ch}${name ? `<small>${esc(name)}</small>` : ''}`;
  d.style.insetInlineStart = (8 + Math.random() * 84) + '%';
  (document.fullscreenElement || document.body).appendChild(d); setTimeout(() => d.remove(), 3200);
}

/* ===================== שכבות קבועות בתוך מסך המילים ===================== */
function keepLayer(cls, tag = 'div') {
  const box = $('#lyrics'); let el = box.querySelector(':scope > .' + cls);
  if (!el) { el = document.createElement(tag); el.className = 'keep ' + cls; box.prepend(el); }
  return el;
}

/* ===================== רקעים מונפשים (13) ===================== */
const ANIBG = { kind: '', raf: 0, parts: [], t: 0 };
function setAniBg(kind) {
  ANIBG.kind = kind; store.set('aniBg', kind); cancelAnimationFrame(ANIBG.raf);
  const box = $('#lyrics'); const old = box.querySelector(':scope > .fxbg');
  if (!kind) { old && old.remove(); return; }
  const cv = keepLayer('fxbg', 'canvas'); const g = cv.getContext('2d'); ANIBG.parts = []; ANIBG.t = 0;
  const fit = () => { const r = box.getBoundingClientRect(); if (cv.width !== (r.width | 0) || cv.height !== (r.height | 0)) { cv.width = r.width | 0; cv.height = r.height | 0; } };
  const draw = () => {
    if (!cv.isConnected) { keepLayer('fxbg', 'canvas'); }
    fit(); const W = cv.width, H = cv.height; if (!W || !H) { ANIBG.raf = requestAnimationFrame(draw); return; }
    ANIBG.t++; const T = ANIBG.t;
    if (kind === 'space') {
      g.fillStyle = '#05040f'; g.fillRect(0, 0, W, H);
      while (ANIBG.parts.length < 260) ANIBG.parts.push({ x: (Math.random() - .5) * W, y: (Math.random() - .5) * H, z: Math.random() * W });
      g.fillStyle = '#fff';
      for (const p of ANIBG.parts) { p.z -= 4; if (p.z < 1) { p.x = (Math.random() - .5) * W; p.y = (Math.random() - .5) * H; p.z = W; }
        const k = 220 / p.z, x = W / 2 + p.x * k, y = H / 2 + p.y * k, r = Math.max(.4, 2.2 - p.z / W * 2);
        g.globalAlpha = Math.min(1, 1.4 - p.z / W); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.globalAlpha = .25; const neb = g.createRadialGradient(W * .7, H * .3, 10, W * .7, H * .3, W * .5); neb.addColorStop(0, '#7c3aed'); neb.addColorStop(1, 'transparent');
      g.fillStyle = neb; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    } else if (kind === 'sea') {
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0c4a6e'); sky.addColorStop(1, '#082f49'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 5; k++) {
        g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) g.lineTo(x, H * (.45 + k * .12) + Math.sin(x / (90 + k * 30) + T / (40 - k * 5)) * (14 + k * 4));
        g.lineTo(W, H); g.closePath(); g.fillStyle = `rgba(${14 + k * 10},${116 + k * 18},${144 + k * 15},${.35 + k * .1})`; g.fill();
      }
      g.fillStyle = '#ffffff22'; for (let i = 0; i < 25; i++) { const x = (i * 97 + T * (1 + i % 3)) % W, y = H * .5 + (i * 53) % (H * .5); g.fillRect(x, y, 2, 2); }
    } else if (kind === 'fireworks') {
      g.fillStyle = 'rgba(5,4,15,.25)'; g.fillRect(0, 0, W, H);
      if (T % 38 === 1) { const cx = W * (.15 + Math.random() * .7), cy = H * (.15 + Math.random() * .45), c = `hsl(${Math.random() * 360 | 0},95%,62%)`;
        for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2, s = 1.5 + Math.random() * 2.8; ANIBG.parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 70, c }); } }
      ANIBG.parts = ANIBG.parts.filter(p => p.l > 0);
      for (const p of ANIBG.parts) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.vx *= .985; p.l--; g.globalAlpha = p.l / 70; g.fillStyle = p.c; g.fillRect(p.x, p.y, 2.5, 2.5); }
      g.globalAlpha = 1;
    } else if (kind === 'disco') {
      g.fillStyle = '#0a0612'; g.fillRect(0, 0, W, H);
      const cols = ['#f472b6', '#38bdf8', '#facc15', '#a78bfa', '#4ade80'];
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const a = T / 70 + i * Math.PI / 3; g.save(); g.translate(W / 2, -20); g.rotate(Math.sin(a) * .9);
        const gr = g.createLinearGradient(0, 0, 0, H * 1.3); gr.addColorStop(0, cols[i % 5] + 'aa'); gr.addColorStop(1, 'transparent');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(-W * .09, H * 1.3); g.lineTo(W * .09, H * 1.3); g.closePath(); g.fill(); g.restore(); }
      for (let i = 0; i < 40; i++) { const x = (Math.sin(i * 12.9 + T / 60) * .5 + .5) * W, y = (Math.cos(i * 7.3 + T / 80) * .5 + .5) * H;
        g.fillStyle = cols[i % 5] + '88'; g.beginPath(); g.arc(x, y, 3 + (i % 4), 0, 7); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    }
    ANIBG.raf = requestAnimationFrame(draw);
  };
  draw();
}

/* ===================== אורות מסיבה בקצב (14) ===================== */
const LIGHTS = { on: false, an: null, buf: null, raf: 0, avg: 0, last: 0 };
function setLights(on) {
  LIGHTS.on = on; store.set('lights', on); cancelAnimationFrame(LIGHTS.raf);
  const box = $('#lyrics'); const old = box.querySelector(':scope > .lights');
  if (!on) { old && old.remove(); return; }
  const el = keepLayer('lights'); el.innerHTML = '<i></i><i></i><i></i><i></i>';
  const ctx = audioCtx();
  if (!LIGHTS.an) { LIGHTS.an = ctx.createAnalyser(); LIGHTS.an.fftSize = 1024; P.master.connect(LIGHTS.an); LIGHTS.buf = new Uint8Array(LIGHTS.an.frequencyBinCount); }
  const cols = ['#f472b6', '#38bdf8', '#facc15', '#a78bfa', '#4ade80', '#fb923c', '#f87171'];
  const flash = () => { const l = keepLayer('lights'); if (!l.children.length) l.innerHTML = '<i></i><i></i><i></i><i></i>';
    [...l.children].forEach(i => { i.style.background = `radial-gradient(circle, ${cols[Math.random() * cols.length | 0]}cc, transparent 65%)`; i.style.opacity = 1; });
    setTimeout(() => [...l.children].forEach(i => i.style.opacity = .15), 120); };
  const tick = now => {
    if (!LIGHTS.on) return;
    LIGHTS.an.getByteFrequencyData(LIGHTS.buf); let e = 0; for (let i = 1; i < 12; i++) e += LIGHTS.buf[i]; e /= 11;
    LIGHTS.avg = LIGHTS.avg * .95 + e * .05;
    if (P.playing && e > LIGHTS.avg * 1.18 + 6 && now - LIGHTS.last > 230) { LIGHTS.last = now; flash(); }
    else if (!P.playing && now - LIGHTS.last > 900) { LIGHTS.last = now; flash(); }
    LIGHTS.raf = requestAnimationFrame(tick);
  };
  LIGHTS.raf = requestAnimationFrame(tick);
}

/* ===================== אפקטי קול ותיקון זיופים (12, 16) – פועלים על הקלטת הקול בייצוא ===================== */
function hann(n) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; }
// מזיז גובה בלי לשנות אורך: גרגרים חופפים, כל גרגר נקרא במהירות אחרת. ratioFn(i, grain) מחזיר יחס לכל גרגר.
function granularShift(data, sr, ratioFn, grainSec = .06) {
  const N = Math.round(sr * grainSec) & ~1, hop = N / 2, win = hann(N), out = new Float32Array(data.length);
  for (let start = 0, gi = 0; start < data.length; start += hop, gi++) {
    const r = ratioFn(start, N, gi); const center = start + N / 2;
    for (let j = 0; j < N; j++) {
      const pos = center + (j - N / 2) * r; const i0 = Math.floor(pos); if (i0 < 0 || i0 + 1 >= data.length) continue;
      const fr = pos - i0; const v = data[i0] * (1 - fr) + data[i0 + 1] * fr;
      const k = start + j; if (k < out.length) out[k] += v * win[j];
    }
  }
  return out;
}
function framePitch(d, start, N, sr) {   // זיהוי גובה פשוט באוטוקורלציה (על אות מוקטן)
  let rms = 0; for (let j = 0; j < N; j++) { const v = d[start + j] || 0; rms += v * v; } rms = Math.sqrt(rms / N); if (rms < .012) return null;
  const minL = Math.floor(sr / 900), maxL = Math.floor(sr / 75); let best = -1, bestL = 0;
  for (let lag = minL; lag <= maxL; lag++) { let c = 0, n1 = 0, n2 = 0; for (let j = 0; j < N - lag; j++) { const a = d[start + j] || 0, b = d[start + j + lag] || 0; c += a * b; n1 += a * a; n2 += b * b; }
    const v = c / Math.sqrt(n1 * n2 + 1e-9); if (v > best) { best = v; bestL = lag; } }
  return best > .8 ? sr / bestL : null;
}
function pitchCorrect(data, sr, strength = .6) {
  const D = 4, ds = new Float32Array(Math.ceil(data.length / D));   // מקטינים פי 4 כדי שיהיה מהיר
  for (let i = 0; i < ds.length; i++) { let s = 0; for (let k = 0; k < D; k++) s += data[i * D + k] || 0; ds[i] = s / D; }
  let prev = 1;
  return granularShift(data, sr, (start, N) => {
    const f = framePitch(ds, Math.floor(start / D), Math.floor(N / D), sr / D); if (!f) { prev = 1 + (prev - 1) * .5; return prev; }
    const m = 69 + 12 * Math.log2(f / 440), target = Math.round(m); const r = Math.pow(2, (target - m) * strength / 12);
    prev = prev * .4 + r * .6; return prev;
  }, .05);
}
async function voiceEffect(buf, kind, correct) {
  if ((!kind || kind === 'none') && !correct) return buf;
  const sr = buf.sampleRate, chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    let d = buf.getChannelData(c).slice();
    if (correct) { d = pitchCorrect(d, sr); await sleep(0); }
    if (kind === 'helium') d = granularShift(d, sr, () => 1.55);
    if (kind === 'deep') d = granularShift(d, sr, () => .72);
    if (kind === 'robot') { d = granularShift(d, sr, () => 1); for (let i = 0; i < d.length; i++) d[i] *= Math.sin(2 * Math.PI * 55 * i / sr) * 1.6; }
    if (kind === 'phone') { let lp = 0, hp = 0, prevx = 0; for (let i = 0; i < d.length; i++) { const x = d[i]; hp = .95 * (hp + x - prevx); prevx = x; lp += .35 * (hp - lp); d[i] = Math.tanh(lp * 2.5) * .8; } }
    chs.push(d); await sleep(0);
  }
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, sr);
  const nb = ctx.createBuffer(buf.numberOfChannels, buf.length, sr); chs.forEach((d, c) => nb.copyToChannel(d, c));
  if (kind !== 'hall') return nb;
  // אולם גדול
  const src = ctx.createBufferSource(); src.buffer = nb; const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 4.5);
  const dry = ctx.createGain(), wet = ctx.createGain(); dry.gain.value = .8; wet.gain.value = .55;
  src.connect(dry); dry.connect(ctx.destination); src.connect(cv); cv.connect(wet); wet.connect(ctx.destination); src.start();
  return ctx.startRendering();
}

/* ===================== תעודת זמר (10) ===================== */
function certificate({ name, title, score, stars, place, birthday }) {
  const W = 1754, H = 1240, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, '#fdf2f8'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const gold = g.createLinearGradient(0, 0, W, 0); gold.addColorStop(0, '#b45309'); gold.addColorStop(.5, '#facc15'); gold.addColorStop(1, '#b45309');
  g.strokeStyle = gold; g.lineWidth = 26; g.strokeRect(40, 40, W - 80, H - 80); g.lineWidth = 4; g.strokeRect(80, 80, W - 160, H - 160);
  g.textAlign = 'center'; g.direction = LANG === 'en' ? 'ltr' : 'rtl'; g.fillStyle = '#1e1b4b';
  g.font = '150px serif'; g.fillText(place === 1 ? '🏆' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🎤', W / 2, 290);
  g.font = 'bold 110px Rubik, Arial'; g.fillStyle = '#7c3aed'; g.fillText(L('תעודת כוכב הקריוקי', 'Karaoke Star Certificate'), W / 2, 450);
  g.font = '50px Rubik, Arial'; g.fillStyle = '#334155'; g.fillText(L('מוענקת בזאת ל', 'Proudly presented to'), W / 2, 550);
  g.font = 'bold 130px Rubik, Arial'; g.fillStyle = '#db2777'; g.fillText(name || L('זמר/ת', 'Singer'), W / 2, 700);
  g.font = '52px Rubik, Arial'; g.fillStyle = '#334155';
  if (title) g.fillText(L('על ביצוע מרגש של: ', 'For an amazing performance of: ') + title, W / 2, 800);
  const parts = []; if (score != null) parts.push(L('ציון ', 'Score ') + score); if (stars) parts.push('★'.repeat(Math.round(stars)) + ` (${(+stars).toFixed(1)})`);
  if (place) parts.push(L('מקום ', 'Place ') + place);
  g.font = 'bold 60px Rubik, Arial'; g.fillStyle = '#b45309'; if (parts.length) g.fillText(parts.join('  ·  '), W / 2, 900);
  if (birthday) { g.font = 'bold 56px Rubik, Arial'; g.fillStyle = '#db2777'; g.fillText(`🎂 ${L('מזל טוב', 'Happy birthday')} ${birthday}!`, W / 2, 985); }
  g.font = '40px Rubik, Arial'; g.fillStyle = '#64748b'; g.fillText(new Date().toLocaleDateString(LANG === 'en' ? 'en-GB' : 'he-IL') + '  ·  ' + t('appName'), W / 2, 1110);
  return new Promise(r => cv.toBlob(r, 'image/png'));
}
