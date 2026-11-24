// Sky Ladders: jump from rope ladder to rope ladder (hanging from hot-air balloons) up to the sky castle.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stage = $('#stage');

/* ---------------- pictures ---------------- */
const IMG = {};
const NAMES = ['hero-stand', 'hero-climb', 'hero-up', 'hero-jump', 'hero-fall', 'hero-hurt', 'hero-cheer',
  'bird1', 'bird2', 'eagle1', 'eagle2', 'gem', 'castle', 'bg-town', 'bg-high', 'ladder', 'balloon-red', 'balloon-blue', 'balloon-gold'];
let loaded = 0;
const ready = new Promise(res => NAMES.forEach(n => { const i = new Image(); i.onload = i.onerror = () => { if (++loaded === NAMES.length) res(); }; i.src = n + '.webp'; IMG[n] = i; }));

/* ---------------- save ---------------- */
const KEY = 'skyladders:v1';
let save = { stars: {}, coins: 0, muted: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { } };
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);

/* ---------------- levels ----------------
   height: how high the castle is; len: ladder lengths; speed: climbing speed;
   bird / eagle: seconds between small birds / eagles (0 = none); decoy: chance of a trap ladder */
const LEVELS = [
  { name: 'Harbour Morning', height: 4200, len: [700, 950], speed: 150, bird: 0, eagle: 0, decoy: .35 },
  { name: 'Breezy Climb', height: 5000, len: [640, 880], speed: 165, bird: 6.5, eagle: 0, decoy: .45 },
  { name: 'Bird Watch', height: 5600, len: [580, 800], speed: 180, bird: 4.8, eagle: 0, decoy: .5 },
  { name: 'Windy Heights', height: 6200, len: [530, 730], speed: 195, bird: 4.0, eagle: 0, decoy: .6 },
  { name: 'Eagle Eyes', height: 6800, len: [480, 670], speed: 212, bird: 3.6, eagle: 11, decoy: .65 },
  { name: 'Sunset Sky', height: 7400, len: [440, 610], speed: 230, bird: 3.1, eagle: 8.5, decoy: .7 },
  { name: 'Starlight', height: 8000, len: [400, 560], speed: 250, bird: 2.7, eagle: 7, decoy: .75 },
  { name: 'The Sky Castle', height: 8800, len: [360, 500], speed: 270, bird: 2.3, eagle: 6, decoy: .8 }
];
const TEST_MODE = /[?&]test\b/.test(location.search);   // add ?test to the address to open every level for testing
const unlocked = i => TEST_MODE || i === 0 || (save.stars[i - 1] || 0) > 0;

/* ---------------- canvas (virtual 720 x 1280 portrait stage) ---------------- */
const VW = 720, VH = 1280;
const cv = $('#cv'), cx = cv.getContext('2d');
let S = 1, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(stage.clientWidth * DPR); cv.height = Math.round(stage.clientHeight * DPR); S = cv.width / VW;
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
const sJump = () => tn(330, .18, 'triangle', .08, 0, 700);
const sGrab = () => { tn(180, .08, 'square', .05); tn(260, .1, 'triangle', .05, .03); };
const sCoin = () => { tn(988, .07, 'square', .045); tn(1319, .16, 'square', .045, .06); };
const sGold = () => [784, 988, 1175, 1568].forEach((f, i) => tn(f, .22, 'triangle', .06, i * .07));
const sHurt = () => { tn(220, .25, 'sawtooth', .1, 0, 110); tn(160, .3, 'square', .05, .05, 80); };
const sFall = () => tn(700, 1.1, 'triangle', .08, 0, 90);
const sWarn = () => { tn(880, .08, 'square', .04); tn(880, .08, 'square', .04, .14); };
const sEagle = () => { tn(1400, .5, 'sawtooth', .05, 0, 500); };
const sWin = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tn(f, .3, 'triangle', .08, i * .12));
const sNo = () => tn(160, .12, 'square', .05);

