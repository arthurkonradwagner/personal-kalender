/* Erledigt-Feedback: am PC ein leiser Mausklick (WebAudio, keine Datei), überall ein kleiner Silber-Splash am Haken */
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

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Haken kurz größer werden lassen, dazu feine silberne Funken (am body, damit ein Neuzeichnen sie nicht abschneidet)
  function splash(el) {
    if (!el || !el.isConnected || calmMotion.matches) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'done-splash';
    box.style.left = r.left + r.width / 2 + 'px';
    box.style.top = r.top + r.height / 2 + 'px';
    for (let i = 0; i < 8; i++) {
      const dot = document.createElement('i'), a = i / 8 * Math.PI * 2, d = 12 + Math.random() * 6;
      box.append(dot);
      dot.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.3)`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 450);
  }

  let lastCash = 0;
  function done(el) {
    lastCash = Date.now();
    splash(el);
    if (Store.state.settings.soundDone === false || !finePointer.matches) return; // am Handy kein Ton
    try {
      const c = audio(), t = c.currentTime + 0.01;
      const out = c.createGain(); out.gain.value = 0.12; out.connect(c.destination);
      noise(c, out, t, 0.012, 3200, 1.5, 0.6);          // kurzer, leiser Klick
      noise(c, out, t + 0.03, 0.008, 2400, 1.5, 0.3);   // leises Loslassen
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

  return { done, rocket, recent };
})();
