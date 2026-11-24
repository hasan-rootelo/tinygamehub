// Beanstalk Leap: climb the beanstalk, hop the clouds, reach the castle.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- pictures ---------------- */
const IMG = {};
const NAMES = ['hero-stand', 'hero-climb', 'hero-crouch', 'hero-jump', 'hero-fall', 'hero-hurt', 'hero-cheer', 'stalk',
  'cloud-normal', 'cloud-rain', 'cloud-thunder', 'cloud-thorns', 'cloud-bouncy', 'crow1', 'crow2', 'bee1', 'bee2', 'caterpillar',
  'egg', 'bean', 'feather', 'coin', 'castle', 'bg-sky', 'bg-village', 'bg-storm'];
let loaded = 0;
const ready = new Promise(res => NAMES.forEach(n => { const i = new Image(); i.onload = i.onerror = () => { if (++loaded === NAMES.length) res(); }; i.src = n + '.webp'; IMG[n] = i; }));

/* ---------------- save ---------------- */
const KEY = 'beanstalkleap:v1';
let save = { stars: {}, coins: 0, muted: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { } };
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);

/* ---------------- levels ----------------
   climb: seconds on the beanstalk; clouds: how many to the castle; gap: horizontal gaps; rise: height change per cloud;
   mix: chance of each cloud type; enemies per second; arc: how much of the landing arc is shown (1 = all) */
const LEVELS = [
  { name: 'Morning Climb', climb: 22, clouds: 9, gap: [170, 300], rise: [-60, 90], mix: { normal: 1 }, drift: 0, enemies: 0, climbBugs: .35, arc: 1, storm: false },
  { name: 'Above the Village', climb: 26, clouds: 11, gap: [190, 340], rise: [-80, 120], mix: { normal: .8, bouncy: .2 }, drift: .2, enemies: .05, climbBugs: .45, arc: 1, storm: false },
  { name: 'Rainy Puffs', climb: 28, clouds: 12, gap: [200, 360], rise: [-90, 130], mix: { normal: .6, rain: .3, bouncy: .1 }, drift: .25, enemies: .08, climbBugs: .5, arc: 1, storm: false },
  { name: 'Thorny Heights', climb: 30, clouds: 13, gap: [200, 380], rise: [-100, 140], mix: { normal: .55, rain: .15, thorns: .2, bouncy: .1 }, drift: .3, enemies: .1, climbBugs: .55, arc: .7, storm: false },
  { name: 'Storm Front', climb: 30, clouds: 14, gap: [210, 390], rise: [-110, 150], mix: { normal: .45, rain: .2, thunder: .2, bouncy: .15 }, drift: .35, enemies: .12, climbBugs: .6, arc: .7, storm: true },
  { name: 'Crow Country', climb: 32, clouds: 15, gap: [220, 400], rise: [-110, 150], mix: { normal: .5, rain: .2, thorns: .15, bouncy: .15 }, drift: .4, enemies: .2, climbBugs: .65, arc: .6, storm: false },
  { name: 'Drifting Skies', climb: 34, clouds: 16, gap: [220, 410], rise: [-120, 160], mix: { normal: .45, rain: .2, thunder: .1, thorns: .1, bouncy: .15 }, drift: .65, enemies: .15, climbBugs: .7, arc: .5, storm: false },
  { name: 'The Giant\'s Castle', climb: 36, clouds: 18, gap: [230, 420], rise: [-130, 170], mix: { normal: .4, rain: .2, thunder: .15, thorns: .15, bouncy: .1 }, drift: .5, enemies: .2, climbBugs: .75, arc: .45, storm: true }
];
const TEST_MODE = /[?&]test\b/.test(location.search);   // add ?test to the address to open every level for testing
const unlocked = i => TEST_MODE || i === 0 || (save.stars[i - 1] || 0) > 0;

/* ---------------- canvas (virtual 720 x 1280 portrait stage) ---------------- */
const VW = 720, VH = 1280;
const cv = $('#cv'), cx = cv.getContext('2d');
let S = 1, DPR = 1;
function resize() {
  const st = $('#stage'); DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(st.clientWidth * DPR); cv.height = Math.round(st.clientHeight * DPR); S = cv.width / VW;
}
addEventListener('resize', resize);

/* ---------------- sound ---------------- */
let AC = null;
function audio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { } }
function tn(f, d, type = 'sine', v = .08, w = 0, sl = 0) {
  if (!AC || save.muted) return; const t0 = AC.currentTime + w, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (sl) o.frequency.exponentialRampToValueAtTime(sl, t0 + d);
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + d + .05);
}
const sJump = () => { tn(330, .18, 'triangle', .08, 0, 660); };
const sLand = () => { tn(140, .1, 'sine', .1); tn(90, .12, 'triangle', .05, .02); };
const sCoin = () => { tn(988, .07, 'square', .045); tn(1319, .16, 'square', .045, .06); };
const sEgg = () => [784, 988, 1175, 1568].forEach((f, i) => tn(f, .22, 'triangle', .06, i * .07));
const sHurt = () => { tn(220, .25, 'sawtooth', .1, 0, 110); tn(160, .3, 'square', .05, .05, 80); };
const sZap = () => { for (let i = 0; i < 6; i++) tn(1500 + Math.random() * 1800, .04, 'square', .03, i * .03); };
const sBoing = () => tn(200, .35, 'sine', .12, 0, 900);
const sFall = () => tn(700, 1.2, 'triangle', .08, 0, 90);
const sWin = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tn(f, .3, 'triangle', .08, i * .12));

