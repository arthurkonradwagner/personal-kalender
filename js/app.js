/* Haupt-App: Navigation, Seitenleiste, Vorschau, Erinnerungen, Tastatur */
'use strict';

const App = (() => {
  const { h } = U;
  const S = () => Store.state;
  let view = S().settings.view || 'week';
  let date = U.startOfDay(new Date());
  let query = '';
  let lastDay = U.dateKey(new Date());

  // ---------- Rendern ----------
  function render(opts = {}) {
    const vc = U.$('#viewContainer');
    if (query) {
      vc.innerHTML = '';
      vc.className = 'view-container view-agenda';
      const now = new Date();
      Views.renderAgenda(vc, now, { query, from: U.addDays(now, -365), to: U.addDays(now, 730) });
      U.$('#periodTitle').innerHTML = `<span>Suche</span>`;
    } else {
      Views.render(vc, view, date, opts);
      const t = Views.title(view, date);
      U.$('#periodTitle').innerHTML = `<span>${U.esc(t.main)}</span>${t.sub ? `<small>${U.esc(t.sub)}</small>` : ''}`;
    }
    U.$$('#viewSwitch button').forEach((b) => b.classList.toggle('active', !query && b.dataset.view === view));
    U.$('#viewSelect').value = view;
    Views.renderMini(U.$('#miniCal'), date, view);
    renderCalendars();
    Todos.render();
  }

  function renderCalendars() {
    const list = U.$('#calList');
    list.innerHTML = '';
    for (const c of S().calendars) {
      const cb = h('input', { type: 'checkbox', checked: c.visible, style: { '--c': c.color } });
      cb.addEventListener('change', () => Store.updateCalendar(c.id, { visible: cb.checked }));
      const more = h('button', { class: 'icon-btn small cal-more', title: 'Optionen' }, h('svg', { viewBox: '0 0 24 24', html: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>' }));
      more.addEventListener('click', (e) => { e.stopPropagation(); calendarMenu(c, more); });
      const li = h('li', { class: 'cal-item' },
        h('label', null, cb, h('span', { class: 'cal-name' }, c.name, c.type === 'birthday' ? ' 🎂' : '', S().defaultCalendar === c.id ? h('small', { class: 'cal-default' }, 'Standard') : null)), more);
      li.addEventListener('contextmenu', (e) => { e.preventDefault(); calendarMenu(c, more); });
      list.append(li);
    }
    const extra = U.$('#extraCalList');
    extra.innerHTML = '';
    const mk = (label, key, color) => {
      const cb = h('input', { type: 'checkbox', checked: !!S().settings[key], style: { '--c': color } });
      cb.addEventListener('change', () => Store.setSetting(key, cb.checked));
      return h('li', { class: 'cal-item' }, h('label', null, cb, h('span', { class: 'cal-name' }, label)));
    };
    extra.append(mk(`Feiertage${S().settings.holidayState !== 'ALL' ? ' (' + S().settings.holidayState + ')' : ''}`, 'holidays', '#0b8043'), mk('Aufgaben im Kalender', 'showTodosInCalendar', '#8e24aa'));
  }

  function calendarMenu(c, anchor) {
    const pal = h('div', { class: 'ctx-palette' }, ...U.PALETTE.map((p) => {
      const b = h('button', { class: 'swatch small' + (p.hex === c.color ? ' sel' : ''), title: p.name, style: { background: p.hex } });
      b.addEventListener('click', () => { Store.updateCalendar(c.id, { color: p.hex }); hideMenu(); });
      return b;
    }));
    const items = [
      ['Nur diesen anzeigen', () => { S().calendars.forEach((x) => { x.visible = x.id === c.id; }); Store.emit('calendars'); }],
      ['Alle anzeigen', () => { S().calendars.forEach((x) => { x.visible = true; }); Store.emit('calendars'); }],
      ...(c.type === 'subscription'
        ? [['Jetzt aktualisieren', () => Subs.refresh(c, { force: true, toast: true })], ['Abo entfernen …', () => Subs.remove(c)]]
        : [['Als Standard festlegen', () => { S().defaultCalendar = c.id; Store.emit('calendars'); }], ['Bearbeiten …', () => Dialogs.editCalendar(c)]]),
    ];
    showMenu(anchor, [h('div', { class: 'ctx-title' }, c.name), ...items.map(([l, fn]) => h('button', { class: 'ctx-item', onclick: () => { hideMenu(); fn(); } }, l)), h('div', { class: 'ctx-sep' }), pal]);
  }

  function showMenu(anchor, children) {
    const m = U.$('#ctxMenu');
    m.innerHTML = '';
    m.append(...children);
    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(window.innerWidth - mw - 8, r.left) + 'px';
    m.style.top = Math.min(window.innerHeight - mh - 8, r.bottom + 4) + 'px';
  }
  function hideMenu() { U.$('#ctxMenu').hidden = true; }

  // ---------- Navigation ----------
  function goto(d, v) {
    date = U.startOfDay(d);
    if (isMobile() && S().settings.sidebarOpen) { S().settings.sidebarOpen = false; applyPanels(); }
    if (v) setView(v, true);
    if (query) clearSearch(true);
    Views.resetMini();
    render();
  }
  function setView(v, silent) {
    view = v;
    Store.state.settings.view = v;
    Store.save();
    if (query) clearSearch(true);
    if (!silent) render();
  }
  function stepDate(d, dir) {
    if (view === 'day') return U.addDays(d, dir);
    if (view === 'week') return U.addDays(d, 7 * dir);
    if (view === 'month') return U.addMonths(U.startOfMonth(d), dir);
    if (view === 'year') return new Date(d.getFullYear() + dir, d.getMonth(), 1);
    return U.addDays(d, 30 * dir);
  }
  function step(dir, opts) {
    date = stepDate(date, dir);
    Views.resetMini();
    render(opts);
  }

  // ---------- Termine ----------
  function openEditor(data, onClose) { hidePopover(); return Dialogs.eventEditor(data, null, onClose); }

  function fmtWhen(o) {
    if (o.allDay) {
      const last = U.addDays(o.end, -1);
      return U.sameDay(o.start, last) ? U.fmtDateLong(o.start) : `${U.fmtDateShort(o.start)} – ${U.fmtDateShort(last)}`;
    }
    if (U.sameDay(o.start, o.end) || +o.end === +U.addDays(U.startOfDay(o.start), 1)) return `${U.fmtDateLong(o.start)} · ${U.fmtTime(o.start)} – ${U.fmtTime(o.end)}`;
    return `${U.fmtDateShort(o.start)} ${U.fmtTime(o.start)} – ${U.fmtDateShort(o.end)} ${U.fmtTime(o.end)}`;
  }

  function showPopover(o, anchor) {
    hideMenu();
    const p = U.$('#popover');
    p.innerHTML = '';
    const actions = h('div', { class: 'pop-actions' });
    if (o.kind === 'event' && !o.readonly) {
      actions.append(
        h('button', { class: 'icon-btn', title: 'Bearbeiten', onclick: () => { hidePopover(); Dialogs.eventEditor({}, o); } }, h('svg', { viewBox: '0 0 24 24', html: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>' })),
        h('button', { class: 'icon-btn', title: 'Duplizieren', onclick: () => { hidePopover(); duplicateEvent(o.ev); } }, h('svg', { viewBox: '0 0 24 24', html: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>' })),
        h('button', { class: 'icon-btn', title: 'Löschen', onclick: () => { hidePopover(); deleteOccurrence(o); } }, h('svg', { viewBox: '0 0 24 24', html: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>' })));
    }
    actions.append(h('button', { class: 'icon-btn', title: 'Schließen', onclick: hidePopover }, '✕'));
    p.append(actions);
    p.append(h('div', { class: 'pop-title' }, h('span', { class: 'pop-color', style: { background: o.color } }), h('div', null, h('div', { class: 'pop-name' }, o.title), h('div', { class: 'pop-when' }, fmtWhen(o)))));
    if (o.kind === 'holiday') p.append(h('div', { class: 'pop-line' }, '🎉 Gesetzlicher Feiertag'));
    if (o.kind === 'event') {
      const ev = o.ev;
      if (o.recurring) p.append(h('div', { class: 'pop-line' }, '↻ ', Recur.describe(ev.rrule, ev.start)));
      if (ev.location) {
        p.append(h('div', { class: 'pop-line' }, '📍 ', h('a', { href: 'https://www.google.com/maps/search/' + encodeURIComponent(ev.location), target: '_blank', rel: 'noopener' }, ev.location)));
      }
      if (ev.reminder != null) p.append(h('div', { class: 'pop-line' }, '🔔 ', ev.reminder === 0 ? 'Zu Beginn' : ev.reminder >= 1440 ? `${ev.reminder / 1440} Tag(e) vorher` : ev.reminder >= 60 ? `${ev.reminder / 60} Std. vorher` : `${ev.reminder} Min. vorher`));
      if (ev.notes) p.append(h('div', { class: 'pop-notes' }, ev.notes));
      p.append(h('div', { class: 'pop-line muted' }, h('span', { class: 'dot', style: { background: o.cal.color } }), ' ', o.cal.name));
    }
    p.hidden = false;
    position(p, anchor);
  }
  function showCustomPopover(content, anchor) {
    const p = U.$('#popover');
    p.innerHTML = '';
    p.append(h('div', { class: 'pop-actions' }, h('button', { class: 'icon-btn', onclick: hidePopover }, '✕')), content);
    p.hidden = false;
    position(p, anchor);
  }
  function position(p, anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = r.right + 8;
    if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
    let top = Math.min(r.top, window.innerHeight - ph - 8);
    p.style.left = left + 'px';
    p.style.top = Math.max(8, top) + 'px';
  }
  function hidePopover() { U.$('#popover').hidden = true; }

  const toStore = (ev, s, e) => ev.allDay
    ? { start: U.dateKey(s), end: U.dateKey(U.addDays(e, -1) < s ? s : U.addDays(e, -1)) }
    : { start: U.dtKey(s), end: U.dtKey(e) };

  async function moveOccurrence(o, ns, ne) {
    if (o.kind !== 'event') return;
    const ev = o.ev;
    if (o.recurring) {
      const scope = await Modal.choose('Wiederkehrenden Termin ändern', null, [
        { label: 'Nur diesen Termin', value: 'this' },
        { label: 'Alle Termine', value: 'all', primary: true },
      ]);
      if (!scope) { render(); return; }
      Store.snapshot();
      if (scope === 'this') {
        ev.exdates = [...(ev.exdates || []), U.dateKey(o.start)];
        const copy = { ...JSON.parse(JSON.stringify(ev)), id: undefined, rrule: null, exdates: [], ...toStore(ev, ns, ne) };
        delete copy.id;
        Store.addEvent(copy);
      } else {
        const { s, e } = Recur.bounds(ev);
        const ds = ns - o.start, de = ne - o.end;
        // Zeitverschiebung über Sommer-/Winterzeit hinweg in lokaler Zeit
        const shift = (d, ms) => { const dd = Math.round(ms / U.DAY_MS); const rest = ms - dd * U.DAY_MS; return U.addMinutes(U.addDays(d, dd), Math.round(rest / 60000)); };
        Store.updateEvent(ev.id, toStore(ev, shift(s, ds), shift(e, de)));
      }
    } else {
      Store.snapshot();
      Store.updateEvent(ev.id, toStore(ev, ns, ne));
    }
    toast('Termin verschoben', { undo: true });
  }

  function applyRecurringEdit(occ, out, scope) {
    const ev = occ.ev;
    Store.snapshot();
    if (scope === 'this') {
      ev.exdates = [...(ev.exdates || []), U.dateKey(occ.start)];
      Store.addEvent({ ...out, rrule: null, exdates: [] });
    } else if (scope === 'following' && occ.idx > 0) {
      const r = ev.rrule;
      if (r.count) r.count = occ.idx;
      else r.until = U.dateKey(U.addDays(occ.start, -1));
      const cut = U.dateKey(occ.start);
      Store.addEvent({ ...out, exdates: (ev.exdates || []).filter((x) => x >= cut) });
      Store.emit('events');
    } else {
      // Alle: Verschiebung relativ zum angeklickten Vorkommen auf die Serie übertragen
      const { s } = Recur.bounds(ev);
      const ns = U.parseDate(out.start), ne = U.parseDate(out.end);
      const dayShift = U.daysBetween(occ.start, ns);
      const seriesStart = U.addDays(s, dayShift);
      const st = out.allDay ? U.startOfDay(seriesStart) : new Date(seriesStart.getFullYear(), seriesStart.getMonth(), seriesStart.getDate(), ns.getHours(), ns.getMinutes());
      const dur = out.allDay ? U.daysBetween(ns, ne) : ne - ns;
      const en = out.allDay ? U.addDays(st, dur) : new Date(st.getTime() + dur);
      Store.updateEvent(ev.id, { ...out, start: out.allDay ? U.dateKey(st) : U.dtKey(st), end: out.allDay ? U.dateKey(en) : U.dtKey(en) });
    }
  }

  async function deleteOccurrence(o) {
    const ev = o.ev;
    if (o.recurring) {
      const scope = await Modal.choose('Wiederkehrenden Termin löschen', `„${ev.title || 'Ohne Titel'}“`, [
        { label: 'Nur diesen Termin', value: 'this' },
        { label: 'Diesen und alle folgenden', value: 'following' },
        { label: 'Alle Termine', value: 'all', danger: true },
      ]);
      if (!scope) return;
      Store.snapshot();
      if (scope === 'this') { ev.exdates = [...(ev.exdates || []), U.dateKey(o.start)]; Store.emit('events'); }
      else if (scope === 'following' && o.idx > 0) {
        if (ev.rrule.count) ev.rrule.count = o.idx; else ev.rrule.until = U.dateKey(U.addDays(o.start, -1));
        Store.emit('events');
      } else { S().events = S().events.filter((e) => e.id !== ev.id); Store.emit('events'); }
    } else {
      Store.removeEvent(ev.id);
    }
    toast('Termin gelöscht', { undo: true });
  }

  function duplicateEvent(ev) {
    const copy = JSON.parse(JSON.stringify(ev));
    delete copy.id;
    copy.title = (copy.title || '') + ' (Kopie)';
    const e = Store.addEvent(copy);
    toast('Termin dupliziert', { undo: false });
    Dialogs.eventEditor({}, { ev: e, start: Recur.bounds(e).s, end: Recur.bounds(e).e, idx: 0 });
  }

  // ---------- Aufgaben aus dem Kalender ----------
  function toggleTodo(id) {
    if (!Store.todo(id).done) Sound.cash();
    const done = Store.toggleTodo(id);
    toast(done ? 'Aufgabe erledigt ✓' : 'Aufgabe wieder offen', { undo: false });
  }

  // ---------- Suche ----------
  function clearSearch(silent) {
    query = '';
    U.$('#searchInput').value = '';
    if (!silent) render();
  }

  // ---------- Toasts ----------
  function toast(msg, { undo, type } = {}) {
    const box = U.$('#toasts');
    const t = h('div', { class: 'toast' + (type ? ' ' + type : '') }, h('span', null, msg));
    if (undo) t.append(h('button', { class: 'toast-btn', onclick: () => { Store.undo(); t.remove(); } }, 'Rückgängig'));
    box.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, undo ? 6000 : 2800);
  }

  // ---------- Design ----------
  function applyTheme() {
    const th = S().settings.theme;
    const dark = th === 'dark' || (th === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  // ---------- Erinnerungen ----------
  const FIRED_KEY = 'personal-kalender-fired';
  function checkReminders() {
    const now = new Date();
    let fired;
    try { fired = new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); } catch (e) { fired = new Set(); }
    const occ = Views.occurrences(U.addDays(now, -1), U.addDays(now, 8), { noExtras: true });
    let changed = false;
    for (const o of occ) {
      const rem = o.ev.reminder;
      if (rem == null) continue;
      const at = o.allDay ? U.addMinutes(U.addDays(o.start, 0), 9 * 60 - rem) : U.addMinutes(o.start, -rem);
      const key = o.key + '|' + rem;
      if (now >= at && now - at < 30 * 60000 && !fired.has(key)) {
        fired.add(key); changed = true;
        const body = o.allDay ? U.fmtDateLong(o.start) : `${U.fmtTime(o.start)} – ${U.fmtTime(o.end)}${o.ev.location ? ' · ' + o.ev.location : ''}`;
        toast(`🔔 ${o.title} · ${body}`);
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification(o.title, { body, tag: key });
        } catch (e) { /* ignore */ }
        beep();
      }
    }
    if (changed) localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-300)));
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch (e) { /* ignore */ }
  }
  function maybeAskNotify() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    if (S().events.some((e) => e.reminder != null)) { try { Notification.requestPermission(); } catch (e) { /* ignore */ } }
  }

  // ---------- Panels ----------
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  let narrowInit = isMobile();
  function applyPanels() {
    if (narrowInit) { narrowInit = false; Store.state.settings.sidebarOpen = false; Store.state.settings.todoOpen = false; }
    U.$$('#bottomNav [data-tab]').forEach((b) => b.classList.toggle('active', (b.dataset.tab === 'todo') === !!S().settings.todoOpen));
    document.body.classList.toggle('no-sidebar', !S().settings.sidebarOpen);
    document.body.classList.toggle('no-todos', !S().settings.todoOpen);
  }

  // ---------- Init ----------
  function bind() {
    U.$('#btnToday').addEventListener('click', () => goto(new Date()));
    U.$('#btnPrev').addEventListener('click', () => step(-1));
    U.$('#btnNext').addEventListener('click', () => step(1));
    U.$$('#viewSwitch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    U.$('#btnCreate').addEventListener('click', () => {
      const now = new Date();
      const base = U.sameDay(date, now) ? now : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9);
      const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours() + (U.sameDay(date, now) ? 1 : 0), 0);
      openEditor({ allDay: false, start: U.dtKey(s), end: U.dtKey(U.addMinutes(s, S().settings.defaultDuration || 60)) });
    });
    U.$('#btnAddCalendar').addEventListener('click', () => Dialogs.editCalendar(null));
    U.$('#btnSettings').addEventListener('click', () => Dialogs.settings());
    U.$('#btnTheme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme;
      Store.setSetting('theme', cur === 'dark' ? 'light' : 'dark');
      applyTheme();
    });
    U.$('#btnToggleSidebar').addEventListener('click', () => { Store.setSetting('sidebarOpen', !S().settings.sidebarOpen); applyPanels(); });
    U.$('#btnToggleTodos').addEventListener('click', () => { Store.setSetting('todoOpen', !S().settings.todoOpen); applyPanels(); });
    U.$('#viewSelect').addEventListener('change', (e) => setView(e.target.value));
    U.$('#sideBackdrop').addEventListener('click', () => { Store.setSetting('sidebarOpen', false); applyPanels(); });
    U.$('#fabCreate').addEventListener('click', () => U.$('#btnCreate').click());
    U.$('#syncStatus').addEventListener('click', () => Dialogs.settings());
    U.$$('#bottomNav [data-tab]').forEach((b) => b.addEventListener('click', () => {
      S().settings.todoOpen = b.dataset.tab === 'todo';
      S().settings.sidebarOpen = false;
      Store.save(); applyPanels();
    }));
    // Wischen zum Blättern (Handy)
    // Die Nachbar-Woche (bzw. Tag/Monat) gleitet mit dem Finger herein und rastet beim Loslassen ein.
    let sw = null, swAnim = false;
    const vc = U.$('#viewContainer');
    const gridScroll = (root) => { const s = root.querySelector('.tg-scroll'); return s ? s.scrollTop : null; };
    const swStart = () => {
      const scrollTop = gridScroll(vc);
      const cur = h('div', { class: 'swipe-pane' });
      cur.append(...vc.childNodes);
      const mk = (dir) => {
        const p = h('div', { class: 'swipe-pane' });
        Views.render(p, view, stepDate(date, dir), { scrollTop });
        p.className = 'swipe-pane side';
        return p;
      };
      sw.panes = [mk(-1), cur, mk(1)];
      vc.classList.add('swiping');
      vc.append(...sw.panes);
      // Scrollposition erst setzen, wenn die Seiten im Dokument sind
      if (scrollTop != null) sw.panes.forEach((p) => { const sc = p.querySelector('.tg-scroll'); if (sc) sc.scrollTop = scrollTop; });
      sw.w = vc.clientWidth;
      sw.scrollTop = scrollTop;
    };
    const swSet = (s, dx, anim) => s.panes.forEach((p, i) => {
      p.style.transition = anim ? 'transform .26s cubic-bezier(.2,.7,.3,1)' : 'none';
      p.style.transform = `translate3d(${(i - 1) * s.w + dx}px,0,0)`;
    });
    const swEnd = (dir) => {
      const s = sw; sw = null; swAnim = true;
      const panes = s.panes;
      swSet(s, -dir * s.w, true);
      setTimeout(() => {
        swAnim = false;
        if (dir) step(dir, { scrollTop: s.scrollTop });
        else { vc.classList.remove('swiping'); vc.replaceChildren(...panes[1].childNodes); }
      }, 270);
    };
    vc.addEventListener('touchstart', (e) => {
      sw = null;
      if (e.touches.length !== 1 || swAnim || query || view === 'agenda') return;
      sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: null, lx: e.touches[0].clientX, lt: Date.now(), v: 0 };
    }, { passive: true });
    vc.addEventListener('touchmove', (e) => {
      if (!sw) return;
      if (e.touches.length !== 1 || (!sw.mode && Views.isTouchBusy())) { if (sw.mode === 'h') swEnd(0); else sw = null; return; }
      const t = e.touches[0];
      const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      if (!sw.mode) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.mode = 'h'; sw.x = t.clientX; swStart(); swSet(sw, 0, false); }
        else if (Math.abs(dy) > 10) { sw = null; return; }
        else return;
      }
      if (e.cancelable) e.preventDefault();
      const now = Date.now();
      if (now > sw.lt) { sw.v = (t.clientX - sw.lx) / (now - sw.lt); sw.lx = t.clientX; sw.lt = now; }
      swSet(sw, t.clientX - sw.x, false);
    }, { passive: false });
    const swRelease = (e) => {
      if (!sw || sw.mode !== 'h') { sw = null; return; }
      const t = e.changedTouches[0];
      const dx = t ? t.clientX - sw.x : 0;
      let dir = 0;
      if (dx < -sw.w * 0.25 || (sw.v < -0.35 && dx < -20)) dir = 1;
      else if (dx > sw.w * 0.25 || (sw.v > 0.35 && dx > 20)) dir = -1;
      swEnd(dir);
    };
    vc.addEventListener('touchend', swRelease, { passive: true });
    vc.addEventListener('touchcancel', swRelease, { passive: true });

    const search = U.$('#searchInput');
    search.addEventListener('input', U.debounce(() => { query = search.value.trim(); render(); }, 200));
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearSearch(); search.blur(); } });

    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#popover') && !e.target.closest('.tg-event, .chip, .more-link, .agenda-item')) hidePopover();
      if (!e.target.closest('#ctxMenu') && !e.target.closest('.cal-more')) hideMenu();
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if (!U.$('#popover').hidden) { hidePopover(); return; }
        if (!U.$('#ctxMenu').hidden) { hideMenu(); return; }
        if (Modal.isOpen()) { Modal.close(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !Modal.isOpen()) {
        e.preventDefault();
        if (Store.undo()) toast('Rückgängig gemacht'); return;
      }
      if (typing || Modal.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map = { d: 'day', w: 'week', m: 'month', y: 'year', a: 'agenda' };
      if (map[k]) { setView(map[k]); e.preventDefault(); }
      else if (k === 't') goto(new Date());
      else if (k === 'arrowleft' || k === 'k' || k === 'p') step(-1);
      else if (k === 'arrowright' || k === 'j') step(1);
      else if (k === 'n' || k === 'c') { e.preventDefault(); U.$('#btnCreate').click(); }
      else if (k === 'q') { e.preventDefault(); if (!S().settings.todoOpen) { Store.setSetting('todoOpen', true); applyPanels(); } U.$('#todoAddInput').focus(); }
      else if (k === '/') { e.preventDefault(); search.focus(); }
      else if (e.key === '?') Dialogs.shortcuts();
    });

    // Mausrad-Navigation im Monat/Jahr mit Shift
    U.$('#viewContainer').addEventListener('wheel', (e) => {
      if ((view === 'month' || view === 'year') && e.shiftKey && Math.abs(e.deltaY) > 20) { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }
    }, { passive: false });

    let lastH = window.innerHeight;
    window.addEventListener('resize', U.debounce(() => {
      const hChanged = Math.abs(window.innerHeight - lastH) > 40; lastH = window.innerHeight;
      if (view === 'month' || (isMobile() && hChanged && (view === 'week' || view === 'day'))) render();
    }, 150));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    Store.subscribe((kind) => {
      if (kind === 'events') maybeAskNotify();
      render();
    });
    Todos.bind();
  }

  function tick() {
    const now = new Date();
    if (U.dateKey(now) !== lastDay) { lastDay = U.dateKey(now); render(); return; }
    const nl = U.$('.now-line');
    if (nl) nl.style.top = `${(U.minutesOfDay(now) / 60) * Views.hourPx()}px`;
    Todos.renderProgress();
    checkReminders();
  }

  function init() {
    applyTheme();
    applyPanels();
    bind();
    render();
    checkReminders();
    setInterval(tick, 30000);
    Sync.init();
    Subs.init();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      // Neue Version gefunden: einmal automatisch neu laden
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; Store.save(); location.reload(); } });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        const check = () => reg.update().catch(() => {});
        setInterval(check, 10 * 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      }).catch((e) => console.warn('Service Worker', e));
    }
  }

  return {
    init, render, goto, setView, openEditor, showPopover, showCustomPopover, hidePopover,
    moveOccurrence, applyRecurringEdit, deleteOccurrence, duplicateEvent, toggleTodo,
    clearSearch, toast, applyTheme,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