/* ---------------- game state ---------------- */
const COLS = [150, 360, 570];          // left, front (middle), right lanes
const HERO_H = 170;                    // hero height; hero.y is where his feet are
const REACH = 55;                      // he jumps straight across: he only catches a ladder that is right beside him
const BALLOON = 330;                   // space a balloon takes above its ladder
let L = null, LI = 0, phase = 'title', t = 0, paused = false;
let hearts = 3, score = 0, inv = 0, hurtT = 0;
let ladders = [], coins = [], birds = [], warns = [], parts = [], deco = [];
let hero = null, cam = { y: 0 }, finalL = null, nextBird = 0, nextEagle = 0, flashT = 0;

/* build a level: a guaranteed chain of ladders (each one reachable from the one before) plus trap ladders */
function buildLevel() {
  ladders = []; coins = []; birds = []; warns = []; parts = []; deco = [];
  const free = (col, top, bottom) => !ladders.some(o => o.col === col && top - BALLOON < o.bottom + 60 && bottom + 60 > o.top - BALLOON);
  const lenR = () => rnd(...L.len);
  let col = Math.random() < .5 ? 0 : 2, len = lenR();
  let cur = { col, bottom: -15, top: -15 - len, main: true };
  ladders.push(cur);
  while (cur.top > -L.height) {
    // the next ladder on the path starts somewhere along the upper part of this one
    const span = cur.bottom - cur.top - HERO_H;
    const win = clamp(rnd(.3, .6) * span, L.speed * .9, span);   // how long you have to make the jump
    let nb = cur.top + HERO_H + win;
    len = Math.max(lenR(), win + HERO_H + 160);
    const options = [cur.col - 1, cur.col + 1].filter(c => c >= 0 && c <= 2).sort(() => Math.random() - .5);
    let nc = options.find(c => free(c, nb - len, nb));
    if (nc === undefined) { nc = options[0]; }
    const nx = { col: nc, bottom: nb, top: nb - len, main: true, gold: Math.random() < .12 };
    // trap ladder in the third lane: shorter, ends early
    const third = [0, 1, 2].find(c => c !== cur.col && c !== nc);
    if (Math.random() < L.decoy) {
      const db = cur.top + HERO_H + rnd(.05, .6) * span, dl = len * rnd(.35, .6);
      if (free(third, db - dl, db)) ladders.push({ col: third, bottom: db, top: db - dl, main: false });
    }
    ladders.push(nx);
    // coins along the path ladder
    for (let y = nx.bottom - 120; y > nx.top + HERO_H; y -= 210) coins.push({ x: COLS[nx.col], y: y - 90, got: false });
    cur = nx;
  }
  cur.final = true; finalL = cur;
  ladders.forEach(o => { o.len = o.bottom - o.top; o.ph = rnd(0, 6); o.color = o.gold ? 'gold' : o.len < (L.len[0] + L.len[1]) / 2 ? 'red' : 'blue'; });
  // drifting background clouds for a sense of height
  for (let y = -1200; y > -L.height - 1500; y -= rnd(260, 480)) deco.push({ x: rnd(-100, VW + 100), y, s: rnd(.5, 1.1), p: rnd(.3, .7) });
}

function startLevel(i) {
  LI = i; L = LEVELS[i]; hearts = 3; score = 0; inv = 0; hurtT = 0; flashT = 0;
  buildLevel();
  hero = { col: 1, x: COLS[1], y: 0, state: 'ground', lad: null, last: null, jump: null, vy: 0, dir: 1, slip: 0 };
  cam.y = -VH * .72;
  nextBird = L.bird ? rnd(3, 5) : 1e9; nextEagle = L.eagle ? rnd(6, 9) : 1e9;
  phase = 'intro'; paused = false; showCard('climbCard');
  $('#climbTitle').textContent = `${i + 1}. ${L.name}`;
  hud();
}

