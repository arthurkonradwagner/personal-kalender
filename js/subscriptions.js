/* Externe Kalender: iCal-Links (Google, Proton, BOKUonline, BOKUlearn …) automatisch einlesen.
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
    list.push((u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u));
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
      } catch (e) { lastErr = e.name === 'AbortError' ? new Error('Zeitüberschreitung') : e; }
    }
    if (!lastErr || lastErr instanceof TypeError) throw new Error('Kein Abrufweg erreichbar (der Kalender-Server und die Gratis-Vermittler blockieren). Eigenen Abruf-Dienst unten eintragen.');
    throw lastErr;
  }

  // feste IDs aus der UID, damit sich beim Neuladen nichts doppelt
  const idFor = (cal, ev, n) => 'sub-' + cal.id + '-' + (ev.uid ? (ev.uid + (ev.recurId ? '@' + ev.recurId : '')) : ev.start + '-' + n).replace(/[^\w@.-]/g, '').slice(0, 120);

  // Dein eigener Kalender ist der Hauptkalender: Abos ergänzen nur. Ein Abo-Termin, den es schon gibt
  // (eigene Termine oder ein weiter oben stehendes Abo, z. B. BOKU), wird ausgeblendet, nie überschrieben.
  const DEDUP = 1;   // erhöhen, wenn sich die Erkennung ändert: alle Abos werden dann sofort neu abgeglichen
  const keysOf = (e) => [e.uid, e.id + '@personal-kalender',
    String(e.title || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + String(e.start || '').slice(0, 16)].filter(Boolean);
  function knownKeys(calId) {
    const S = Store.state, cals = S.calendars, me = cals.findIndex((c) => c.id === calId);
    const ranks = new Set(cals.filter((c, i) => c.id !== calId && (c.type !== 'subscription' || i < me)).map((c) => c.id));
    const keys = new Set();
    for (const e of S.events) if (ranks.has(e.calId)) keysOf(e).forEach((k) => keys.add(k));
    return keys;
  }
  const dropKnown = (evs, keys) => evs.filter((e) => !keysOf(e).some((k) => keys.has(k)));

  async function refresh(cal, { force = false, toast = false } = {}) {
    if (!cal || cal.type !== 'subscription' || !cal.url || running.has(cal.id)) return;
    if (!force && cal.dedup === DEDUP && Date.now() - (cal.lastSync || 0) < EVERY_MS) return;
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
      const all = evs.map((e, n) => {
        const id = idFor(cal, e, n);
        const { recurId, ...rest } = e;
        const ev = { ...rest, id, color: null, reminder: null };
        const prev = old.get(id);
        if (prev && prev._u) ev._u = prev._u;
        return ev;
      });
      const fresh = dropKnown(all, knownKeys(cal.id));
      const c = Store.calendar(cal.id);
      if (!c) return;
      // Schutz: Ein leerer oder stark geschrumpfter Abruf (Server-/Vermittlerfehler) löscht nie die vorhandenen Termine.
      if (old.size && !all.length) throw new Error('Kalender kam leer an – die bisherigen Termine bleiben erhalten');
      if (old.size >= 10 && all.length < old.size * 0.3) {
        const ok = toast && await Modal.choose(`„${c.name}“ hat plötzlich viel weniger Termine`, `Vorher ${old.size}, jetzt nur ${all.length}. Wahrscheinlich ein Fehler beim Abruf. Trotzdem übernehmen?`, [{ label: 'Übernehmen', value: true, danger: true }]);
        if (!ok) throw new Error(`Nur ${all.length} statt ${old.size} Termine geliefert – die bisherigen Termine bleiben erhalten`);
      }
      backup(cal.id, [...old.values()]);
      S.events = S.events.filter((e) => e.calId !== cal.id).concat(fresh);
      c.lastSync = Date.now();
      c.lastError = null;
      c.dedup = DEDUP;
      c.dupes = all.length - fresh.length;
      Store.emit('events');
      if (toast) App.toast(`„${c.name}“ aktualisiert: ${fresh.length} neue Termine` + (c.dupes ? `, ${c.dupes} schon vorhandene ausgeblendet` : ''));
    } catch (e) {
      console.error(e);
      const c = Store.calendar(cal.id);
      if (c && c.lastError !== String(e.message)) { c.lastError = String(e.message); Store.emit('calendars'); }
      if (toast) App.toast(`„${cal.name}“ konnte nicht geladen werden: ${e.message}`, { type: 'error' });
    } finally {
      running.delete(cal.id);
    }
  }

  // letzte gute Fassung pro Abo im Browser aufheben (falls doch etwas schiefgeht)
  function backup(calId, evs) {
    if (!evs.length) return;
    try { localStorage.setItem('pk-sub-backup-' + calId, JSON.stringify({ at: Date.now(), events: evs })); } catch (e) { /* Speicher voll: egal */ }
  }

  const refreshAll = (force) => Store.state.calendars.filter((c) => c.type === 'subscription').forEach((c) => refresh(c, { force }));

  async function add(name, url, color) {
    const cal = Store.addCalendar({ name: name || 'Abo', color, type: 'subscription', url: url.trim(), visible: true });
    await refresh(cal, { force: true, toast: true });
    return cal;
  }

  async function remove(cal) {
    const ok = await Modal.choose(`Abo „${cal.name}“ entfernen?`, 'Die Termine dieses Abos verschwinden aus deinem Kalender. Im Original bleibt alles erhalten.', [{ label: 'Entfernen', value: true, danger: true }]);
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

  // Anbieter mit Anleitung, wo man den geheimen iCal-Link findet. link: false = kein eigener Link (nur Hinweis).
  const PROVIDERS = [
    { id: 'google', label: 'Google', color: '#4285f4', steps: ['calendar.google.com am Computer öffnen', 'Links beim Kalender auf ⋮ → „Einstellungen und Freigabe“', 'Ganz unten „Privatadresse im iCal-Format“ kopieren'], note: 'Google-Meet-Links stehen in den Terminen mit drin. Google selbst erneuert diesen Link nur alle paar Stunden.' },
    { id: 'proton', label: 'Proton', color: '#6d4aff', steps: ['calendar.proton.me öffnen', 'Beim Kalender auf ⋮ → „Teilen“ → „Per Link teilen“', '„Vollständige Ansicht“ wählen, Link erstellen und kopieren'] },
    { id: 'boku', label: 'BOKUonline', color: '#039be5', name: 'BOKU', steps: ['BOKUonline öffnen und deinen Terminkalender aufrufen', '„Abonnieren / Export (iCal)“ wählen', 'Link erstellen und kopieren'], note: 'Dein Stundenplan mit allen Lehrveranstaltungen.' },
    { id: 'moodle', label: 'BOKUlearn', color: '#f57c00', steps: ['learn.boku.ac.at öffnen → Kalender', 'Unten „Kalender importieren oder exportieren“ → „Kalender exportieren“', '„Alle Termine“ und „Kürzlich und nächste 60 Tage“ wählen → „Kalender-URL abrufen“ → kopieren'], note: 'Abgaben, Quizze und Kurstermine aus Moodle.' },
    { id: 'outlook', label: 'Outlook', color: '#0f6cbd', steps: ['outlook.com → Einstellungen ⚙ → Kalender → „Freigegebene Kalender“', 'Unter „Kalender veröffentlichen“ den Kalender und „Kann alle Details anzeigen“ wählen', '„Veröffentlichen“ → den ICS-Link kopieren'], note: 'Teams-Besprechungen sind hier mit drin.' },
    { id: 'icloud', label: 'iCloud', color: '#8e8e93', steps: ['icloud.com/calendar öffnen', 'Neben dem Kalender auf das Teilen-Symbol', '„Öffentlicher Kalender“ einschalten und Link kopieren'] },
    { id: 'meet', label: 'Zoom / Meet', link: false, steps: ['Zoom und Google Meet haben keinen eigenen Kalender-Link.', 'Ihre Termine landen in dem Kalender, in den du eingeladen wirst (meist Google oder Outlook).', 'Füge diesen Kalender hinzu, dann sind die Meetings samt Beitritts-Link dabei.'] },
    { id: 'other', label: 'Anderer', color: '#7986cb', name: 'Kalender', steps: ['Jeder Kalender mit iCal-Link funktioniert (endet oft auf .ics oder beginnt mit webcal://).'] },
  ];

  function settingsSection() {
    const box = h('div', null);
    let prov = null;
    const draw = () => {
      const subs = Store.state.calendars.filter((c) => c.type === 'subscription');
      const proxy = h('input', { value: Store.state.settings.icsProxy || '', placeholder: 'https://script.google.com/macros/s/…/exec', spellcheck: false,
        onchange: () => { Store.setSetting('icsProxy', proxy.value.trim()); refreshAll(true); } });
      const exam = h('input', { value: Store.state.settings.examWords || '', spellcheck: false, onchange: () => Store.setSetting('examWords', exam.value) });
      const chips = h('div', { class: 'prj-chips sub-providers' }, ...PROVIDERS.map((p) => h('button', { type: 'button', class: 'pill' + (prov === p ? ' active' : ''), onclick: () => { prov = prov === p ? null : p; draw(); } }, p.label)));
      box.replaceChildren(
        h('h4', null, '📅 Externe Kalender'),
        h('p', { class: 'muted small' }, 'Google, Proton, BOKU, Moodle und mehr. Die Termine erscheinen als eigener Kalender, werden alle 30 Minuten aktualisiert und sind schreibgeschützt (Änderungen machst du im Original).'),
        ...subs.map(subRow),
        h('div', { class: 'lbl' }, 'Kalender hinzufügen'),
        chips,
        prov ? addForm(prov) : h('span'),
        h('label', { class: 'set-row' }, h('span', null, 'Eigener Abruf-Dienst', h('small', null, 'Link deines Google-Skripts (tools/boku-abruf.gs). Holt die Kalender zuverlässig ab, wenn die Gratis-Vermittler blockieren.')), proxy),
        h('label', { class: 'set-row' }, h('span', null, 'Prüfungen erkennen an', h('small', null, 'Wörter mit Komma getrennt, gesucht in Titel, Kategorie und Beschreibung')), exam));
    };
    const subRow = (c) => h('div', { class: 'set-row sub-row' },
      h('span', null, h('b', null, h('label', { class: 'sub-dot', title: 'Farbe ändern', style: { background: c.color } },
        h('input', { type: 'color', value: c.color, onchange: (e) => { Store.updateCalendar(c.id, { color: e.target.value }); draw(); } })), c.name),
        h('small', null, (c.lastError ? '⚠ ' + c.lastError + ' · ' : '') + `${Store.state.events.filter((e) => e.calId === c.id).length} Termine` + (c.dupes ? ` · ${c.dupes} doppelte ausgeblendet` : '') + ` · zuletzt geladen ${ago(c.lastSync)}`)),
      h('div', { class: 'ai-key' },
        h('label', { class: 'sub-onoff', title: 'Im Kalender anzeigen' }, h('input', { type: 'checkbox', checked: c.visible !== false, onchange: (e) => Store.updateCalendar(c.id, { visible: e.target.checked }) }), 'an'),
        h('button', { type: 'button', class: 'btn btn-outline small', onclick: async () => { await refresh(c, { force: true, toast: true }); draw(); } }, 'Aktualisieren'),
        h('button', { type: 'button', class: 'btn btn-danger-ghost small', onclick: async () => { await remove(c); draw(); } }, 'Entfernen')));
    const addForm = (p) => {
      const guide = h('div', { class: 'sub-guide' }, h('ol', null, ...p.steps.map((t) => h('li', null, t))), p.note ? h('small', null, p.note) : null);
      if (p.link === false) return guide;
      let color = p.color;
      const name = h('input', { placeholder: 'Name', value: p.name || p.label });
      const url = h('input', { placeholder: 'iCal-Link einfügen (https://… oder webcal://…)', spellcheck: false });
      const msg = h('small', { class: 'ai-msg' });
      const picker = Dialogs.colorPicker(color, null, (c) => { color = c || p.color; });
      const addBtn = h('button', { type: 'button', class: 'btn btn-primary small', onclick: async () => {
        if (!/^(https?|webcals?):\/\//i.test(url.value.trim())) { msg.textContent = 'Bitte einen gültigen Link einfügen.'; return; }
        addBtn.disabled = true; msg.textContent = 'Lade Kalender …';
        const cal = await add(name.value.trim() || p.label, url.value, color);
        addBtn.disabled = false;
        const err = Store.calendar(cal.id)?.lastError;
        if (err) { msg.textContent = 'Konnte nicht geladen werden: ' + err; return; }
        prov = null; draw();
      } }, 'Hinzufügen');
      return h('div', { class: 'sub-guide-wrap' }, guide, h('div', { class: 'sub-add' }, name, url, addBtn), picker.el, msg);
    };
    draw();
    return box;
  }

  return { init, refresh, refreshAll, add, remove, settingsSection, fetchIcs, dropKnown, knownKeys };
})();