/* ---------------- game state ---------------- */
let L = null, LI = 0, phase = 'title', t = 0;
let hearts = 3, maxHearts = 3, score = 0, eggs = 0, feather = 0, inv = 0, hurtT = 0;
let parts = [], pops = [], flash = 0, nextBolt = 5;

// climb phase
let climb = null;
// cloud phase
let hero = null, clouds = [], items = [], foes = [], cam = { x: 0, y: 0 }, castle = null, charge = null, lowestY = 0, nextFoe = 3;

const HERO_H = 175;          // hero height in the world
const Z = .72;               // cloud view is zoomed out a little so you can see where you're aiming
const ZW = VW / Z, ZH = VH / Z;
const G = 2500;              // gravity
const ANG = 58 * Math.PI / 180;
const VMIN = 680, VMAX = 1480;

function pick(mix) { let r = Math.random(), a = 0; for (const k in mix) { a += mix[k]; if (r <= a) return k; } return 'normal'; }

function startLevel(i) {
  hero = null;   // no hero on the clouds until the climb is done
  LI = i; L = LEVELS[i]; hearts = maxHearts = 3; score = 0; eggs = 0; feather = 0; inv = 0; hurtT = 0; parts = []; pops = []; flash = 0; nextBolt = rnd(3, 6);
  climb = { y: 0, side: -1, target: -1, swing: 0, speed: 210, hazards: [], next: 1.5, len: L.climb * 210, done: false };
  phase = 'climbIntro'; showCard('climbCard');
  $('#lvlTitle').textContent = `${i + 1}. ${L.name}`;
  buildClouds();
  hud();
}

function buildClouds() {
  clouds = []; items = []; foes = []; castle = null;
  let x = 0, y = 0;
  clouds.push({ type: 'normal', x, y, w: 300, bx: x, by: y, drift: 0, start: true });
  for (let i = 1; i <= L.clouds; i++) {
    const gap = rnd(...L.gap), rise = rnd(...L.rise);
    x += gap + 150; y -= rise;
    let type = i === L.clouds ? 'normal' : pick(L.mix);
    // never two hazards in a row, so there's always a safe path
    const prev = clouds[clouds.length - 1];
    if ((type === 'thorns' || type === 'thunder') && (prev.type === 'thorns' || prev.type === 'thunder')) type = 'normal';
    const w = type === 'bouncy' ? 230 : rnd(230, 300);
    const c = { type, x, y, w, bx: x, by: y, drift: Math.random() < L.drift && type !== 'thorns' ? (Math.random() < .5 ? 'x' : 'y') : 0, ph: rnd(0, 6), amp: rnd(50, 90) };
    clouds.push(c);
    // a hazard cloud gets a safe alternative close by
    if (type === 'thorns' || type === 'thunder') {
      clouds.push({ type: 'normal', x: x + rnd(-40, 60), y: Math.max(y - rnd(150, 200), prev.y - 230), w: 240, bx: 0, by: 0, drift: 0, alt: true });
      const a = clouds[clouds.length - 1]; a.bx = a.x; a.by = a.y;
    }
    // things to collect above the clouds
    const r = Math.random();
    if (r < .55) for (let k = 0; k < 3; k++) items.push({ kind: 'coin', x: x - gap / 2 + (k - 1) * 55 - 75, y: y - 230 - Math.sin((k + 1) / 4 * Math.PI) * 60 });
    else if (r < .7) items.push({ kind: 'egg', x: x, y: y - 160 });
    if (i % 6 === 3) items.push({ kind: 'bean', x: x + 20, y: y - 150 });
    if (i % 7 === 5) items.push({ kind: 'feather', x: x - 10, y: y - 150 });
  }
  const last = clouds[clouds.length - 1];
  castle = { x: last.x + 560, y: last.y - 60, w: 620 };
  clouds.push({ type: 'castle', x: castle.x, y: castle.y, w: 560, bx: castle.x, by: castle.y, drift: 0 });
  lowestY = Math.max(...clouds.map(c => c.y));
}

/* cloud picture: where the standing surface is (fraction from the top of the picture) and the drawn size */
const CLOUD = { normal: ['cloud-normal', .2], rain: ['cloud-rain', .13], thunder: ['cloud-thunder', .2], thorns: ['cloud-thorns', .3], bouncy: ['cloud-bouncy', .2] };
function cloudDraw(c) {
  if (c.type === 'castle') return;
  const [n, top] = CLOUD[c.type], im = IMG[n], w = c.w * 1.18, h = w * im.height / im.width;
  return { im, x: c.x - w / 2, y: c.y - h * top, w, h };
}