/* where a ladder is at a given height (they sway gently in the wind) */
const dropY = o => o.drop ? -900 * o.drop * o.drop : 0;
const ladX = (o, y) => COLS[o.col] + Math.sin(t * 1.3 + o.ph) * 10 * clamp((y - o.top) / 500, 0, 1.5);
function reachY(o) {
  const lo = Math.max(o.top + HERO_H, hero.y - REACH), hi = Math.min(o.bottom, hero.y + REACH);
  return lo <= hi ? clamp(hero.y, lo, hi) : null;
}
function targetIn(col) {
  if (hero.state !== 'climb' && hero.state !== 'ground') return null;
  let best = null;
  for (const o of ladders) { if (o.col !== col || o === hero.lad || o.drop > 0) continue; const y = reachY(o); if (y !== null && (!best || y < best.y)) best = { o, y }; }
  return best;
}

/* ---------------- input: tap a lane to jump to the ladder in it ---------------- */
function toVirtual(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH]; }
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button,.card')) return;
  audio();
  if (phase !== 'play' || paused) return;
  const [vx] = toVirtual(e);
  jumpDir(vx < VW / 2 ? -1 : 1);
});
addEventListener('keydown', e => {
  if (phase !== 'play') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') jumpDir(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') jumpDir(1);
});
function jumpDir(d) {
  if (hero.state !== 'climb' && hero.state !== 'ground') return;
  const col = hero.col + d;
  hero.dir = d;
  if (col < 0 || col > 2) { sNo(); return; }            // already at the edge
  const tg = targetIn(col);
  sJump();
  // with no ladder right beside him he still jumps, and misses
  hero.jump = { x0: hero.x, y0: hero.y, o: tg ? tg.o : null, col, y1: tg ? tg.y : hero.y, k: 0, dur: .3, fromCol: hero.col };
  hero.state = 'jump'; hero.lad = null;
}
const tapLane = col => jumpDir(col < hero.col ? -1 : 1);   // used by the test autopilot

