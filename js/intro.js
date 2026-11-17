/* Startanimation: der Kalender baut sich beim Laden Stück für Stück zusammen (≈ 2 s).
   Reihenfolge: Rahmen-Ecken rasten ein → Termine und Aufgaben → Raster → Kopf, Leisten → Goldlinie.
   Nur Darstellung (Web Animations, fill: backwards): nichts bleibt am DOM hängen, jede Eingabe springt ans Ende. */
(() => {
  const root = document.documentElement;
  if (root.dataset.intro !== 'wait') return;
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const anims = [];
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
  const run = (el, frames, delay, dur, easing = EASE) => anims.push(el.animate(frames, { delay, duration: dur, easing, fill: 'backwards' }));
  const byPos = (els) => els.map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => (a.r.left - b.r.left) || (a.r.top - b.r.top)).map((x) => x.el);
  const wave = (els, start, step, maxSpan, frames, dur) => { const s = els.length > 1 ? Math.min(step, maxSpan / (els.length - 1)) : 0; els.forEach((el, i) => run(el, frames, start + i * s, dur)); };

  function play() {
    const vc = document.querySelector('.view-container');
    const temp = [];

    // 0,00 s: vier Goldecken rasten am Kalenderrahmen ein, blenden am Ende aus
    if (vc) {
      for (const pos of ['tl', 'tr', 'bl', 'br']) {
        const c = document.createElement('i');
        c.className = 'intro-corner ' + pos;
        vc.append(c); temp.push(c);
        run(c, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], 0, 260, 'cubic-bezier(.34, 1.8, .64, 1)');
        anims.push(c.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 1500, duration: 400, easing: EASE, fill: 'forwards' }));
      }
    }

    // 0,10 s: Termine und Aufgaben formieren sich zuerst
    const items = byPos($$('.tg-event, .chip, .agenda-item, .todo-item'));
    wave(items, 100, 28, 520, [{ opacity: 0, transform: 'translateY(10px) scale(.92)' }, { opacity: 1, transform: 'none' }], 460);

    // 0,55 s: Raster zieht sich, Tage und Stunden setzen sich
    wave($$('.tg-line'), 550, 22, 450, [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }], 520);
    wave(byPos($$('.tg-col, .tg-ad-slot')), 520, 40, 320, [{ borderLeftColor: 'transparent' }, {}], 480);
    wave($$('.tg-dayhead'), 600, 45, 300, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 420);
    wave($$('.tg-hour'), 650, 18, 400, [{ opacity: 0, transform: 'translate(-6px, -50%)' }, { opacity: 1, transform: 'translate(0, -50%)' }], 380);
    wave($$('.month-head > *, .day-num, .ym-title, .ym-day, .agenda-date, .tg-gutter-head, .tg-gutter-ad'), 600, 6, 500, [{ opacity: 0 }, { opacity: 1 }], 380);

    // 1,00 s: Kopfzeile, Seitenleiste, Aufgabenleiste, untere Leiste
    const shell = $$('.topbar > *:not(.topbar-spacer), .sidebar > *, .todo-head, .progress-card, .todo-lists, .todo-add, .bottom-nav > *');
    wave(shell, 1000, 22, 520, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], 380);
    const now = document.querySelector('.now-line');
    if (now) run(now, [{ transform: 'scaleX(0)', transformOrigin: 'left' }, { transform: 'scaleX(1)', transformOrigin: 'left' }], 1350, 450);

    // 1,45 s: feine Goldlinie läuft unter dem Kopf durch, dann Stille
    const top = document.querySelector('.topbar');
    if (top) {
      const sweep = document.createElement('i');
      sweep.className = 'intro-sweep'; top.append(sweep); temp.push(sweep);
      anims.push(sweep.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: .7 }, { transform: 'scaleX(1)', opacity: 0 }], { delay: 1450, duration: 550, easing: EASE, fill: 'both' }));
    }

    root.removeAttribute('data-intro');
    const done = () => { temp.forEach((t) => t.remove()); ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.removeEventListener(ev, skip, true)); };
    const skip = () => { anims.forEach((a) => { try { a.finish(); } catch (e) { /* schon weg */ } }); done(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, skip, { capture: true, passive: true }));
    Promise.allSettled(anims.map((a) => a.finished)).then(done);
  }

  // App.init rendert auf DOMContentLoaded; dieser Listener kommt danach. Ein Bild warten, damit das Layout steht.
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => { try { play(); } catch (e) { root.removeAttribute('data-intro'); } }));
})();
