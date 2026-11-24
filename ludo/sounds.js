// Ludo sound sets, all made in code (no sound files). LudoSound.play(set, event)
// events: roll, step, out, capture, home, win
(function () {
  let AC = null, noiseBuf = null;
  const ac = () => {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); }
    if (AC.state === 'suspended') AC.resume();
    if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return AC;
  };
  function master(v = 1) { const g = AC.createGain(); g.gain.value = v; g.connect(AC.destination); return g; }
  // basic building blocks
  function tone(out, t, f, dur, { type = 'sine', vol = .2, attack = .004, slide = 0, curve = 'exp' } = {}) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  }
  function noise(out, t, dur, { vol = .3, type = 'bandpass', freq = 2000, q = 1, attack = .002, sweep = 0 } = {}) {
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  function bell(out, t, f, dur, vol = .12) {           // soft bell: a few inharmonic partials
    [[1, 1], [2.01, .45], [3.0, .2], [4.2, .1]].forEach(([m, a]) => tone(out, t, f * m, dur / (m * .7 + .3), { vol: vol * a, attack: .003 }));
  }
  const wood = (out, t, pitch = 1, vol = 1) => {          // a wooden "tok"
    noise(out, t, .035, { vol: .35 * vol, freq: 1500 * pitch, q: 4 });
    tone(out, t, 190 * pitch, .09, { vol: .25 * vol, attack: .002 });
  };
  const SETS = {
    playful: {
      name: 'Playful (current)', desc: 'Bright beeps, like an arcade game',
      roll(o, t) { for (let k = 0; k < 6; k++) tone(o, t + k * .07, 300 + Math.random() * 500, .05, { type: 'square', vol: .05 }); },
      step(o, t) { tone(o, t, 620, .07, { vol: .14, slide: 1.6 }); },
      out(o, t) { tone(o, t, 440, .1, { type: 'triangle', vol: .17, slide: 1.5 }); tone(o, t + .08, 660, .14, { type: 'triangle', vol: .14, slide: 1.4 }); },
      capture(o, t) { tone(o, t, 220, .25, { type: 'sawtooth', vol: .1, slide: .4 }); tone(o, t + .1, 880, .15, { type: 'square', vol: .06, slide: 1.2 }); },
      home(o, t) { [523, 659, 784, 1046].forEach((f, k) => tone(o, t + k * .09, f, .18, { type: 'triangle', vol: .14 })); },
      win(o, t) { [523, 659, 784, 1046, 784, 1046].forEach((f, k) => tone(o, t + k * .13, f, .25, { type: 'triangle', vol: .15 })); }
    },
    wood: {
      name: 'Wooden table', desc: 'Real board game: dice on wood, wooden tokens, soft bell',
      roll(o, t) {                                         // dice tumbling, slowing down, final clack
        let dt = 0; const hits = 9 + (Math.random() * 3 | 0);
        for (let k = 0; k < hits; k++) { dt += .035 + k * .012 + Math.random() * .02; noise(o, t + dt, .03, { vol: .5 - k * .03, freq: 2600 + Math.random() * 1600, q: 3 }); if (k % 3 === 0) tone(o, t + dt, 260 + Math.random() * 80, .05, { vol: .12 }); }
        wood(o, t + dt + .06, 1.3, 1.2);
      },
      step(o, t) { wood(o, t, .95 + Math.random() * .1, .9); },
      out(o, t) { wood(o, t, 1.1); wood(o, t + .12, 1.25, 1.1); },
      capture(o, t) { tone(o, t, 95, .35, { vol: .45, slide: .55 }); noise(o, t, .4, { vol: .18, type: 'lowpass', freq: 1800, sweep: .15 }); wood(o, t, .7, 1.3); },
      home(o, t) { bell(o, t, 784, 1.4, .16); bell(o, t + .18, 1046, 1.6, .12); },
      win(o, t) { [523, 659, 784, 1046].forEach((f, k) => bell(o, t + k * .22, f, 2, .13)); bell(o, t + 1.0, 1568, 2.4, .08); }
    },
    elegant: {
      name: 'Elegant', desc: 'Calm and premium: soft marimba, glass chimes, warm chords',
      roll(o, t) { let dt = 0; for (let k = 0; k < 8; k++) { dt += .05 + k * .01; noise(o, t + dt, .06, { vol: .22, type: 'lowpass', freq: 900 + Math.random() * 500, q: .7 }); } tone(o, t + dt + .07, 330, .25, { vol: .1 }); },
      step(o, t) { tone(o, t, 523, .22, { vol: .16 }); tone(o, t, 2092, .06, { vol: .03 }); },
      out(o, t) { tone(o, t, 392, .3, { vol: .16 }); tone(o, t + .14, 587, .4, { vol: .14 }); },
      capture(o, t) { tone(o, t, 146.8, .7, { type: 'sawtooth', vol: .07, attack: .02, slide: .75 }); tone(o, t, 73.4, .8, { vol: .25, attack: .01, slide: .8 }); tone(o, t + .02, 220, .5, { type: 'triangle', vol: .05, slide: .7 }); },
      home(o, t) { [1046, 1318, 1568].forEach((f, k) => bell(o, t + k * .12, f, 1.8, .07)); },
      win(o, t) { [261.6, 329.6, 392, 523.3].forEach(f => tone(o, t, f, 2.6, { vol: .07, attack: .35 })); [784, 1046, 1318].forEach((f, k) => bell(o, t + .5 + k * .25, f, 2, .07)); }
    },
    classic: {
      name: 'Classic plastic', desc: 'Crisp: plastic dice and tokens, clear ding, short fanfare',
      roll(o, t) { let dt = 0; for (let k = 0; k < 10; k++) { dt += .03 + k * .009 + Math.random() * .015; noise(o, t + dt, .02, { vol: .4, freq: 4200 + Math.random() * 2000, q: 5 }); } noise(o, t + dt + .05, .025, { vol: .5, freq: 3600, q: 4 }); },
      step(o, t) { noise(o, t, .02, { vol: .35, freq: 3200, q: 6 }); tone(o, t, 880, .04, { vol: .06 }); },
      out(o, t) { noise(o, t, .02, { vol: .35, freq: 3000, q: 6 }); tone(o, t, 660, .12, { type: 'triangle', vol: .12 }); tone(o, t + .1, 990, .16, { type: 'triangle', vol: .1 }); },
      capture(o, t) { tone(o, t, 330, .18, { type: 'triangle', vol: .2 }); tone(o, t + .16, 247, .35, { type: 'triangle', vol: .22 }); noise(o, t, .25, { vol: .12, type: 'lowpass', freq: 1200, sweep: .3 }); },
      home(o, t) { bell(o, t, 1318, 1.1, .15); },
      win(o, t) { const n = [[392, 0], [523, .15], [659, .3], [784, .45], [659, .75], [784, .9]]; n.forEach(([f, d]) => { tone(o, t + d, f, .35, { type: 'sawtooth', vol: .05, attack: .02 }); tone(o, t + d, f, .35, { type: 'triangle', vol: .1, attack: .01 }); }); }
    }
  };
  window.LudoSound = {
    SETS,
    play(set, ev) { try { ac(); const s = SETS[set] || SETS.wood; if (!s[ev]) return; const out = master(.9); s[ev](out, AC.currentTime + .01); } catch (e) { } }
  };
})();