/* ---------------- step ---------------- */
function step(dt) {
  const H = hero;
  if (H.state === 'climb') {
    H.y -= L.speed * dt; H.x = ladX(H.lad, H.y);
    if (H.lad.final && H.y <= H.lad.top + HERO_H) { win(); return; }
    if (H.y <= H.lad.top + HERO_H) {          // top of the ladder: he hangs on for a moment, then slips
      H.y = H.lad.top + HERO_H; H.slip += dt;
      if (H.slip > .55) startFall('Slipped off the top of the ladder!');
    }
  } else if (H.state === 'jump') {
    const j = H.jump; j.k = Math.min(1, j.k + dt / j.dur);
    const k = j.k, tx = j.o ? ladX(j.o, j.y1) : COLS[j.col];
    H.x = j.x0 + (tx - j.x0) * k; H.y = j.y0 + (j.y1 - j.y0) * k - Math.sin(k * Math.PI) * 22;
    if (k >= 1) {
      if (j.o) grab(j.o, j.y1);
      else if (!H.last) { H.state = 'ground'; H.col = 1; H.x = COLS[1]; H.y = 0; H.jump = null; say('Nothing to grab there! Jump when a ladder is right beside you.'); }
      else { H.col = j.col; startFall('Missed! There was no ladder to grab.'); }
    }
  } else if (H.state === 'fall') {
    H.vy += 2600 * dt; H.y += H.vy * dt; H.fallT += dt;
    if (H.fallT > 1.0) afterFall();
  } else if (H.state === 'won') {
    H.y += (H.wy - H.y) * Math.min(1, dt * 3);
  }

  // camera follows the hero, a little below the middle of the screen
  if (H.state !== 'fall') cam.y += (H.y - VH * .66 - cam.y) * Math.min(1, dt * 3.2);

  // coins
  for (const c of coins) if (!c.got && Math.abs(c.x - H.x) < 70 && Math.abs(c.y - (H.y - 90)) < 90) { c.got = true; score += 10; sCoin(); burst(c.x, c.y, '#ffd23f', 8); hud(); }

  // birds: a warning flashes at the top of a lane, then a bird dives down it
  if (H.state === 'climb' || H.state === 'jump') {
    nextBird -= dt; nextEagle -= dt;
    for (const o of ladders) if (o.drop) o.drop = Math.max(0, o.drop - dt / .8);
    if (nextBird <= 0) nextBird = spawnWarn(false) ? L.bird * rnd(.75, 1.25) : .25;
    if (nextEagle <= 0) nextEagle = spawnWarn(true) ? L.eagle * rnd(.8, 1.2) : .25;
  }
  for (const w of warns) { w.t -= dt; if (w.t <= 0) { birds.push({ col: w.col, x: COLS[w.col] + rnd(-20, 20), y: Math.max(cam.y - 120, hero.y - 800), big: w.big, vy: w.big ? 1150 : 1000, hit: false }); w.done = true; if (w.big) sEagle(); } }
  warns = warns.filter(w => !w.done);
  for (const b of birds) {
    b.y += b.vy * dt;
    if (!b.hit && H.state !== 'fall' && H.state !== 'won' && Math.abs(b.x - H.x) < (b.big ? 110 : 80) && Math.abs(b.y - (H.y - 95)) < (b.big ? 110 : 80)) {
      b.hit = true;
      if (b.big) { inv = 0; hearts = 0; hud(); sHurt(); flash('#ff5a5a'); startFall('A giant eagle knocked you off the ladder!', true); }
      else if (inv <= 0) { hurt('Ouch! A bird bumped into you!'); burst(H.x, H.y - 100, '#9ad0ff', 10); }
    }
  }
  birds = birds.filter(b => b.y < cam.y + VH + 300);
}
// a bird only comes when he can dodge it: there must be a ladder right beside him
// that he can jump onto for the whole time the warning is showing (and a bit more)
function canDodge(T) {
  if (hero.state !== 'climb') return false;
  // he must be able to dodge by jumping onto the next ladder of the path (so dodging never strands him)
  const yA = hero.y - L.speed * .2, yB = hero.y - L.speed * (T - .2);
  return [hero.col - 1, hero.col + 1].some(c => c >= 0 && c <= 2 && ladders.some(o => o.col === c && !o.drop && o.main && hero.lad && o.top < hero.lad.top &&
    o.bottom + REACH >= yB + 0 && o.top + HERO_H - REACH <= yA && Math.min(o.bottom + REACH, yA) - Math.max(o.top + HERO_H - REACH, yB) > L.speed * .45));
}
function spawnWarn(big) {
  const T = big ? 1.4 : 1.1;
  if (warns.length) return false;
  if (!canDodge(T)) return false;   // try again a moment later
  warns.push({ col: hero.col, t: T, big, t0: T }); sWarn();
  return true;
}
function grab(o, y) {
  const H = hero; H.state = 'climb'; H.lad = o; H.last = o; H.col = o.col; H.y = y; H.slip = 0; H.jump = null;
  sGrab(); burst(H.x, H.y - 130, '#fff3c4', 6);
  if (o.gold && !o.paid) { o.paid = true; score += 50; sGold(); popAt('+50 ✨', H.x, H.y - 200); hud(); }
}
function startFall(msg, gameOver) {
  const H = hero; H.state = 'fall'; H.vy = -350; H.fallT = 0; H.lad = null; H.over = !!gameOver; H.msg = msg;
  sFall(); say(msg);
}
function afterFall() {
  const H = hero;
  if (H.over || hearts <= 1) { hearts = 0; hud(); lose(H.over ? H.msg : 'Out of hearts! This level starts again.'); H.state = 'gone'; return; }
  hearts--; hud(); sHurt(); flash('#ff5a5a'); inv = 1.5;
  // back onto the last ladder he held, at its bottom (or back on the ground)
  const o = H.last;
  if (o) { H.state = 'climb'; H.lad = o; H.col = o.col; H.y = o.bottom; H.x = ladX(o, H.y); H.slip = 0; }
  else { H.state = 'ground'; H.col = 1; H.x = COLS[1]; H.y = 0; }
  birds = []; warns = [];
  cam.y = H.y - VH * .66;
  say(hearts === 1 ? 'Last heart! Jump before the ladder ends.' : 'You fell! Back on your last ladder.');
}
function hurt(msg) {
  if (inv > 0) return;
  hearts--; inv = 1.4; hurtT = .6; sHurt(); flash('#ff5a5a'); hud(); say(msg);
  if (navigator.vibrate) navigator.vibrate(100);
  if (hearts <= 0) startFall('Out of hearts! This level starts again.', true);
}
function lose(why) {
  if (phase === 'lost') return;
  phase = 'lost'; $('#loseWhy').textContent = why; setTimeout(() => showCard('loseCard'), 700);
}
function win() {
  const H = hero; H.state = 'won'; H.wy = finalL.top - 40; phase = 'won'; sWin();
  const stars = hearts >= 3 ? 3 : hearts === 2 ? 2 : 1;
  save.stars[LI] = Math.max(save.stars[LI] || 0, stars); save.coins += score; persist();
  for (let i = 0; i < 40; i++) parts.push({ x: H.x + rnd(-200, 200), y: H.y - rnd(100, 400), vx: rnd(-200, 200), vy: rnd(-400, -100), life: 1.6, r: rnd(6, 12), c: ['#ffd23f', '#ff6b9a', '#6bd3ff', '#9bff6b'][i % 4], g: 1 });
  $('#winStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('#winScore').textContent = `💎 ${score}`;
  $('#winMsg').textContent = stars === 3 ? 'Not a single scratch. Amazing!' : 'Finish with all 3 hearts for ⭐⭐⭐';
  $('#winNext').style.display = LI < LEVELS.length - 1 ? '' : 'none';
  setTimeout(() => showCard('winCard'), 1400);
}
function burst(x, y, c, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-160, 160), vy: rnd(-200, 40), life: .6, r: rnd(5, 11), c }); }
function flash(c) { const f = $('#flash'); f.style.background = c; f.animate([{ opacity: .45 }, { opacity: 0 }], { duration: 350 }); }

