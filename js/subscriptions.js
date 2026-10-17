/* Kalender-Abos: externe iCal-Links (z. B. BOKUonline-Stundenplan) automatisch einlesen.
   Abo-Kalender sind schreibgeschützt und werden regelmäßig neu geladen. */
'use strict';

const Subs = (() => {
  const { h } = U;
  const EVERY_MS = 30 * 60000;   // höchstens alle 30 Minuten neu laden
  let running = new Set();

  // Viele Uni-Server erlauben keinen direkten Abruf aus dem Browser (CORS). Dann über einen Vermittler.
  const proxies = () => {
    const own = (Store.state.settings.icsProxy || '').trim();
    const list = [(u) => u];
    if (own) list.push((u) => own + (own.includes('?') ? '' : '?url=') + encodeURIComponent(u));
    list.push((u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u));
    list.push((u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u));
    return list;
  };

  const cleanUrl = (u) => u.trim().replace(/^webcals?:\/\//i, 'https://');

  async function fetchIcs(url) {
    let lastErr = null;
    for (const via of proxies()) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(via(url), { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
        const text = await r.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
        lastErr = new Error('Kein Kalender unter diesem Link');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Laden fehlgeschlagen');
  }

  // feste IDs aus der UID, damit sich beim Neuladen nichts doppelt
  const idFor = (cal, ev, n) => 'sub-' + cal.id + '-' + (ev.uid ? (ev.uid + (ev.recurId ? '@' + ev.recurId : '')) : ev.start + '-' + n).replace(/[^\w@.-]/g, '').slice(0, 120);

  async function refresh(cal, { force = false, toast = false } = {}) {
    if (!cal || cal.type !== 'subscription' || !cal.url || running.has(cal.id)) return;
    if (!force && Date.now() - (cal.lastSync || 0) < EVERY_MS) return;
    if (!navigator.onLine) return;
    running.add(cal.id);
    try {
      const text = await fetchIcs(cleanUrl(cal.url));
      const S = Store.state;
      const evs = ICS.importText(text, cal.id);
      // Einzeln geänderte Termine einer Serie (RECURRENCE-ID) aus der Serie herausnehmen
      const masters = new Map(evs.filter((e) => e.uid && !e.recurId).map((e) => [e.uid, e]));
      for (const e of evs) if (e.recurId && masters.has(e.uid)) masters.get(e.uid).exdates.push(e.recurId);
      const old = new Map(S.events.filter((e) => e.calId === cal.id).map((e) => [e.id, e]));
      const fresh = evs.map((e, n) => {
        const id = idFor(cal, e, n);
        const { uid, recurId, ...rest } = e;
        const ev = { ...rest, id, color: null, reminder: null };
        const prev = old.get(id);
        if (prev && prev._u) ev._u = prev._u;
        return ev;
      });
      const c = Store.calendar(cal.id);
      if (!c) return;
      S.events = S.events.filter((e) => e.calId !== cal.id).concat(fresh);
      c.lastSync = Date.now();
      c.lastError = null;
      Store.emit('events');
      if (toast) App.toast(`„${c.name}“ aktualisiert: ${fresh.length} Termine`);
    } catch (e) {
      console.error(e);
      const c = Store.calendar(cal.id);
      if (c && c.lastError !== String(e.message)) { c.lastError = String(e.message); Store.emit('calendars'); }
      if (toast) App.toast(`„${cal.name}“ konnte nicht geladen werden: ${e.message}`, { type: 'error' });
    } finally {
      running.delete(cal.id);
    }
  }

  const refreshAll = (force) => Store.state.calendars.filter((c) => c.type === 'subscription').forEach((c) => refresh(c, { force }));

  async function add(name, url, color) {
    const cal = Store.addCalendar({ name: name || 'Abo', color, type: 'subscription', url: url.trim(), visible: true });
    await refresh(cal, { force: true, toast: true });
    return cal;
  }

  async function remove(cal) {
    const ok = await Modal.choose(`Abo „${cal.name}“ entfernen?`, 'Die Termine dieses Abos verschwinden aus deinem Kalender. Im Original (z. B. BOKUonline) bleibt alles erhalten.', [{ label: 'Entfernen', value: true, danger: true }]);
    if (ok) Store.removeCalendar(cal.id);
  }

  function init() {
    setTimeout(() => refreshAll(false), 2500);
    setInterval(() => refreshAll(false), 5 * 60000);
    window.addEventListener('online', () => refreshAll(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(false); });
  }

  const ago = (t) => {
    if (!t) return 'noch nie';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : U.fmtDateShort(new Date(t));
  };

  function settingsSection() {
    const box = h('div', null);
    const draw = () => {
      const subs = Store.state.calendars.filter((c) => c.type === 'subscription');
      const name = h('input', { placeholder: 'Name, z. B. BOKU', value: subs.length ? '' : 'BOKU' });
      const url = h('input', { placeholder: 'iCal-Link einfügen (https://… oder webcal://…)', spellcheck: false });
      const msg = h('small', { class: 'ai-msg' });
      const exam = h('input', { value: Store.state.settings.examWords || '', spellcheck: false, onchange: () => Store.setSetting('examWords', exam.value) });
      const addBtn = h('button', { type: 'button', class: 'btn btn-primary small', onclick: async () => {
        if (!/^(https?|webcals?):\/\//i.test(url.value.trim())) { msg.textContent = 'Bitte einen gültigen Link einfügen.'; return; }
        addBtn.disabled = true; msg.textContent = 'Lade Kalender …';
        const color = '#039be5';
        const cal = await add(name.value.trim() || 'Abo', url.value, color);
        addBtn.disabled = false;
        msg.textContent = Store.calendar(cal.id)?.lastError ? 'Konnte nicht geladen werden: ' + Store.calendar(cal.id).lastError : '';
        draw();
      } }, 'Abonnieren');
      box.replaceChildren(
        h('h4', null, '🎓 Kalender-Abos (z. B. BOKU-Stundenplan)'),
        h('p', { class: 'muted small' }, 'Füge den iCal-Link aus BOKUonline ein. Die Termine erscheinen als eigener Kalender und werden automatisch alle 30 Minuten aktualisiert. Sie sind schreibgeschützt, Änderungen machst du in BOKUonline.'),
        ...subs.map((c) => h('div', { class: 'set-row sub-row' },
          h('span', null, h('b', null, h('i', { class: 'sub-dot', style: { background: c.color } }), c.name),
            h('small', null, c.lastError ? '⚠ ' + c.lastError : `${Store.state.events.filter((e) => e.calId === c.id).length} Termine · aktualisiert ${ago(c.lastSync)}`)),
          h('div', { class: 'ai-key' },
            h('button', { type: 'button', class: 'btn btn-outline small', onclick: async () => { await refresh(c, { force: true, toast: true }); draw(); } }, 'Aktualisieren'),
            h('button', { type: 'button', class: 'btn btn-danger-ghost small', onclick: async () => { await remove(c); draw(); } }, 'Entfernen')))),
        h('div', { class: 'sub-add' }, name, url, addBtn),
        msg,
        h('label', { class: 'set-row' }, h('span', null, 'Prüfungen erkennen an', h('small', null, 'Wörter mit Komma getrennt, gesucht in Titel, Kategorie und Beschreibung')), exam));
    };
    draw();
    return box;
  }

  return { init, refresh, refreshAll, add, remove, settingsSection, fetchIcs };
})();