function startClouds() {
  phase = 'clouds';
  const c0 = clouds[0];
  hero = { x: c0.x, y: c0.y, vx: 0, vy: 0, on: c0, dir: 1, squash: 0, land: 0, rot: 0, dbl: false, rainT: 0 };
  cam.x = hero.x - ZW * .22; cam.y = hero.y - ZH * .6;
  nextFoe = 3;
  say('Hold to power up your jump, then let go! Hold on the left side to jump backwards.');
}

/* ---------------- input ---------------- */
const stage = $('#stage');
let holding = false, holdDir = 1;
function toVirtual(e) { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH]; }
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button,.card,.sheet')) return;
  audio();
  const [vx] = toVirtual(e);
  if (phase === 'climb') { climb.target = vx < VW / 2 ? -1 : 1; tn(500, .06, 'triangle', .04); return; }
  if (phase !== 'clouds') return;
  if (hero.on) { holding = true; holdDir = vx < VW / 2 ? -1 : 1; hero.dir = holdDir; charge = { t: 0 }; }
  else if (feather > 0 && !hero.dbl) { doubleJump(vx < VW / 2 ? -1 : 1); }
});
const release = () => { if (holding && phase === 'clouds' && hero.on && charge) jump(chargeLevel()); holding = false; charge = null; };
stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', () => { holding = false; charge = null; });
const keys = {};
addEventListener('keydown', e => {
  if (keys[e.code]) return; keys[e.code] = 1;
  if (phase === 'climb' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) climb.target = -1;
  if (phase === 'climb' && (e.code === 'ArrowRight' || e.code === 'KeyD')) climb.target = 1;
  if (phase === 'clouds' && hero) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { holdDir = -1; hero.dir = -1; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { holdDir = 1; hero.dir = 1; }
    if (e.code === 'Space') { audio(); if (hero.on) { holding = true; holdDir = hero.dir; charge = { t: 0 }; } else if (feather > 0 && !hero.dbl) doubleJump(hero.dir); }
  }
});
addEventListener('keyup', e => { keys[e.code] = 0; if (e.code === 'Space') release(); });

// power swings 0 → 1 → 0 over 1.4 seconds, so timing matters
const chargeLevel = () => { const p = (charge.t / .7) % 2; return p < 1 ? p : 2 - p; };
function launchV(level, dir) { const v = VMIN + (VMAX - VMIN) * level; return [Math.cos(ANG) * v * dir, -Math.sin(ANG) * v]; }

function jump(level) {
  const [vx, vy] = launchV(level, holdDir);
  hero.from = hero.on; hero.vx = vx; hero.vy = vy; hero.on = null; hero.squash = -1; hero.dbl = false;
  for (let i = 0; i < 6; i++) parts.push({ x: hero.x + rnd(-30, 30), y: hero.y, vx: rnd(-80, 80), vy: rnd(-90, -20), life: .5, r: rnd(10, 18), c: '#ffffff' });
  sJump();
}
function doubleJump(dir) {
  feather--; hero.dbl = true; hero.dir = dir; hero.vx = Math.cos(ANG) * 700 * dir; hero.vy = -Math.sin(ANG) * 950; hud();
  for (let i = 0; i < 10; i++) parts.push({ x: hero.x, y: hero.y - 60, vx: rnd(-160, 160), vy: rnd(-160, 160), life: .6, r: rnd(6, 12), c: '#bfe8ff' });
  tn(880, .2, 'triangle', .07, 0, 1760);
}

