/* Wecker: Weckzeiten mit Wochentagen, Weckton, Schlummern und Nachttisch-Modus.
   Läutet, solange die App offen ist (am besten im Nachttisch-Modus, der den Bildschirm wach hält). */
'use strict';

const Alarm = (() => {
  const { h } = U;
  const DAYS = [1, 2, 3, 4, 5, 6, 0];
  const SOUNDS = { klassisch: 'Klassisch', sanft: 'Sanft', glocke: 'Glocke', aufgang: 'Sonnenaufgang' };
  let ringing = null;   // { alarm, stop }
  let snoozed = null;   // { alarm, at }
  let firedKey = null;
  let wakeLock = null;

  const S = () => Store.state;
  const list = () => S().alarms || (S().alarms = []);
  const save = () => Store.emit('alarms');

  // ---------- Zeiten ----------
  const daysLabel = (a) => {
    const d = a.days || [];
    if (!d.length) return 'Einmalig';
    if (d.length === 7) return 'Täglich';
    if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return 'Mo–Fr';
    if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Wochenende';
    return DAYS.filter((x) => d.includes(x)).map((x) => U.WEEKDAYS_SHORT[x]).join(', ');
  };
  function nextRing(a, from = new Date()) {
    const [hh, mm] = a.time.split(':').map(Number);
    for (let i = 0; i < 8; i++) {
      const d = U.addDays(U.startOfDay(from), i);
      d.setHours(hh, mm, 0, 0);
      if (d <= from) continue;
      if (!a.days || !a.days.length || a.days.includes(d.getDay())) return d;
    }
    return null;
  }
  function nextAlarm() {
    let best = null;
    for (const a of list()) {
      if (!a.enabled) continue;
      const t = nextRing(a);
      if (t && (!best || t < best.t)) best = { a, t };
    }
    if (snoozed && (!best || snoozed.at < best.t)) best = { a: snoozed.alarm, t: snoozed.at, snooze: true };
    return best;
  }
  const inText = (t) => {
    const m = Math.max(1, Math.round((t - Date.now()) / 60000));
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh ? `in ${hh} Std. ${mm} Min.` : `in ${mm} Min.`;
  };

  // ---------- Wecktöne ----------
  function pattern(name, c, out, t) {
    const tone = (f, at, len, vol, type = 'sine') => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + len + 0.05);
    };
    if (name === 'klassisch') { for (let i = 0; i < 4; i++) tone(1760, t + i * 0.16, 0.09, 0.35, 'square'); return 1.3; }
    if (name === 'sanft') { [523, 659, 784, 1047, 784, 659].forEach((f, i) => tone(f, t + i * 0.22, 0.6, 0.4)); return 1.9; }
    if (name === 'glocke') { Sound.bell(c, out, t, 1319, 0.5); Sound.bell(c, out, t + 0.45, 1047, 0.4); return 2.2; }
    /* aufgang */ [392, 494, 587, 784].forEach((f, i) => { tone(f, t + i * 0.12, 1.6, 0.18, 'triangle'); tone(f * 2, t + i * 0.12, 1.2, 0.05); }); return 2.4;
  }
  // spielt in Schleife und wird über 30 Sekunden lauter, wie ein echter Wecker
  function play(name, { loop = true, preview = false } = {}) {
    const c = Sound.audio();
    const out = c.createGain(); out.connect(c.destination);
    const t0 = c.currentTime + 0.05;
    out.gain.setValueAtTime(preview ? 0.8 : 0.25, t0);
    if (!preview) out.gain.linearRampToValueAtTime(1, t0 + 30);
    let t = t0, stopped = false, timer = null;
    const step = () => {
      if (stopped) return;
      while (t < c.currentTime + 1.5) t += pattern(name, c, out, t);
      if (loop) timer = setTimeout(step, 500);
    };
    step();
    return () => { stopped = true; clearTimeout(timer); out.gain.cancelScheduledValues(c.currentTime); out.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => out.disconnect(), 400); };
  }

  // ---------- Läuten ----------
  function ring(a) {
    if (ringing) return;
    const stopSound = play(a.sound || 'klassisch');
    const vib = setInterval(() => { try { navigator.vibrate && navigator.vibrate([400, 200, 400]); } catch (e) { /* egal */ } }, 1500);
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('⏰ ' + (a.label || 'Wecker'), { body: a.time, tag: 'alarm', requireInteraction: true }); } catch (e) { /* egal */ }
    const clock = h('div', { class: 'ring-time' }, U.timeKey(new Date()));
    const tick = setInterval(() => { clock.textContent = U.timeKey(new Date()); }, 1000);
    const close = () => { stopSound(); clearInterval(vib); clearInterval(tick); el.remove(); ringing = null; try { navigator.vibrate && navigator.vibrate(0); } catch (e) { /* egal */ } renderCard(); };
    const snoozeMin = a.snooze || 9;
    const el = h('div', { class: 'ring-screen' },
      h('div', { class: 'ring-glow' }),
      h('div', { class: 'ring-top' }, h('span', { class: 'ring-ico' }, '⏰'), a.label || 'Wecker'),
      clock,
      h('div', { class: 'ring-date' }, U.fmtDateLong(new Date())),
      h('div', { class: 'ring-actions' },
        h('button', { class: 'ring-snooze', onclick: () => { snoozed = { alarm: a, at: new Date(Date.now() + snoozeMin * 60000) }; close(); App.toast(`Schlummern bis ${U.timeKey(snoozed.at)}`); } }, `Schlummern · ${snoozeMin} Min.`),
        h('button', { class: 'ring-stop', onclick: () => { snoozed = null; close(); } }, 'Stopp')));
    document.body.append(el);
    ringing = { alarm: a, close };
    if (!a.days || !a.days.length) { a.enabled = false; save(); }
  }

  function check() {
    const now = new Date();
    const key = U.dateKey(now) + ' ' + U.timeKey(now);
    if (snoozed && now >= snoozed.at) { const a = snoozed.alarm; snoozed = null; ring(a); return; }
    if (firedKey === key) return;
    for (const a of list()) {
      if (!a.enabled || a.time !== U.timeKey(now)) continue;
      if (a.days && a.days.length && !a.days.includes(now.getDay())) continue;
      firedKey = key;
      ring(a);
      return;
    }
  }

  // ---------- Nachttisch-Modus ----------
  async function bedside() {
    Sound.audio();
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { wakeLock = null; }
    try { await document.documentElement.requestFullscreen?.(); } catch (e) { /* egal */ }
    const time = h('div', { class: 'bs-time' }), sub = h('div', { class: 'bs-sub' });
    const upd = () => {
      time.textContent = U.timeKey(new Date());
      const n = nextAlarm();
      sub.textContent = n ? `⏰ ${U.timeKey(n.t)} · ${inText(n.t)}` : 'Kein Wecker gestellt';
    };
    upd();
    const tick = setInterval(upd, 5000);
    const el = h('div', { class: 'bedside' }, time, sub, h('div', { class: 'bs-hint' }, wakeLock ? 'Bildschirm bleibt an · zum Beenden tippen' : 'Zum Beenden tippen · Bildschirm bitte nicht sperren'));
    el.addEventListener('click', () => {
      clearInterval(tick); el.remove();
      try { wakeLock && wakeLock.release(); } catch (e) { /* egal */ }
      wakeLock = null;
      try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { /* egal */ }
    });
    document.body.append(el);
  }
  // Wake Lock geht beim Wechsel in den Hintergrund verloren: beim Zurückkommen neu holen
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && U.$('.bedside') && !wakeLock) { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* egal */ } }
  });

  // ---------- Handy-Wecker (Android) ----------
  // Die Web-App kann bei gesperrtem Handy nicht läuten. Darum die Zeit zusätzlich in die Uhr-App von Android eintragen.
  const isAndroid = /Android/i.test(navigator.userAgent);
  function toPhone(a) {
    const [hh, mm] = a.time.split(':').map(Number);
    const msg = encodeURIComponent(a.label || 'Kalender-Wecker');
    const url = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hh};i.android.intent.extra.alarm.MINUTES=${mm};S.android.intent.extra.alarm.MESSAGE=${msg};B.android.intent.extra.alarm.SKIP_UI=false;end`;
    let left = false;
    const onHide = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onHide);
    location.href = url;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (left) return;
      Modal.choose('Uhr-App ließ sich nicht öffnen',
        `Stell den Wecker bitte einmal von Hand: Uhr-App öffnen → Wecker → ${a.time}${(a.days || []).length ? ' · ' + daysLabel(a) : ''}. Tipp: „Hey Google, stell einen Wecker auf ${a.time}“ geht auch.`,
        [{ label: 'OK', value: true, primary: true }]);
    }, 1800);
  }

  // ---------- Oberfläche ----------
  function renderCard() {
    const box = U.$('#alarmCard');
    if (!box) return;
    const n = nextAlarm();
    box.replaceChildren(
      h('div', { class: 'ac-head' }, h('span', { class: 'ac-ico' }, '⏰'), 'Wecker', h('span', { class: 'ac-count' }, list().filter((a) => a.enabled).length ? `${list().filter((a) => a.enabled).length} aktiv` : '')),
      n ? h('div', { class: 'ac-time' }, U.timeKey(n.t)) : h('div', { class: 'ac-time off' }, '––:––'),
      h('div', { class: 'ac-sub' }, n ? `${n.snooze ? 'Schlummern · ' : ''}${U.relDay(n.t)} · ${inText(n.t)}` : 'Kein Wecker gestellt'));
    const nav = U.$('#navAlarmTime');
    if (nav) nav.textContent = n ? U.timeKey(n.t) : '';
  }

  let openId = null;
  function sheet() {
    const box = h('div', { class: 'alarm-sheet' });
    const draw = () => {
      const n = nextAlarm();
      const items = [...list()].sort((a, b) => a.time.localeCompare(b.time)).map((a) => item(a, draw));
      box.replaceChildren(
        h('div', { class: 'ts-handle' }),
        h('div', { class: 'as-head' },
          h('div', null, h('h3', null, 'Wecker'), h('small', null, n ? `Nächster Wecker ${U.relDay(n.t).toLowerCase()} um ${U.timeKey(n.t)} · ${inText(n.t)}` : 'Kein Wecker aktiv')),
          h('button', { class: 'icon-btn', onclick: () => Modal.close() }, '✕')),
        h('div', { class: 'as-list' }, ...(items.length ? items : [h('p', { class: 'muted' }, 'Noch kein Wecker. Leg unten einen an.')])),
        h('button', { class: 'btn btn-outline as-add', onclick: () => {
          const a = { id: 'alm-' + U.uid(), time: '07:00', label: '', days: [1, 2, 3, 4, 5], enabled: true, sound: 'klassisch', snooze: 9 };
          list().push(a); openId = a.id; save(); draw();
        } }, '+ Wecker hinzufügen'),
        h('button', { class: 'btn btn-primary as-bedside', onclick: () => { Modal.close(); bedside(); } }, '🌙 Nachttisch-Modus starten'),
        h('p', { class: 'as-note' }, 'Wichtig: Der Wecker läutet nur, wenn der Kalender offen ist. Am besten abends den Nachttisch-Modus starten und das Handy ans Ladekabel hängen.'));
    };
    draw();
    Modal.open(box, { width: 460, cls: 'modal-task-sheet' });
  }

  function item(a, draw) {
    const sw = h('input', { type: 'checkbox', class: 'switch', checked: !!a.enabled });
    sw.addEventListener('click', (e) => e.stopPropagation());
    sw.addEventListener('change', () => { a.enabled = sw.checked; if (snoozed && snoozed.alarm.id === a.id) snoozed = null; save(); draw(); });
    const head = h('div', { class: 'al-head' },
      h('div', null, h('div', { class: 'al-time' }, a.time), h('div', { class: 'al-sub' }, [a.label, daysLabel(a)].filter(Boolean).join(' · '))),
      sw);
    head.addEventListener('click', () => { openId = openId === a.id ? null : a.id; draw(); });
    const el = h('div', { class: 'al-item' + (a.enabled ? '' : ' off') + (openId === a.id ? ' open' : '') }, head);
    if (openId !== a.id) return el;

    const time = h('input', { type: 'time', class: 'al-input-time', value: a.time });
    time.addEventListener('change', () => { if (time.value) { a.time = time.value; a.enabled = true; save(); draw(); } });
    const days = h('div', { class: 'al-days' }, ...DAYS.map((d) => {
      const b = h('button', { type: 'button', class: 'al-day' + ((a.days || []).includes(d) ? ' on' : '') }, U.WEEKDAYS_SHORT[d].slice(0, 2));
      b.addEventListener('click', () => { const s = new Set(a.days || []); s.has(d) ? s.delete(d) : s.add(d); a.days = [...s]; save(); draw(); });
      return b;
    }));
    const label = h('input', { placeholder: 'Bezeichnung, z. B. Uni', value: a.label || '', maxlength: 60 });
    label.addEventListener('change', () => { a.label = label.value.trim(); save(); });
    let stopPrev = null;
    const sound = h('select', null, ...Object.entries(SOUNDS).map(([k, v]) => h('option', { value: k, selected: (a.sound || 'klassisch') === k }, v)));
    const prev = h('button', { type: 'button', class: 'btn btn-outline small al-play', title: 'Anhören' }, '▶');
    const playPrev = () => { stopPrev && stopPrev(); stopPrev = play(sound.value, { loop: false, preview: true }); setTimeout(() => { stopPrev && stopPrev(); stopPrev = null; }, 2600); };
    prev.addEventListener('click', playPrev);
    sound.addEventListener('change', () => { a.sound = sound.value; save(); playPrev(); });
    const snooze = h('select', null, ...[5, 9, 10, 15].map((m) => h('option', { value: m, selected: (a.snooze || 9) === m }, `${m} Minuten`)));
    snooze.addEventListener('change', () => { a.snooze = +snooze.value; save(); });
    el.append(h('div', { class: 'al-detail' },
      time, days,
      h('label', { class: 'al-row' }, h('span', null, 'Name'), label),
      h('div', { class: 'al-row' }, h('span', null, 'Weckton'), h('div', { class: 'al-sound' }, sound, prev)),
      h('label', { class: 'al-row' }, h('span', null, 'Schlummern'), snooze),
      isAndroid ? h('button', { type: 'button', class: 'btn btn-outline al-phone', onclick: () => toPhone(a) }, '📱 Auch im Handy-Wecker stellen') : null,
      isAndroid ? h('p', { class: 'as-note' }, (a.days || []).length ? `Damit läutet es auch bei gesperrtem Handy. In der Uhr-App noch die Tage (${daysLabel(a)}) antippen, dann speichern.` : 'Damit läutet es auch bei gesperrtem Handy.') : null,
      h('div', { class: 'al-row al-test' }, h('span', null, ''), h('button', { type: 'button', class: 'btn btn-ghost small', onclick: () => { Modal.close(); ring(a); } }, 'Jetzt testen')),
      h('button', { type: 'button', class: 'btn btn-danger-ghost small', onclick: () => { S().alarms = list().filter((x) => x.id !== a.id); openId = null; save(); draw(); } }, 'Wecker löschen')));
    return el;
  }

  function init() {
    const card = U.$('#alarmCard');
    if (card) card.addEventListener('click', sheet);
    const nav = U.$('#navAlarm');
    if (nav) nav.addEventListener('click', sheet);
    Store.subscribe(() => renderCard());
    renderCard();
    setInterval(check, 1000);
    setInterval(renderCard, 30000);
  }

  return { init, sheet, bedside, ring, nextAlarm, play, toPhone };
})();