/* ---------------- drawing ---------------- */
// the starting town picture, with its sky softly faded out so it blends into the sky behind it
let townC = null;
function townPic() {
  if (townC) return townC;
  townC = document.createElement('canvas'); townC.width = VW; townC.height = VH;
  const c = townC.getContext('2d'); c.drawImage(IMG['bg-town'], 0, 0, VW, VH);
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, VH * .55); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  return townC;
}
let puffC = null;
function puff() {   // a soft cloud drawn once and reused
  if (puffC) return puffC;
  puffC = document.createElement('canvas'); puffC.width = 420; puffC.height = 200; const c = puffC.getContext('2d');
  for (const [x, y, r] of [[110, 130, 70], [190, 95, 90], [280, 110, 80], [340, 140, 55], [70, 150, 45], [220, 150, 70]]) {
    const g = c.createRadialGradient(x, y - r * .3, r * .1, x, y, r); g.addColorStop(0, 'rgba(255,250,245,1)'); g.addColorStop(.7, 'rgba(255,225,235,.9)'); g.addColorStop(1, 'rgba(255,215,230,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  return puffC;
}
function drawBg() {
  const alt = -cam.y - VH * .34;                    // roughly how high the hero is
  const k = clamp(alt / 1800, 0, 1);
  // high sky (gets darker near the top of the level)
  cx.drawImage(IMG['bg-high'], 0, clamp(-60 + alt * .01, -60, 0), VW, VH + 60);
  const dark = clamp((alt - L.height * .55) / (L.height * .5), 0, .55) * (LI >= 5 ? 1 : .5);
  if (dark > 0) { cx.fillStyle = `rgba(40,20,90,${dark})`; cx.fillRect(0, 0, VW, VH); }
  // the town on the ground slides away as you climb
  if (k < 1) { cx.globalAlpha = 1 - k * k; cx.drawImage(townPic(), 0, Math.min(Math.max(0, alt - 410) * .45, 700) - 110, VW, VH); cx.globalAlpha = 1; }
  // passing clouds
  for (const d of deco) {
    const y = (d.y - cam.y) * d.p + VH * (1 - d.p) * .5;
    if (y < -300 || y > VH + 200) continue;
    cx.globalAlpha = .35 + d.p * .4; cx.drawImage(puff(), d.x - 210 * d.s, y, 420 * d.s, 200 * d.s); cx.globalAlpha = 1;
  }
}
function balloon(x, y, color) {
  const im = IMG['balloon-' + color], w = 190, h = w * im.height / im.width;
  cx.drawImage(im, x - w / 2, y - h + 14 + Math.sin(t * 1.6 + x) * 4, w, h);
  if (color === 'gold') for (let i = 0; i < 4; i++) { const a = t * 2.4 + i * 1.6, al = .5 + .5 * Math.sin(a); cx.fillStyle = `rgba(255,255,220,${al})`; cx.beginPath(); cx.arc(x + Math.cos(i * 2.3) * 60, y - h * .7 + Math.sin(i * 1.7) * 60, 4 + 3 * al, 0, 7); cx.fill(); }
}
let ladTile = null;
function ladderTile() {   // the ladder picture cut to exactly 3 rungs so it repeats seamlessly
  if (ladTile) return ladTile;
  const im = IMG.ladder, W = 104, sc = W / im.width, sh = Math.round(im.height / 2);
  ladTile = document.createElement('canvas'); ladTile.width = W; ladTile.height = Math.round(sh * sc);
  ladTile.getContext('2d').drawImage(im, 0, Math.round(im.height * .25), im.width, sh, 0, 0, W, ladTile.height);
  return ladTile;
}
function drawLadder(o) {
  const top = o.top - cam.y + dropY(o), bot = o.bottom - cam.y + dropY(o);
  if (bot < -400 || top > VH + 400) return;
  const tile = ladderTile(), th = tile.height, front = o.col === 1, sc = front ? 1.08 : 1;
  const glow = o === hero.lad || (hero.state === 'jump' && hero.jump.o === o);
  cx.save();
  if (glow) { cx.shadowColor = '#fff6b0'; cx.shadowBlur = 22; }
  for (let y = top; y < bot; y += th) {
    const hgt = Math.min(th, bot - y), x = ladX(o, y + hgt / 2 + cam.y), w = tile.width * sc;
    if (y + hgt < -50 || y > VH + 50) continue;
    cx.drawImage(tile, 0, 0, tile.width, hgt, x - w / 2, y, w, hgt);
  }
  cx.restore();
}
function drawCastle() {
  const o = finalL, x = ladX(o, o.top), y = o.top - cam.y;
  if (y > VH + 600) return;
  const im = IMG.castle, w = 560, h = w * im.height / im.width;
  cx.drawImage(im, clamp(x, 320, 400) - w / 2, y - h * .74, w, h);
}
function drawHero() {
  const H = hero; if (H.state === 'gone') return;
  const x = H.x, y = H.y - cam.y;
  let name = 'hero-stand', flip = false, h = 200, rot = 0, dy = 0;
  if (H.state === 'climb') { name = 'hero-up'; h = 215; flip = Math.floor(H.y / 44) % 2 === 0; dy = 18; if (H.slip > 0) rot = Math.sin(t * 40) * .06; }
  if (H.state === 'jump') { name = 'hero-jump'; h = 135; flip = H.dir < 0; }
  if (H.state === 'fall') { name = 'hero-fall'; h = 150; rot = Math.sin(H.fallT * 5) * .3; }
  if (H.state === 'won') { name = 'hero-cheer'; h = 210; }
  if (hurtT > 0 && H.state !== 'fall') { name = 'hero-hurt'; h = 205; }
  const im = IMG[name];
  if (inv > 0 && Math.floor(t * 12) % 2) cx.globalAlpha = .45;
  const w = h * im.width / im.height;
  cx.save(); cx.translate(x, y - h / 2 + dy); cx.rotate(rot); if (flip) cx.scale(-1, 1);
  cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore(); cx.globalAlpha = 1;
  if (H.slip > 0 && H.state === 'climb') { cx.font = '700 60px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 6; cx.strokeStyle = '#fff'; cx.strokeText('!', x + 80, y - 180); cx.fillStyle = '#ff4a3a'; cx.fillText('!', x + 80, y - 180); }
}
function drawTargets() {
  if (LI > 0) return;   // the helper arrows are only shown on the first level
  if (hero.state !== 'climb' && hero.state !== 'ground') return;
  for (const c of [hero.col - 1, hero.col + 1]) {
    if (c < 0 || c > 2) continue;
    const tg = targetIn(c); if (!tg) continue;
    const x = ladX(tg.o, tg.y), y = tg.y - cam.y - 110, p = 1 + Math.sin(t * 8) * .12;
    cx.save(); cx.translate(x, y); cx.scale(p, p);
    cx.fillStyle = 'rgba(80,230,110,.9)'; cx.strokeStyle = '#fff'; cx.lineWidth = 5;
    cx.beginPath(); cx.arc(0, 0, 34, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = '#fff'; cx.beginPath(); const d = c < hero.col ? -1 : c > hero.col ? 1 : 0;
    if (d) { cx.moveTo(14 * d, 0); cx.lineTo(-8 * d, -14); cx.lineTo(-8 * d, 14); } else { cx.moveTo(0, -15); cx.lineTo(-14, 9); cx.lineTo(14, 9); }
    cx.fill(); cx.restore();
  }
}
function drawBirds() {
  for (const w of warns) {
    const x = COLS[w.col], on = Math.floor(t * 8) % 2;
    cx.save(); cx.globalAlpha = on ? 1 : .5;
    cx.fillStyle = w.big ? '#ff3b2a' : '#ffb21a'; cx.beginPath(); cx.moveTo(x, 150); cx.lineTo(x - 40, 80); cx.lineTo(x + 40, 80); cx.closePath(); cx.fill();
    cx.font = '700 46px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.fillText('!', x, 128);
    cx.font = '52px sans-serif'; cx.fillText(w.big ? '🦅' : '🐦', x, 220);
    cx.restore();
  }
  for (const b of birds) {
    const up = Math.floor(t * (b.big ? 7 : 11)) % 2, im = IMG[(b.big ? 'eagle' : 'bird') + (up ? 1 : 2)], w = b.big ? 300 : 135, h = w * im.height / im.width;
    cx.save(); cx.translate(b.x, b.y - cam.y); cx.rotate(-1.25);   // diving head-first
    cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore();
  }
}
function drawCoins() {
  for (const c of coins) {
    if (c.got) continue; const y = c.y - cam.y; if (y < -80 || y > VH + 80) continue;
    const im = IMG.gem, s = 58; cx.save(); cx.translate(c.x, y + Math.sin(t * 3 + c.y) * 5); cx.scale(1 + Math.sin(t * 5 + c.y) * .06, 1 + Math.sin(t * 5 + c.y) * .06);
    cx.drawImage(im, -s / 2, -s / 2, s, s * im.height / im.width); cx.restore();
  }
}
function drawParts(dt) {
  parts = parts.filter(p => (p.life -= dt) > 0);
  for (const p of parts) { p.vy += (p.g ? 500 : 300) * dt; p.x += p.vx * dt; p.y += p.vy * dt; cx.globalAlpha = Math.min(1, p.life * 2); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y - cam.y, p.r, 0, 7); cx.fill(); }
  cx.globalAlpha = 1;
}
function draw() {
  drawBg();
  drawCastle();
  // balloons first (behind everything), then the ladders
  for (const o of ladders) { const y = o.top - cam.y + dropY(o); if (!o.final && y > -150 && y < VH + 400) balloon(ladX(o, o.top), y, o.color); }
  ladders.filter(o => o.col !== 1).forEach(drawLadder);
  ladders.filter(o => o.col === 1).forEach(drawLadder);   // front ladders are drawn on top
  drawCoins(); drawTargets(); drawHero(); drawBirds();
}

/* ---------------- HUD / screens ---------------- */
function hud() {
  $('#hearts').innerHTML = [0, 1, 2].map(i => `<span class="${i < hearts ? '' : 'off'}">❤️</span>`).join('');
  $('#score').textContent = score;
}
function hudLive() {
  if (!hero || !L) return;
  const h = clamp(-hero.y, 0, L.height);
  $('#feathN').textContent = Math.round(h / 10);
  $('#prog').style.width = (h / L.height * 100).toFixed(1) + '%';
}
let sayT = 0;
function say(txt) { const s = $('#say'); s.textContent = txt; s.classList.add('on'); sayT = 3.5; }
function popAt(txt, x, y) { const el = document.createElement('div'); el.className = 'pop'; el.textContent = txt; el.style.left = (x / VW * 100) + '%'; el.style.top = ((y - cam.y) / VH * 100) + '%'; stage.appendChild(el); setTimeout(() => el.remove(), 1200); }
function showCard(id) { document.querySelectorAll('.card').forEach(c => c.style.display = c.id === id ? 'flex' : 'none'); }
function screen(s) { document.body.dataset.screen = s; }
function renderMap() {
  $('#mStars').textContent = totalStars(); $('#mCoins').textContent = save.coins; $('#mute').textContent = save.muted ? '🔇' : '🔊';
  $('#levels').innerHTML = LEVELS.map((l, i) => {
    const open = unlocked(i), st = save.stars[i] || 0;
    const tag = l.eagle ? ' 🦅' : l.bird ? ' 🐦' : '';
    return `<button class="lvl ${open ? '' : 'locked'} ${open && !st ? 'next' : ''}" data-i="${i}"><span class="n">${open ? i + 1 : '🔒'}</span><span class="nm">${l.name}${tag}</span><span class="st">${[1, 2, 3].map(k => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('')}</span></button>`;
  }).join('');
  document.querySelectorAll('.lvl').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (!unlocked(i)) return; audio(); screen('play'); startLevel(i); });
}
$('#playBtn').onclick = () => { audio(); screen('map'); renderMap(); };
$('#climbGo').onclick = () => { showCard(null); phase = 'play'; say(LI === 0 ? 'Tap left or right to jump one ladder over. Jump when the green arrow shows!' : 'Tap left or right to jump one ladder over.'); };
document.querySelectorAll('.again').forEach(b => b.onclick = () => startLevel(LI));
document.querySelectorAll('.toMap').forEach(b => b.onclick = () => { phase = 'title'; showCard(null); screen('map'); renderMap(); });
$('#winNext').onclick = () => startLevel(LI + 1);
$('#mute').onclick = () => { save.muted = !save.muted; persist(); renderMap(); };
$('#pause').onclick = () => { if (phase === 'play') { paused = !paused; showCard(paused ? 'pauseCard' : null); } };
$('#resume').onclick = () => { paused = false; showCard(null); };

/* ---------------- loop ---------------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.04, (now - last) / 1000); last = now;
  if (document.body.dataset.screen === 'play' && L && hero && !paused) {
    t += dt; inv = Math.max(0, inv - dt); hurtT = Math.max(0, hurtT - dt);
    if (sayT > 0) { sayT -= dt; if (sayT <= 0) $('#say').classList.remove('on'); }
    if (phase === 'play' || phase === 'won' || (phase === 'lost' && hero.state === 'fall')) step(dt);
    cx.setTransform(S, 0, 0, S, 0, 0);
    draw(); drawParts(dt); hudLive();
  }
  requestAnimationFrame(loop);
}
ready.then(() => { resize(); $('#loading').style.display = 'none'; screen('title'); requestAnimationFrame(loop); });

// hooks used for automatic testing
window.__sl = { warnInfo: () => ({ col: warns.length ? warns[0].col : (birds.find(b => b.y < hero.y) || {}).col ?? null }), startLevel, go: () => $('#climbGo').click(), tap: tapLane, targetIn, state: () => ({ phase, hearts, score, st: hero && hero.state, col: hero && hero.col, y: hero && Math.round(hero.y), h: L && L.height }), hero: () => hero, ladders: () => ladders };
})();