/* ---------------- damage ---------------- */
function hurt(msg) {
  if (inv > 0) return false;
  hearts--; inv = 1.6; hurtT = .7; sHurt(); hud(); flashScreen('#ff5a5a');
  if (navigator.vibrate) navigator.vibrate(100);
  if (msg) say(msg);
  if (hearts <= 0) { lose('Out of hearts! This level starts again from the beanstalk.'); }
  return true;
}
// falling costs one heart; you start again from the first cloud
function fell() {
  sFall(); inv = 0;
  if (hearts <= 1) { hearts = 0; hud(); sHurt(); lose('Out of hearts! This level starts again from the beanstalk.'); return; }
  hurt();
  const H = hero;
  // back to the first cloud; melted rain clouds come back so the path is open again
  clouds.forEach(o => { if (o.type === 'rain') { o.gone = false; o.fading = false; o.fade = 0; } });
  const c = clouds[0];
  H.x = c.x; H.y = c.y; H.vx = 0; H.vy = 0; H.on = c; H.dbl = false; H.from = c;
  cam.x = H.x - ZW * .22; cam.y = H.y - ZH * .6;
  say(hearts === 1 ? 'Whoops! Back to the first cloud. Last heart left, be careful!' : 'Whoops! You fell. Back to the first cloud.');
}
function lose(why) {
  if (phase === 'lost') return;
  phase = 'lost'; holding = false; charge = null;
  $('#loseWhy').textContent = why; setTimeout(() => showCard('loseCard'), 900);
}
function win() {
  phase = 'won'; hero.vx = 0; hero.vy = 0; sWin();
  const stars = hearts >= 3 ? 3 : hearts === 2 ? 2 : 1;
  save.stars[LI] = Math.max(save.stars[LI] || 0, stars); save.coins += score; persist();
  $('#winStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('#winScore').textContent = `🪙 ${score}  ·  🥚 ${eggs}`;
  $('#winMsg').textContent = stars === 3 ? 'Not a single scratch. Amazing!' : `Finish with all 3 hearts for ⭐⭐⭐`;
  $('#winNext').style.display = LI < LEVELS.length - 1 ? '' : 'none';
  for (let i = 0; i < 40; i++) parts.push({ x: hero.x + rnd(-200, 200), y: hero.y - rnd(100, 400), vx: rnd(-200, 200), vy: rnd(-400, -100), life: 1.6, r: rnd(6, 12), c: ['#ffd23f', '#ff6b9a', '#6bd3ff', '#9bff6b'][i % 4], g: 1 });
  setTimeout(() => showCard('winCard'), 1500);
}
function flashScreen(c) { const f = $('#flash'); f.style.background = c; f.animate([{ opacity: .45 }, { opacity: 0 }], { duration: 350 }); }

/* ---------------- climb phase ---------------- */
function stepClimb(dt) {
  const C = climb;
  C.y += C.speed * dt;
  // move to the chosen side of the stalk
  if (C.side !== C.target) { C.swing += dt * 5; if (C.swing >= 1) { C.side = C.target; C.swing = 0; } }
  C.next -= dt;
  if (C.next <= 0 && C.y < C.len - 500) {
    const r = Math.random(), side = Math.random() < .5 ? -1 : 1, y = C.y + VH * .9;
    if (r < .45) C.hazards.push({ kind: 'caterpillar', side, y });
    else if (r < .8) C.hazards.push({ kind: 'bee', side, y: y - 200, x: side < 0 ? -120 : VW + 120, vx: side < 0 ? 150 : -150 });
    else C.hazards.push({ kind: 'coin', side, y });
    if (Math.random() < .25) C.hazards.push({ kind: 'coin', side: -side, y: y + 120 });
    C.next = rnd(1, 2.2) / (L.climbBugs + .4);
  }
  const heroY = C.y + VH * .3, sideX = s => VW / 2 + s * 105;
  const hx = C.side !== C.target ? sideX(C.side) + (sideX(C.target) - sideX(C.side)) * C.swing : sideX(C.side);
  C.hazards.forEach(h => {
    if (h.kind === 'bee') h.x += h.vx * dt;
    const hy = h.y, x = h.kind === 'bee' ? h.x : sideX(h.side) + h.side * 35;
    h.sx = x;
    if (!h.done && Math.abs(hy - heroY) < 80 && Math.abs(x - hx) < 75) {
      h.done = true;
      if (h.kind === 'coin') { score += 10; sCoin(); pop('+10', x, VH - (hy - C.y)); hud(); }
      else hurt(h.kind === 'bee' ? 'Ouch, a bee sting!' : 'The caterpillar bit you!');
    }
  });
  C.hazards = C.hazards.filter(h => h.y > C.y - 200 && !(h.done && h.kind === 'coin') && !(h.kind === 'bee' && (h.x < -200 || h.x > VW + 200)));
  C.hx = hx;
  $('#prog').style.width = clamp(C.y / C.len, 0, 1) * 50 + '%';
  if (C.y >= C.len && phase === 'climb') { phase = 'toClouds'; showCard(null); setTimeout(() => { startClouds(); }, 900); fadeOut(); }
}
function fadeOut() { $('#fade').animate([{ opacity: 0 }, { opacity: 1, offset: .5 }, { opacity: 0 }], { duration: 1800 }); }

function drawClimb() {
  const C = climb;
  // background: village at the start, sky as you climb
  const k = clamp(C.y / (C.len * .4), 0, 1);
  cx.drawImage(IMG['bg-sky'], 0, 0, VW, VH);
  cx.globalAlpha = 1 - k * k; const vOff = Math.min(C.y * .12, 140); cx.drawImage(IMG['bg-village'], -vOff * .3, vOff * .5, VW + vOff * .6, VH + vOff * .6); cx.globalAlpha = 1;
  // beanstalk tiles scrolling down
  const st = IMG.stalk, sw = 300, sh = sw * st.height / st.width, off = (C.y % sh);
  for (let y = -sh + off; y < VH + sh; y += sh) cx.drawImage(st, VW / 2 - sw / 2, y, sw, sh);
  // hazards
  C.hazards.forEach(h => {
    const y = VH - (h.y - C.y);
    if (h.kind === 'caterpillar') { const im = IMG.caterpillar, w = 150, hh = w * im.height / im.width; cx.save(); cx.translate(h.sx, y); if (h.side > 0) cx.scale(-1, 1); cx.drawImage(im, -w / 2, -hh / 2, w, hh); cx.restore(); }
    if (h.kind === 'bee') { const im = IMG[Math.floor(t * 14) % 2 ? 'bee1' : 'bee2'], w = 110, hh = w * im.height / im.width; cx.save(); cx.translate(h.sx, y + Math.sin(t * 6 + h.y) * 14); if (h.vx > 0) cx.scale(-1, 1); cx.drawImage(im, -w / 2, -hh / 2, w, hh); cx.restore(); }
    if (h.kind === 'coin') drawItem({ kind: 'coin' }, h.sx, y);
  });
  // hero hugging the stalk
  const im = IMG[hurtT > 0 ? 'hero-hurt' : 'hero-climb'], h = HERO_H * 1.05, w = h * im.height && h * im.width / im.height;
  const y = VH * .7, bob = Math.sin(t * 9) * 6;
  cx.save(); cx.translate(C.hx, y + bob); if (C.side > 0 && hurtT <= 0) cx.scale(-1, 1);
  if (inv > 0 && Math.floor(t * 12) % 2) cx.globalAlpha = .45;
  cx.rotate(Math.sin(t * 9) * .04); cx.drawImage(im, -w / 2 + 20, -h / 2, w, h); cx.restore();
}

/* ---------------- cloud phase ---------------- */
function stepClouds(dt) {
  // clouds drift and dissolve
  clouds.forEach(c => {
    const px = c.x, py = c.y;
    if (c.drift === 'x') c.x = c.bx + Math.sin(t * .9 + c.ph) * c.amp;
    if (c.drift === 'y') c.y = c.by + Math.sin(t * .9 + c.ph) * c.amp * .7;
    c.dx = c.x - px; c.dy = c.y - py;
    if (c.fading) { c.fade -= dt; if (c.fade <= 0) c.gone = true; }
  });
  if (charge) charge.t += dt;
  const H = hero;
  if (H.on) {
    if (H.on.gone) { H.on = null; H.vy = 0; say('The rain cloud melted away!'); }
    else { H.x += H.on.dx || 0; H.y = H.on.y; if (H.on.type === 'rain' && !H.on.fading) { H.on.fading = true; H.on.fade = 1.6; } }
  }
  if (!H.on) {
    const oy = H.y;
    H.vy += G * dt; H.x += H.vx * dt; H.y += H.vy * dt;
    // landing: feet cross a cloud top while falling
    if (H.vy > 0) for (const c of clouds) {
      if (c.gone) continue;
      const half = c.type === 'castle' ? c.w * .32 : c.w * .42;
      if (Math.abs(H.x - c.x) < half && oy <= c.y + 4 && H.y >= c.y) { landOn(c); break; }
    }
  }
  if (H.squash < 0) H.squash = Math.min(0, H.squash + dt * 4); if (H.land > 0) H.land -= dt;
  // falling off the bottom = game over
  if (!H.on && H.y > lowestY + 700 && phase === 'clouds') fell();
  // things to collect
  items.forEach(it => {
    if (it.got) return;
    if (Math.hypot(it.x - H.x, it.y - (H.y - 90)) < 80) {
      it.got = true;
      if (it.kind === 'coin') { score += 10; sCoin(); pop('+10', (it.x - cam.x) * Z, (it.y - cam.y) * Z); }
      if (it.kind === 'egg') { score += 50; eggs++; sEgg(); pop('+50 🥚', (it.x - cam.x) * Z, (it.y - cam.y) * Z); }
      if (it.kind === 'bean') { hearts = Math.min(5, hearts + 1); maxHearts = Math.max(maxHearts, hearts); sEgg(); pop('+1 ❤️', (it.x - cam.x) * Z, (it.y - cam.y) * Z); }
      if (it.kind === 'feather') { feather++; sEgg(); pop('🪶 Double jump!', (it.x - cam.x) * Z, (it.y - cam.y) * Z); say('Feather! While in the air, tap once more to jump again.'); }
      hud();
    }
  });
  // crows and bees flying across
  nextFoe -= dt * (L.enemies > 0 ? 1 : 0);
  if (nextFoe <= 0 && phase === 'clouds') {
    const fromR = Math.random() < .6, kind = Math.random() < .55 ? 'crow' : 'bee';
    foes.push({ kind, x: fromR ? cam.x + ZW + 120 : cam.x - 120, y: H.y - rnd(150, 420), vx: (fromR ? -1 : 1) * (kind === 'crow' ? rnd(200, 280) : rnd(130, 180)), ph: rnd(0, 6) });
    nextFoe = rnd(.6, 1.2) / L.enemies * .25 + 1.2;
  }
  foes.forEach(f => {
    f.x += f.vx * dt; f.yy = f.y + Math.sin(t * 3 + f.ph) * (f.kind === 'bee' ? 40 : 20);
    if (!f.hit && Math.hypot(f.x - H.x, f.yy - (H.y - 90)) < 85) { f.hit = true; if (hurt(f.kind === 'crow' ? 'A crow knocked into you!' : 'Bee sting!')) { H.squash = -1; } }
  });
  foes = foes.filter(f => f.x > cam.x - 400 && f.x < cam.x + ZW + 400);
  // camera follows
  const tx = H.x - ZW * (H.dir > 0 ? .22 : .78), ty = H.y - ZH * .6;
  cam.x += (tx - cam.x) * Math.min(1, dt * 2.4); cam.y += (ty - cam.y) * Math.min(1, dt * (H.on ? 2.4 : 1.2));
  // storm lightning
  if (L.storm) { nextBolt -= dt; if (nextBolt <= 0) { flash = 1; tn(60, 1.2, 'sawtooth', .06); nextBolt = rnd(5, 9); } }
  flash = Math.max(0, flash - dt * 2.5);
  const done = clamp((H.x - clouds[0].x) / (castle.x - clouds[0].x), 0, 1);
  $('#prog').style.width = 50 + done * 50 + '%';
}

function hopTo(o, vy) {
  const H = hero; H.vy = -vy;
  if (!o || o.gone) return;
  const up = H.y - o.y, disc = vy * vy - 2 * G * up;
  if (disc > 0) H.vx = (o.x - H.x) / ((vy + Math.sqrt(disc)) / G);
}
function landOn(c) {
  const H = hero;
  H.y = c.y; H.vx = 0; H.vy = 0; H.squash = 1; H.land = .25;
  for (let i = 0; i < 8; i++) parts.push({ x: H.x + rnd(-50, 50), y: H.y, vx: rnd(-120, 120), vy: rnd(-80, -10), life: .55, r: rnd(10, 20), c: c.type === 'bouncy' ? '#ffc6dc' : '#ffffff' });
  if (c.type === 'castle') { H.on = c; win(); return; }
  if (c.type === 'thorns') { hurt('Ouch! Thorns! You can\'t land there.'); hopTo(H.from, 950); return; }
  if (c.type === 'thunder') { sZap(); flashScreen('#fff6a0'); hurt('Zap! Thunder clouds bite!'); hopTo(H.from, 950); return; }
  if (c.type === 'bouncy') {
    // a big boing that carries you onto the next safe cloud
    sBoing(); H.vx = H.dir * 420;
    const nx = clouds.filter(o => !o.gone && o !== c && (o.x - c.x) * H.dir > 120 && o.type !== 'thorns' && o.type !== 'thunder' && o.type !== 'bouncy')
      .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
    hopTo(nx, 1500);
    return;
  }
  H.on = c; if (c.type !== 'rain') H.safe = c; sLand();
}

function drawItem(it, x, y) {
  const im = IMG[it.kind === 'coin' ? 'coin' : it.kind], s = it.kind === 'coin' ? 56 : it.kind === 'egg' ? 70 : 78, bob = Math.sin(t * 3 + x * .01) * 6;
  cx.save(); cx.translate(x, y + bob);
  if (it.kind !== 'coin') { const g = cx.createRadialGradient(0, 0, 0, 0, 0, s); g.addColorStop(0, it.kind === 'feather' ? 'rgba(150,210,255,.55)' : it.kind === 'bean' ? 'rgba(160,255,120,.55)' : 'rgba(255,220,90,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, s, 0, 7); cx.fill(); }
  if (it.kind === 'coin') cx.scale(Math.cos(t * 4 + x * .02) * .5 + .6, 1);
  const w = s, h = s * im.height / im.width; cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore();
}

function drawClouds() {
  // background: sky (or storm), slight parallax
  const bg = IMG[L.storm ? 'bg-storm' : 'bg-sky'], par = (cam.y * .05) % 60;
  cx.drawImage(bg, 0, -30 + clamp(-cam.y * .04, -60, 60), VW, VH + 60);
  cx.save(); cx.scale(Z, Z); cx.translate(-cam.x, -cam.y);
  // castle
  if (castle) { const im = IMG.castle, w = castle.w, h = w * im.height / im.width; cx.drawImage(im, castle.x - w / 2, castle.y - h * .66, w, h); }
  // clouds
  clouds.forEach(c => {
    if (c.gone || c.type === 'castle') return; const d = cloudDraw(c);
    cx.save(); if (c.fading) { cx.globalAlpha = clamp(c.fade / 1.6, 0, 1); cx.translate(0, (1.6 - c.fade) * 30); }
    const sq = hero && hero.on === c && hero.land > 0 ? hero.land * .25 : 0;
    cx.translate(c.x, c.y); cx.scale(1 + sq * .3, 1 - sq * .4); cx.translate(-c.x, -c.y);
    cx.drawImage(d.im, d.x, d.y + Math.sin(t * 1.2 + c.x) * 3, d.w, d.h); cx.restore();
  });
  // items
  items.forEach(it => { if (!it.got) drawItem(it, it.x, it.y); });
  // landing arc preview while charging
  if (charge && hero.on) drawArc();
  // foes
  foes.forEach(f => {
    const im = IMG[f.kind + (Math.floor(t * (f.kind === 'bee' ? 16 : 7)) % 2 ? '1' : '2')], w = f.kind === 'crow' ? 150 : 105, h = w * im.height / im.width;
    cx.save(); cx.translate(f.x, f.yy); if (f.vx > 0) cx.scale(-1, 1); cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore();
  });
  drawHero();
  cx.restore();
  if (flash > 0) { cx.fillStyle = `rgba(230,220,255,${flash * .5})`; cx.fillRect(0, 0, VW, VH); }
}

function drawArc() {
  const lvl = chargeLevel(), [vx, vy] = launchV(lvl, holdDir), H = hero;
  let x = H.x, y = H.y - 40, px = vx, py = vy; const dt = 1 / 60, maxSteps = Math.round(120 * L.arc);
  // dotted path with a dark outline so it shows up even against the bright sun
  cx.fillStyle = '#ffffff'; cx.strokeStyle = '#1d3f6e'; cx.lineWidth = 3;
  let landed = null;
  for (let i = 0; i < maxSteps; i++) {
    py += G * dt; x += px * dt; y += py * dt;
    if (i % 4 === 0) { const a = 1 - i / maxSteps; cx.globalAlpha = .45 + .55 * a; cx.beginPath(); cx.arc(x, y + 40, 8 * (.6 + .4 * a), 0, 7); cx.fill(); cx.stroke(); }
    const hit = py > 0 && clouds.find(c => !c.gone && Math.abs(x - c.x) < (c.type === 'castle' ? c.w * .32 : c.w * .42) && y + 40 >= c.y && y + 40 - py * dt < c.y + 4);
    if (hit) { landed = { x, y: hit.y, bad: hit.type === 'thorns' || hit.type === 'thunder' }; break; }
  }
  cx.globalAlpha = 1;
  // landing marker: green if safe, red if it's a hazard cloud
  if (landed && L.arc >= .99) { cx.strokeStyle = landed.bad ? '#ff4a3a' : '#3fdc5a'; cx.lineWidth = 6; cx.beginPath(); cx.ellipse(landed.x, landed.y - 4, 34, 11, 0, 0, 7); cx.stroke(); }
  // power ring
  cx.strokeStyle = '#ffffff55'; cx.lineWidth = 10; cx.beginPath(); cx.arc(H.x, H.y - 95, 70, 0, 7); cx.stroke();
  cx.strokeStyle = lvl > .85 ? '#ff6b4a' : lvl > .5 ? '#ffd23f' : '#6bdc7a'; cx.beginPath(); cx.arc(H.x, H.y - 95, 70, -Math.PI / 2, -Math.PI / 2 + lvl * Math.PI * 2); cx.stroke();
}

function drawHero() {
  const H = hero; if (!H) return;
  let pose = 'hero-stand';
  if (phase === 'won') pose = 'hero-cheer';
  else if (hurtT > 0) pose = 'hero-hurt';
  else if (charge && H.on) pose = 'hero-crouch';
  else if (!H.on) pose = H.vy < 150 ? 'hero-jump' : 'hero-fall';
  const im = IMG[pose], h = HERO_H, w = h * im.width / im.height;
  // squash and stretch: crouch while charging, stretch on take-off, squish on landing
  let sx = 1, sy = 1;
  if (pose === 'hero-crouch') { const c = Math.min(1, charge.t * 3); sy = 1 - .12 * c; sx = 1 + .08 * c; }
  if (H.squash > 0 || H.land > 0) { const k = Math.max(0, H.land) * 4; sy = 1 - .18 * k; sx = 1 + .14 * k; }
  if (!H.on && pose === 'hero-jump') { sy = 1.06; sx = .96; }
  const idle = H.on && pose === 'hero-stand' ? Math.sin(t * 3) * .015 : 0;
  cx.save(); cx.translate(H.x, H.y);
  if (inv > 0 && Math.floor(t * 12) % 2) cx.globalAlpha = .45;
  if (H.dir < 0) cx.scale(-1, 1);
  if (!H.on && phase !== 'won') cx.rotate(clamp(H.vy / 4000, -.15, .25));
  cx.scale(sx, sy + idle);
  // soft shadow on the cloud
  if (H.on) { cx.fillStyle = 'rgba(60,80,120,.18)'; cx.beginPath(); cx.ellipse(0, -4, 48, 10, 0, 0, 7); cx.fill(); }
  cx.drawImage(im, -w / 2, -h + 6, w, h);
  cx.restore();
}

function drawParts(dt) {
  parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += 600 * dt; p.life -= dt; });
  parts = parts.filter(p => p.life > 0);
  const inWorld = hero && (phase === 'clouds' || phase === 'won' || phase === 'lost');
  if (inWorld) { cx.save(); cx.scale(Z, Z); cx.translate(-cam.x, -cam.y); }
  parts.forEach(p => { cx.globalAlpha = clamp(p.life * 2, 0, 1); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); });
  cx.globalAlpha = 1;
  if (inWorld) cx.restore();
}

