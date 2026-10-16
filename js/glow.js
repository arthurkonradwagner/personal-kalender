/* Leuchtender Mauszeiger: heller Punkt + weicher, leicht schimmernder Silberschein. Nur am PC mit Maus. */
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const halo = document.createElement('div');
  const dot = document.createElement('div');
  halo.className = 'glow-halo';
  dot.className = 'glow-dot';
  halo.setAttribute('aria-hidden', 'true');
  dot.setAttribute('aria-hidden', 'true');
  document.body.append(halo, dot);

  // Über klickbaren Dingen wird der Schein größer, in Textfeldern bleibt der normale Textcursor
  const HOT = 'a, button, select, label, summary, [role="button"], input[type="checkbox"], input[type="radio"], .chip, .tg-event, .agenda-item, .todo-main, .ts-item, .grip, .proj-tab, .prj-head, .mini-day, .ym-day, .ym-title, .swatch, .tg-taskbar, .tg-ad-slot, .cal-item';
  const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable="true"]';
  const opt = { passive: true, capture: true };

  let x = -100, y = -100, hx = x, hy = y, raf = 0;
  const place = (el, px, py) => { el.style.transform = `translate3d(${px}px, ${py}px, 0)`; };
  const tick = () => {
    const k = calm.matches ? 1 : 0.22;
    hx += (x - hx) * k;
    hy += (y - hy) * k;
    if (Math.abs(x - hx) < 0.1 && Math.abs(y - hy) < 0.1) { hx = x; hy = y; raf = 0; } else raf = requestAnimationFrame(tick);
    place(halo, hx, hy);
  };
  const off = () => root.classList.remove('glow-on', 'glow-press');

  const move = (px, py) => {
    x = px; y = py;
    if (!root.classList.contains('glow-on')) { hx = x; hy = y; root.classList.add('glow-on'); }
    place(dot, x, y);
    if (!raf) raf = requestAnimationFrame(tick);
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return off();
    move(e.clientX, e.clientY);
  }, opt);
  // Aufgaben werden mit dem Browser-Ziehen verschoben: dabei gibt es keine pointermove-Ereignisse
  document.addEventListener('dragover', (e) => { if (e.clientX || e.clientY) move(e.clientX, e.clientY); }, opt);
  document.addEventListener('dragend', () => root.classList.remove('glow-press'), opt);
  document.addEventListener('drop', () => root.classList.remove('glow-press'), opt);
  document.addEventListener('pointerover', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const text = !!(t && t.closest(TEXT));
    root.classList.toggle('glow-text', text);
    root.classList.toggle('glow-hot', !text && !!(t && t.closest(HOT)));
  }, opt);
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') root.classList.add('glow-press'); else off();
  }, opt);
  addEventListener('pointerup', () => root.classList.remove('glow-press'), opt);
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) off(); }, opt);
  addEventListener('blur', off);
})();
