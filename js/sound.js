/* Ka-Ching: kleiner Kassen-Sound beim Erledigen einer Aufgabe, direkt im Browser erzeugt (keine Datei nötig) */
'use strict';

const Sound = (() => {
  let ctx = null;
  const audio = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // kurzes Rauschen durch einen Filter: „Ka“ der Kassenlade bzw. Münzklirren
  function noise(c, out, t, dur, freq, q, vol) {
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(out); src.start(t);
  }

  // Glocke „Ching“: mehrere hohe Teiltöne, die langsam ausklingen
  function bell(c, out, t, base, vol) {
    [[1, 1, 1.4], [2.01, 0.55, 1.0], [2.76, 0.4, 0.7], [4.07, 0.25, 0.45], [5.4, 0.12, 0.3]].forEach(([r, a, len]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = base * r;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
    });
  }

  function cash() {
    if (Store.state.settings.soundDone === false) return;
    try {
      const c = audio(), t = c.currentTime + 0.02;
      const out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
      noise(c, out, t, 0.07, 2500, 1.2, 0.5);           // „Ka“
      noise(c, out, t + 0.05, 0.05, 5000, 2, 0.3);
      bell(c, out, t + 0.09, 1975, 0.22);               // „Ching“
      bell(c, out, t + 0.11, 2637, 0.12);
      for (let i = 0; i < 6; i++) noise(c, out, t + 0.14 + i * 0.045 + Math.random() * 0.02, 0.025, 6000 + Math.random() * 3000, 8, 0.25 - i * 0.03); // Münzen
    } catch (e) { /* ohne Ton weiter */ }
  }

  return { cash };
})();