/* ---------------- HUD & UI ---------------- */
function hud() {
  $('#hearts').innerHTML = Array.from({ length: maxHearts }, (_, i) => i < hearts ? '❤️' : '<span class="off">🖤</span>').join('');
  $('#score').textContent = score; $('#feath').style.display = feather > 0 ? '' : 'none'; $('#feathN').textContent = feather;
}
let sayT = 0;
function say(txt) { const s = $('#say'); s.textContent = txt; s.classList.add('on'); sayT = 4; }
function pop(txt, x, y) { const el = document.createElement('div'); el.className = 'pop'; el.textContent = txt; el.style.left = (x / VW * 100) + '%'; el.style.top = (y / VH * 100) + '%'; stage.appendChild(el); setTimeout(() => el.remove(), 1200); }
function showCard(id) { document.querySelectorAll('.card').forEach(c => c.style.display = c.id === id ? 'flex' : 'none'); }
function screen(s) { document.body.dataset.screen = s; }

function renderMap() {
  $('#mStars').textContent = totalStars(); $('#mCoins').textContent = save.coins; $('#mute').textContent = save.muted ? '🔇' : '🔊';
  $('#levels').innerHTML = LEVELS.map((l, i) => {
    const open = unlocked(i), st = save.stars[i] || 0;
    return `<button class="lvl ${open ? '' : 'locked'} ${open && !st ? 'next' : ''}" data-i="${i}"><span class="n">${open ? i + 1 : '🔒'}</span><span class="nm">${l.name}${l.storm ? ' ⛈️' : ''}</span><span class="st">${[1, 2, 3].map(k => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('')}</span></button>`;
  }).join('');
  document.querySelectorAll('.lvl').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (!unlocked(i)) return; audio(); screen('play'); startLevel(i); });
}

