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

  let lastCash = 0;
  function cash() {
    lastCash = Date.now();
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

  // Rakete bei 100 %: aufsteigendes Rauschen, dann Knall und Knistern vom Feuerwerk
  function rocket(calm) {
    if (Store.state.settings.soundDone === false) return;
    try {
      const c = audio(), t = c.currentTime + 0.05, sr = c.sampleRate;
      const out = c.createGain(); out.gain.value = 0.8; out.connect(c.destination);
      const lift = calm ? 0 : 1.7;
      if (!calm) {
        const buf = c.createBuffer(1, Math.ceil(sr * lift), sr), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4;
        f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(2800, t + lift);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.35); g.gain.exponentialRampToValueAtTime(0.05, t + lift);
        src.connect(f); f.connect(g); g.connect(out); src.start(t);
      }
      [[0, 0.6], [0.3, 0.35], [0.56, 0.4]].slice(0, calm ? 1 : 3).forEach(([dt, v]) => {
        const b = t + lift + dt;
        noise(c, out, b, 0.5, 120, 0.7, v * 1.6);   // Knall
        noise(c, out, b, 0.12, 900, 0.8, v);
        for (let i = 0; i < 14; i++) noise(c, out, b + 0.25 + Math.random() * 1.1, 0.02, 5000 + Math.random() * 4000, 6, v * 0.35); // Knistern
      });
    } catch (e) { /* ohne Ton weiter */ }
  }

  // true, wenn der Nutzer gerade selbst etwas abgehakt hat (nicht durch Sync oder Zeitablauf)
  const recent = () => Date.now() - lastCash < 4000;

  return { cash, rocket, recent };
})();