$('#playBtn').onclick = () => { audio(); screen('map'); renderMap(); };
$('#climbGo').onclick = () => { showCard(null); phase = 'climb'; say('Tap left or right to swap sides of the beanstalk. Dodge the bugs!'); };
document.querySelectorAll('.again').forEach(b => b.onclick = () => startLevel(LI));
document.querySelectorAll('.toMap').forEach(b => b.onclick = () => { phase = 'title'; showCard(null); screen('map'); renderMap(); });
$('#winNext').onclick = () => startLevel(LI + 1);
$('#mute').onclick = () => { save.muted = !save.muted; persist(); renderMap(); };
$('#pause').onclick = () => { if (phase === 'climb' || phase === 'clouds') { paused = !paused; showCard(paused ? 'pauseCard' : null); } };
$('#resume').onclick = () => { paused = false; showCard(null); };
let paused = false;

/* ---------------- loop ---------------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.04, (now - last) / 1000); last = now;
  if (document.body.dataset.screen === 'play' && L && !paused) {
    t += dt; inv = Math.max(0, inv - dt); hurtT = Math.max(0, hurtT - dt);
    if (sayT > 0) { sayT -= dt; if (sayT <= 0) $('#say').classList.remove('on'); }
    cx.setTransform(S, 0, 0, S, 0, 0);
    if (phase === 'climb' || phase === 'climbIntro' || phase === 'toClouds' || (phase === 'lost' && !hero)) { if (phase === 'climb') stepClimb(dt); drawClimb(); }
    else if (hero) { if (phase === 'clouds') stepClouds(dt); else if (phase === 'lost' && !hero.on) { hero.vy += G * dt; hero.y += hero.vy * dt; } drawClouds(); }
    drawParts(dt);
  }
  requestAnimationFrame(loop);
}
ready.then(() => { resize(); $('#loading').style.display = 'none'; screen('title'); requestAnimationFrame(loop); });
window.__bl = { solve: target => { const at = k => { const tt = t + k; return target.drift === 'x' ? [target.bx + Math.sin(tt * .9 + target.ph) * target.amp, target.y] : target.drift === 'y' ? [target.x, target.by + Math.sin(tt * .9 + target.ph) * target.amp * .7] : [target.x, target.y]; }; let best = null; for (let l = 0; l <= 1.0001; l += .01) { const [vx, vy] = launchV(l, target.x > hero.x ? 1 : -1); let x = hero.x, y = hero.y, px = vx, py = vy; for (let i = 0; i < 400; i++) { const dt = 1 / 120; py += G * dt; x += px * dt; const oy = y; y += py * dt; const [tx, ty] = at((i + 1) * dt); if (py > 0 && oy <= ty + 4 && y >= ty) { const d = Math.abs(x - tx); if (d < target.w * .3 && (!best || d < best.d)) best = { l, d }; break; } if (y > ty + 400) break; } } return best && best.l; }, heroObj: () => hero, cloudsArr: () => clouds, startLevel, state: () => ({ phase, hearts, score, hero: hero && { x: Math.round(hero.x), y: Math.round(hero.y), on: !!hero.on }, clouds: clouds.length }), skipClimb: () => { climb.y = climb.len; phase = 'climb'; showCard(null); }, jump: (lvl, dir = 1) => { holdDir = dir; hero.dir = dir; jump(lvl); }, charge: () => { holding = true; holdDir = 1; charge = { t: .35 }; }, next: () => clouds.find(c => c.x > hero.x + 50 && !c.gone && c.type !== 'thorns' && c.type !== 'thunder') };
})();
