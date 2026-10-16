/* Aufgabenliste mit Tagesfortschritt */
'use strict';

const Todos = (() => {
  const { h } = U;
  const PRIO = { 0: { name: 'Keine', color: 'var(--muted)' }, 1: { name: 'Hoch', color: '#e53935' }, 2: { name: 'Mittel', color: '#fb8c00' }, 3: { name: 'Niedrig', color: '#1e88e5' } };
  let expanded = null;
  let lastPct = null;

  const todayKey = () => U.dateKey(new Date());
  const isDoneToday = (t) => t.done && t.doneAt && U.sameDay(new Date(t.doneAt), new Date());

  // ---------- Fortschritt ----------
  function progress() {
    const S = Store.state;
    const tk = todayKey();
    const tasks = S.todos.filter((t) => (t.due && t.due === tk) || (t.due && t.due < tk && !t.done) || isDoneToday(t));
    const tDone = tasks.filter((t) => t.done).length;
    let evTotal = 0, evDone = 0;
    if (S.settings.progressCountsEvents) {
      const now = new Date();
      const from = U.startOfDay(now);
      const occ = Views.occurrences(from, U.addDays(from, 1), { noExtras: true }).filter((o) => !o.allDay && o.cal.type !== 'birthday' && U.sameDay(o.start, now));
      evTotal = occ.length;
      evDone = occ.filter((o) => o.end <= now).length;
    }
    const total = tasks.length + evTotal, done = tDone + evDone;
    return { total, done, pct: total ? Math.round((done / total) * 100) : null, tTotal: tasks.length, tDone, evTotal, evDone };
  }

  function renderProgress() {
    const p = progress();
    const ring = U.$('#ringFg');
    const C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${C}`;
    ring.style.strokeDashoffset = `${C * (1 - (p.pct ?? 0) / 100)}`;
    ring.classList.toggle('full', p.pct === 100);
    U.$('#progressPct').textContent = p.pct == null ? '–' : p.pct;
    const parts = [`${p.tDone}/${p.tTotal} Aufgaben`];
    if (Store.state.settings.progressCountsEvents) parts.push(`${p.evDone}/${p.evTotal} Termine`);
    U.$('#progressSub').textContent = parts.join(' · ');
    let msg;
    if (p.pct == null) msg = 'Heute ist noch nichts geplant.';
    else if (p.pct === 100) msg = 'Alles erledigt – stark! 🎉';
    else if (p.pct >= 75) msg = 'Fast geschafft!';
    else if (p.pct >= 50) msg = 'Über die Hälfte ist erledigt.';
    else if (p.pct > 0) msg = 'Guter Anfang, weiter so.';
    else msg = 'Los geht’s!';
    U.$('#progressMsg').textContent = msg;
    if (lastPct != null && lastPct < 100 && p.pct === 100) { celebrate(); if (Sound.recent()) moneyRain(); }
    lastPct = p.pct;
    document.title = (p.pct != null ? `${p.pct}% · ` : '') + 'Persönlicher Kalender';
    const np = U.$('#navPct'); if (np) np.textContent = p.pct != null ? p.pct + '%' : '';
  }

  function celebrate() {
    const card = U.$('#progressCard');
    const colors = ['#6d5efc', '#33b679', '#f6bf26', '#e67c73', '#039be5'];
    for (let i = 0; i < 28; i++) {
      const c = h('span', { class: 'confetti', style: { background: colors[i % colors.length], left: `${20 + Math.random() * 60}%`, '--dx': `${(Math.random() - 0.5) * 220}px`, '--dy': `${-60 - Math.random() * 120}px`, '--r': `${Math.random() * 720}deg` } });
      card.append(c);
      setTimeout(() => c.remove(), 1300);
    }
  }

  // Geldscheine fliegen über den ganzen Bildschirm
  const BILL = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fbf6a"/><stop offset="1" stop-color="#2f7d3a"/></linearGradient></defs>
<rect x="1" y="1" width="118" height="62" rx="5" fill="url(#g)" stroke="#1e5a28" stroke-width="2"/>
<rect x="7" y="7" width="106" height="50" rx="3" fill="none" stroke="#c9f0c9" stroke-opacity=".6" stroke-width="1.5"/>
<circle cx="60" cy="32" r="16" fill="#c9f0c9" fill-opacity=".85"/>
<text x="60" y="39" font-family="Arial,sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#1e5a28">€</text>
<text x="18" y="22" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#eaffea">100</text>
<text x="102" y="52" font-family="Arial,sans-serif" font-size="11" font-weight="700" text-anchor="end" fill="#eaffea">100</text></svg>`);
  function moneyRain() {
    U.$('.money-rain')?.remove();
    const few = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = few ? 10 : window.innerWidth < 700 ? 34 : 60;
    const box = h('div', { class: 'money-rain', 'aria-hidden': 'true' });
    for (let i = 0; i < n; i++) {
      const w = 54 + Math.random() * 46;
      box.append(h('img', { src: BILL, class: 'bill', alt: '', style: {
        width: w + 'px', left: `${Math.random() * 100}%`,
        '--d': `${2.4 + Math.random() * 1.8}s`, '--delay': `${Math.random() * 1.4}s`,
        '--x': `${(Math.random() - 0.5) * 260}px`, '--r0': `${Math.random() * 360}deg`, '--r1': `${(Math.random() - 0.5) * 900}deg`,
        '--s': `${1.4 + Math.random() * 1.6}`,
      } }));
    }
    box.addEventListener('click', () => box.remove());
    document.body.append(box);
    Sound.jackpot();
    setTimeout(() => box.remove(), 5200);
  }

  // ---------- Schnelleingabe ----------
  function parseQuick(text) {
    let t = ' ' + text + ' ';
    const res = { due: null, time: null, priority: 0, listId: null };
    const today = U.startOfDay(new Date());
    const take = (re, fn) => { const m = re.exec(t); if (m) { fn(m); t = t.replace(m[0], ' '); } };

    take(/\s!([1-3])(?=\s)/, (m) => { res.priority = +m[1]; });
    take(/\s#([\wäöüÄÖÜß-]+)(?=\s)/, (m) => {
      const name = m[1].toLowerCase();
      let l = Store.state.todoLists.find((x) => x.name.toLowerCase() === name) || Store.state.todoLists.find((x) => x.name.toLowerCase().startsWith(name));
      if (!l) l = Store.addTodoList({ name: m[1], color: U.PALETTE[Store.state.todoLists.length % U.PALETTE.length].hex });
      res.listId = l.id;
    });
    take(/\s(?:um\s)?(\d{1,2})(?::(\d{2}))?\s?uhr(?=\s)/i, (m) => { res.time = `${U.pad(+m[1] % 24)}:${U.pad(+(m[2] || 0))}`; });
    if (!res.time) take(/\s(?:um\s)?(\d{1,2}):(\d{2})(?=\s)/, (m) => { res.time = `${U.pad(+m[1] % 24)}:${m[2]}`; });
    take(/\s(heute|morgen|übermorgen)(?=\s)/i, (m) => {
      const w = m[1].toLowerCase();
      res.due = U.dateKey(U.addDays(today, w === 'heute' ? 0 : w === 'morgen' ? 1 : 2));
    });
    if (!res.due) take(/\s(?:am\s|nächsten\s|kommenden\s)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\s)/i, (m) => {
      const idx = U.WEEKDAYS.findIndex((w) => w.toLowerCase() === m[1].toLowerCase());
      let diff = (idx - today.getDay() + 7) % 7; if (diff === 0) diff = 7;
      res.due = U.dateKey(U.addDays(today, diff));
    });
    if (!res.due) take(/\s(?:am\s)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
      let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
      let d = new Date(y, +m[2] - 1, +m[1]);
      if (!m[3] && d < today) d = new Date(y + 1, +m[2] - 1, +m[1]);
      res.due = U.dateKey(d);
    });
    if (!res.due) take(/\sin\s(\d+)\s(tag|tagen|woche|wochen)(?=\s)/i, (m) => {
      res.due = U.dateKey(U.addDays(today, +m[1] * (m[2].toLowerCase().startsWith('w') ? 7 : 1)));
    });
    if (res.time && !res.due) res.due = U.dateKey(today);
    res.title = t.replace(/\s+/g, ' ').trim();
    return res;
  }

  // ---------- Liste ----------
  function filtered() {
    const S = Store.state;
    const f = S.settings.todoFilter;
    const lf = S.settings.todoListFilter;
    const tk = todayKey();
    let list = S.todos.filter((t) => !lf || t.listId === lf);
    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.priority || 9) - (b.priority || 9) || byOrder(a, b);
    const groups = [];
    if (f === 'today') {
      const overdue = list.filter((t) => !t.done && t.due && t.due < tk).sort(byDue);
      const today = list.filter((t) => !t.done && t.due === tk).sort((a, b) => (a.priority || 9) - (b.priority || 9) || (a.time || '99').localeCompare(b.time || '99') || byOrder(a, b));
      const done = list.filter((t) => isDoneToday(t) || (t.done && t.due === tk)).sort((a, b) => b.doneAt - a.doneAt);
      if (overdue.length) groups.push({ title: 'Überfällig', cls: 'overdue', items: overdue });
      groups.push({ title: 'Heute', items: today, empty: 'Keine offenen Aufgaben für heute.' });
      if (done.length) groups.push({ title: `Erledigt (${done.length})`, items: done, cls: 'done-group' });
    } else if (f === 'upcoming') {
      const up = list.filter((t) => !t.done && t.due && t.due > tk).sort(byDue);
      const map = new Map();
      for (const t of up) { if (!map.has(t.due)) map.set(t.due, []); map.get(t.due).push(t); }
      for (const [k, items] of map) groups.push({ title: `${U.relDay(U.parseDate(k))} · ${U.fmtDateShort(U.parseDate(k))}`, items, date: k });
      if (!groups.length) groups.push({ title: 'Geplant', items: [], empty: 'Keine geplanten Aufgaben.' });
    } else if (f === 'done') {
      groups.push({ title: 'Erledigt', items: list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)), empty: 'Noch nichts erledigt.' });
    } else {
      const open = list.filter((t) => !t.done);
      const withDate = open.filter((t) => t.due).sort(byDue);
      const noDate = open.filter((t) => !t.due).sort(byOrder);
      if (withDate.length) groups.push({ title: 'Mit Datum', items: withDate });
      groups.push({ title: 'Ohne Datum', items: noDate, empty: withDate.length ? null : 'Keine offenen Aufgaben. 🎉', sortable: true });
    }
    return groups;
  }

  function render() {
    const S = Store.state;
    U.$$('#todoTabs button').forEach((b) => b.classList.toggle('active', b.dataset.filter === S.settings.todoFilter));
    const isProj = S.settings.todoFilter === 'projects';
    U.$('#projTab').classList.toggle('active', isProj);
    const pc = Projects.openCount();
    U.$('#projCount').textContent = pc || '';
    U.$('.todo-panel').classList.toggle('show-projects', isProj);
    if (isProj) {
      const box = U.$('#todoItems');
      const scroll = box.scrollTop;
      box.innerHTML = '';
      Projects.render(box);
      box.scrollTop = scroll;
      renderProgress();
      return;
    }
    // Listen-Chips
    const chips = U.$('#todoListChips');
    chips.innerHTML = '';
    const counts = {};
    for (const t of S.todos) if (!t.done) counts[t.listId] = (counts[t.listId] || 0) + 1;
    const all = h('button', { class: 'list-chip' + (!S.settings.todoListFilter ? ' active' : '') }, 'Alle Listen');
    all.addEventListener('click', () => Store.setSetting('todoListFilter', null));
    chips.append(all);
    for (const l of S.todoLists) {
      const c = h('button', { class: 'list-chip' + (S.settings.todoListFilter === l.id ? ' active' : ''), style: { '--c': l.color }, title: 'Doppelklick oder Rechtsklick zum Bearbeiten' },
        h('span', { class: 'dot', style: { background: l.color } }), l.name, counts[l.id] ? h('span', { class: 'cnt' }, counts[l.id]) : null);
      c.addEventListener('click', () => Store.setSetting('todoListFilter', S.settings.todoListFilter === l.id ? null : l.id));
      c.addEventListener('dblclick', () => Dialogs.editTodoList(l));
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); Dialogs.editTodoList(l); });
      chips.append(c);
    }
    const add = h('button', { class: 'list-chip add', title: 'Neue Liste' }, '+ Liste');
    add.addEventListener('click', () => Dialogs.editTodoList(null));
    chips.append(add);

    // Einträge
    const box = U.$('#todoItems');
    const scroll = box.scrollTop;
    box.innerHTML = '';
    for (const g of filtered()) {
      const sec = h('section', { class: 'todo-group ' + (g.cls || '') });
      sec.append(h('div', { class: 'tg-title' }, g.title, g.items.length && !g.cls ? h('span', { class: 'cnt' }, g.items.length) : null));
      if (!g.items.length && g.empty) sec.append(h('div', { class: 'todo-empty' }, g.empty));
      for (const t of g.items) sec.append(item(t, g.sortable));
      box.append(sec);
    }
    box.scrollTop = scroll;
    renderProgress();
  }

  function item(t, sortable) {
    const list = Store.todoList(t.listId);
    const tk = todayKey();
    const overdue = !t.done && t.due && t.due < tk;
    const subDone = t.subtasks.filter((s) => s.done).length;
    const el = h('div', { class: 'todo-item' + (t.done ? ' done' : '') + (expanded === t.id ? ' expanded' : ''), dataset: { id: t.id } });

    const check = h('button', { class: 'todo-check', title: t.done ? 'Als offen markieren' : 'Erledigt', style: { '--p': PRIO[t.priority || 0].color } },
      h('svg', { viewBox: '0 0 24 24', html: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' }));
    check.addEventListener('click', (e) => { e.stopPropagation(); toggle(t.id, el); });

    const meta = h('div', { class: 'todo-meta' });
    if (t.due) meta.append(h('span', { class: 'tm-due' + (overdue ? ' overdue' : t.due === tk ? ' today' : '') }, '📅 ' + U.relDay(U.parseDate(t.due)) + (t.time ? ' ' + t.time : '')));
    if (list && !Store.state.settings.todoListFilter) meta.append(h('span', { class: 'tm-list' }, h('span', { class: 'dot', style: { background: list.color } }), list.name));
    if (t.subtasks.length) meta.append(h('span', { class: 'tm-sub' }, `☑ ${subDone}/${t.subtasks.length}`));
    if (t.priority) meta.append(h('span', { class: 'tm-prio', style: { color: PRIO[t.priority].color } }, '⚑ ' + PRIO[t.priority].name));

    const main = h('div', { class: 'todo-main' }, h('div', { class: 'todo-title' }, t.title || '(Ohne Titel)'),
      t.notes && expanded !== t.id ? h('div', { class: 'todo-desc' }, t.notes) : null, meta.childNodes.length ? meta : null);
    main.addEventListener('click', () => { expanded = expanded === t.id ? null : t.id; render(); });

    const del = h('button', { class: 'icon-btn small todo-del', title: 'Löschen' }, h('svg', { viewBox: '0 0 24 24', html: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>' }));
    del.addEventListener('click', (e) => { e.stopPropagation(); Store.removeTodo(t.id); App.toast('Aufgabe gelöscht', { undo: true }); });

    const row = h('div', { class: 'todo-row' }, sortable ? h('span', { class: 'grip', title: 'Ziehen zum Sortieren' }, '⋮⋮') : null, check, main, del);
    el.append(row);

    if (expanded === t.id) el.append(detail(t));

    if (sortable) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/todo', t.id); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/todo')) { e.preventDefault(); el.classList.add('drop-target'); } });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/todo');
        if (!id || id === t.id) return;
        const sec = el.parentNode;
        const ids = U.$$('.todo-item', sec).map((x) => x.dataset.id).filter((x) => x !== id);
        ids.splice(ids.indexOf(t.id), 0, id);
        ids.forEach((x, i) => { Store.todo(x).order = i; });
        Store.emit('todos');
      });
    }
    return el;
  }

  function detail(t) {
    const S = Store.state;
    const d = h('div', { class: 'todo-detail' });
    const title = h('input', { class: 'td-title', value: t.title, placeholder: 'Titel' });
    title.addEventListener('change', () => Store.updateTodo(t.id, { title: title.value.trim() || t.title }));
    const notes = h('textarea', { class: 'td-notes', placeholder: 'Beschreibung …', rows: 2 }, t.notes || '');
    notes.addEventListener('change', () => Store.updateTodo(t.id, { notes: notes.value }));
    const due = h('input', { type: 'date', value: t.due || '' });
    due.addEventListener('change', () => Store.updateTodo(t.id, { due: due.value || null }));
    const time = h('input', { type: 'time', value: t.time || '' });
    time.addEventListener('change', () => Store.updateTodo(t.id, { time: time.value || null, due: t.due || (time.value ? todayKey() : null) }));
    const prio = h('select', null, ...[0, 1, 2, 3].map((p) => h('option', { value: p, selected: (t.priority || 0) === p }, p ? `⚑ ${PRIO[p].name}` : 'Keine Priorität')));
    prio.addEventListener('change', () => Store.updateTodo(t.id, { priority: +prio.value }));
    const listSel = h('select', null, ...S.todoLists.map((l) => h('option', { value: l.id, selected: l.id === t.listId }, l.name)));
    listSel.addEventListener('change', () => Store.updateTodo(t.id, { listId: listSel.value }));

    const quick = h('div', { class: 'td-quick' },
      ...[['Heute', 0], ['Morgen', 1], ['Nächste Woche', 7]].map(([lbl, n]) => h('button', { class: 'pill', onclick: () => Store.updateTodo(t.id, { due: U.dateKey(U.addDays(new Date(), n)) }) }, lbl)),
      h('button', { class: 'pill', onclick: () => Store.updateTodo(t.id, { due: null, time: null }) }, 'Kein Datum'));

    // Unteraufgaben
    const subs = h('div', { class: 'td-subs' });
    for (const s of t.subtasks) {
      const cb = h('input', { type: 'checkbox', checked: s.done });
      cb.addEventListener('change', () => { s.done = cb.checked; Store.emit('todos'); });
      const inp = h('input', { class: 'sub-title', value: s.title });
      inp.addEventListener('change', () => { s.title = inp.value; Store.emit('todos'); });
      const x = h('button', { class: 'icon-btn small', title: 'Entfernen', onclick: () => { t.subtasks = t.subtasks.filter((z) => z !== s); Store.emit('todos'); } }, '×');
      subs.append(h('label', { class: 'sub' + (s.done ? ' done' : '') }, cb, inp, x));
    }
    const subAdd = h('input', { class: 'sub-add', placeholder: '+ Unteraufgabe hinzufügen' });
    subAdd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && subAdd.value.trim()) {
        t.subtasks.push({ id: U.uid(), title: subAdd.value.trim(), done: false });
        Store.emit('todos');
        setTimeout(() => { const n = U.$(`.todo-item[data-id="${t.id}"] .sub-add`); n && n.focus(); });
      }
    });
    subs.append(subAdd);

    const toCal = h('button', { class: 'btn btn-ghost small' }, '📅 Als Termin eintragen');
    toCal.addEventListener('click', () => {
      const day = t.due ? U.parseDate(t.due) : new Date();
      const [hh, mm] = (t.time || '09:00').split(':').map(Number);
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
      App.openEditor({ title: t.title, notes: t.notes, allDay: false, start: U.dtKey(s), end: U.dtKey(U.addMinutes(s, 60)) });
    });

    d.append(title, notes,
      h('div', { class: 'td-grid' }, h('label', null, 'Datum', due), h('label', null, 'Uhrzeit', time), h('label', null, 'Priorität', prio), h('label', null, 'Liste', listSel)),
      quick, h('div', { class: 'td-label' }, 'Unteraufgaben'), subs, h('div', { class: 'td-actions' }, toCal));
    return d;
  }

  function toggle(id, el) {
    const t = Store.todo(id);
    if (!t.done) Sound.cash();
    if (!t.done && el) {
      el.classList.add('completing');
      setTimeout(() => { Store.toggleTodo(id); }, 380);
    } else {
      Store.toggleTodo(id);
    }
  }

  function bind() {
    U.$$('#todoTabs button').forEach((b) => b.addEventListener('click', () => { expanded = null; Store.setSetting('todoFilter', b.dataset.filter); }));
    U.$('#projTab').addEventListener('click', () => { expanded = null; Store.setSetting('todoFilter', Store.state.settings.todoFilter === 'projects' ? 'today' : 'projects'); });
    bindAdd();
  }

  // ---------- Eingabe-Karte: Titel, Wann, Extras ----------
  const ICO = {
    cal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    flag: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.5h1.4v13H3zM4.4 2h8.6l-2 3.2 2 3.3H4.4z"/></svg>',
  };
  const WHEN = [['Heute', 0], ['Morgen', 1], ['In 1 Woche', 7], ['In 2 Wochen', 14]];

  function bindAdd() {
    const form = U.$('#todoAddForm'), input = U.$('#todoAddInput'), notesIn = U.$('#todoAddNotes');
    const descBtn = U.$('#todoAddDescBtn'), whenEl = U.$('#todoAddWhen'), weekEl = U.$('#todoAddWeek'), calEl = U.$('#todoAddCal');
    const extrasEl = U.$('#todoAddExtras'), extraEl = U.$('#todoAddExtra'), sumEl = U.$('#todoAddSum'), panel = U.$('#todoPanel');
    const mobile = window.matchMedia('(max-width: 820px)');
    // Was der Nutzer selbst gewählt hat; alles andere kommt aus dem Text oder dem Standard
    let picked = {}, extra = null, calMonth = null, weekStart = null;

    const defDue = () => {
      const f = Store.state.settings.todoFilter;
      return f === 'today' ? todayKey() : f === 'upcoming' ? U.dateKey(U.addDays(new Date(), 1)) : null;
    };
    const defList = () => Store.state.settings.todoListFilter || Store.state.todoLists[0]?.id;
    // Vorschau ohne Listen anzulegen
    const previewText = () => input.value.replace(/#([\wäöüÄÖÜß-]+)/g, (m, name) => Store.state.todoLists.some((l) => l.name.toLowerCase().startsWith(name.toLowerCase())) ? m : '');
    function current() {
      const p = input.value.trim() ? parseQuick(previewText()) : { due: null, time: null, priority: 0, listId: null };
      const has = (k) => Object.prototype.hasOwnProperty.call(picked, k);
      return {
        due: has('due') ? picked.due : (p.due || defDue()),
        time: has('time') ? picked.time : p.time,
        priority: has('priority') ? picked.priority : p.priority,
        listId: has('listId') ? picked.listId : (p.listId || defList()),
        color: picked.color || null,
      };
    }
    const pick = (patch) => { Object.assign(picked, patch); draw(); };
    const offsetOf = (key) => key ? U.daysBetween(new Date(), U.parseDate(key)) : null;

    function chip(label, on, onclick, opts = {}) {
      return h('button', { type: 'button', class: 'ta-chip' + (on ? ' on' : '') + (opts.ghost ? ' ghost' : ''), onclick, title: opts.title },
        opts.ico ? h('span', { class: 'ta-ico', html: opts.ico, style: opts.icoColor ? { color: opts.icoColor } : null }) : null,
        opts.dot ? h('span', { class: 'dot', style: { background: opts.dot } }) : null, label);
    }

    function drawCal(due) {
      calEl.hidden = !calMonth;
      if (!calMonth) return;
      const today = U.startOfDay(new Date());
      const first = U.startOfWeek(calMonth, 1);
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = U.addDays(first, i);
        if (i >= 35 && d.getMonth() !== calMonth.getMonth()) break;
        const k = U.dateKey(d), out = d.getMonth() !== calMonth.getMonth(), past = d < today;
        cells.push(h('button', { type: 'button', disabled: past, class: 'ta-day' + (out ? ' out' : '') + (U.sameDay(d, today) ? ' today' : '') + (k === due ? ' sel' : '') + (d.getDay() % 6 === 0 ? ' we' : ''),
          onclick: () => { calMonth = null; pick({ due: k }); } }, d.getDate()));
      }
      calEl.replaceChildren(
        h('div', { class: 'ta-cal-head' },
          h('button', { type: 'button', class: 'ta-nav', title: 'Voriger Monat', onclick: () => { calMonth = U.addMonths(calMonth, -1); draw(); } }, '‹'),
          h('b', null, `${U.MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}`),
          h('button', { type: 'button', class: 'ta-nav', title: 'Nächster Monat', onclick: () => { calMonth = U.addMonths(calMonth, 1); draw(); } }, '›')),
        h('div', { class: 'ta-grid' }, ...['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => h('span', { class: 'ta-wd' }, w)), ...cells));
    }

    function drawWeek(due) {
      const base = weekStart || U.startOfWeek(due ? U.parseDate(due) : new Date(), 1);
      const today = U.startOfDay(new Date());
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(base, i), k = U.dateKey(d);
        days.push(h('button', { type: 'button', disabled: d < today, class: 'ta-wday' + (k === due ? ' sel' : '') + (U.sameDay(d, today) ? ' today' : ''), onclick: () => pick({ due: k }) },
          h('small', null, U.WEEKDAYS_SHORT[d.getDay()]), h('b', null, d.getDate())));
      }
      const shift = (n) => { weekStart = U.addDays(base, n); draw(); };
      weekEl.replaceChildren(h('button', { type: 'button', class: 'ta-nav', title: 'Woche zurück', onclick: () => shift(-7) }, '‹'), ...days,
        h('button', { type: 'button', class: 'ta-nav', title: 'Woche vor', onclick: () => shift(7) }, '›'));
    }

    function drawExtra(c) {
      extraEl.hidden = !extra;
      if (!extra) return;
      const S = Store.state;
      let body;
      if (extra === 'time') {
        const t = h('input', { type: 'time', value: c.time || '' });
        t.addEventListener('change', () => pick({ time: t.value || null }));
        body = [t, h('button', { type: 'button', class: 'pill', onclick: () => { extra = null; pick({ time: null }); } }, 'Keine Uhrzeit')];
        setTimeout(() => t.focus(), 0);
      } else if (extra === 'prio') {
        body = [1, 2, 3, 0].map((p) => chip(p ? PRIO[p].name : 'Keine', c.priority === p, () => { extra = null; pick({ priority: p }); }, { ico: ICO.flag, icoColor: PRIO[p].color }));
      } else if (extra === 'list') {
        body = S.todoLists.map((l) => chip(l.name, c.listId === l.id, () => { extra = null; pick({ listId: l.id }); }, { dot: l.color }));
      } else {
        const list = Store.todoList(c.listId);
        body = [Dialogs.colorPicker(c.color, list ? list.color : '#616161', (col) => { picked.color = col; drawChips(current()); }, 'Farbe der Liste').el];
      }
      extraEl.replaceChildren(...body);
    }

    function drawChips(c) {
      const off = offsetOf(c.due);
      const preset = WHEN.some(([, n]) => n === off);
      whenEl.replaceChildren(
        ...WHEN.map(([lbl, n]) => chip(lbl, c.due && off === n, () => { calMonth = null; weekStart = null; pick({ due: U.dateKey(U.addDays(new Date(), n)) }); })),
        chip(c.due && !preset ? U.fmtDateShort(U.parseDate(c.due)) : 'Datum …', (c.due && !preset) || !!calMonth, () => {
          calMonth = calMonth ? null : U.startOfMonth(c.due ? U.parseDate(c.due) : new Date()); draw();
        }, { ico: ICO.cal, ghost: !(c.due && !preset), title: 'Tag im Kalender wählen' }),
        chip('Ohne Datum', !c.due, () => { calMonth = null; pick({ due: null, time: null }); }, { ghost: true }));
      const list = Store.todoList(c.listId);
      const tgl = (k) => () => { extra = extra === k ? null : k; draw(); };
      extrasEl.replaceChildren(
        chip(c.time || 'Uhrzeit', !!c.time || extra === 'time', tgl('time'), { ico: ICO.clock, ghost: !c.time }),
        chip(c.priority ? PRIO[c.priority].name : 'Priorität', !!c.priority || extra === 'prio', tgl('prio'), { ico: ICO.flag, icoColor: c.priority ? PRIO[c.priority].color : null, ghost: !c.priority }),
        list ? chip('# ' + list.name, extra === 'list', tgl('list')) : null,
        chip('Farbe', extra === 'color', tgl('color'), { dot: c.color || (list ? list.color : '#616161') }));
      // Zusammenfassung
      const bits = [c.due ? '📅 ' + U.fmtDateShort(U.parseDate(c.due)) + (c.time ? ' · ' + c.time : '') : 'Ohne Datum'];
      if (c.priority) bits.push('⚑ ' + PRIO[c.priority].name);
      if (list && !Store.state.settings.todoListFilter) bits.push('# ' + list.name);
      sumEl.textContent = bits.join(' · ');
    }

    function draw() {
      const c = current();
      drawChips(c); drawCal(c.due); drawWeek(c.due); drawExtra(c);
      form.classList.toggle('has-text', !!(input.value.trim() || notesIn.value.trim() || Object.keys(picked).length));
    }

    const grow = () => { notesIn.style.height = 'auto'; notesIn.style.height = Math.min(notesIn.scrollHeight, 180) + 'px'; };
    const showDesc = (on) => { notesIn.hidden = !on; descBtn.hidden = on; };
    descBtn.addEventListener('click', () => { showDesc(true); notesIn.focus(); });
    notesIn.addEventListener('input', () => { grow(); form.classList.toggle('has-text', true); });
    notesIn.addEventListener('blur', () => { if (!notesIn.value.trim()) showDesc(false); });

    // Handy: Eingabe als Blatt von unten
    let openedAt = 0;
    const open = () => { if (mobile.matches && !form.classList.contains('open')) { openedAt = Date.now(); form.classList.add('open'); panel.classList.add('adding'); draw(); } };
    const close = () => { form.classList.remove('open'); panel.classList.remove('adding'); input.blur(); };
    input.addEventListener('focus', open);
    // Knöpfe nehmen dem Titel nicht den Fokus, sonst klappt die Karte zu
    form.addEventListener('mousedown', (e) => { if (e.target.closest('.ta-chip, .ta-day, .ta-wday, .ta-nav, .ta-desc-btn, .pill')) e.preventDefault(); });
    U.$('#todoAddClose').addEventListener('click', () => { resetForm(); close(); });
    // Der Tipp, der das Blatt öffnet, landet sonst gleich auf dem Hintergrund und schließt es wieder
    U.$('#todoAddBackdrop').addEventListener('click', () => { if (Date.now() - openedAt > 400) close(); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); resetForm(); close(); } });

    function resetForm() {
      input.value = ''; notesIn.value = ''; grow(); showDesc(false);
      picked = {}; extra = null; calMonth = null; weekStart = null;
      updateHint(''); draw();
    }

    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = input.value.trim();
      const desc = notesIn.value.trim();
      if (!txt || busy) { if (!txt) input.focus(); return; }
      const S = Store.state;
      // KI nur, wenn nichts von Hand gewählt wurde
      if (AI.enabled() && navigator.onLine && !Object.keys(picked).length) {
        busy = true;
        const hint = U.$('#todoHint');
        hint.textContent = '✨ KI liest deine Eingabe …'; hint.classList.add('live', 'ai-busy');
        input.readOnly = true;
        try {
          const items = await AI.ask(txt);
          const made = AI.apply(items, defList(), desc);
          if (made.length) {
            resetForm();
            if (mobile.matches) close();
            App.toast('✨ ' + AI.summary(made), { undo: true });
            return;
          }
        } catch (err) {
          console.error(err);
          App.toast((err.userMsg || 'KI gerade nicht erreichbar.') + ' Normal eingetragen.', { type: 'error' });
        } finally {
          busy = false; input.readOnly = false; hint.classList.remove('ai-busy');
        }
      }
      const c = current();
      const p = parseQuick(txt); // legt neue #Listen jetzt wirklich an
      const listId = Object.prototype.hasOwnProperty.call(picked, 'listId') ? picked.listId : (p.listId || defList());
      Store.addTodo({ title: p.title || txt, notes: desc, due: c.due, time: c.due ? c.time : null, priority: c.priority, listId, color: c.color });
      resetForm();
      if (mobile.matches) { close(); App.toast('Aufgabe hinzugefügt'); } else input.focus();
    });

    const updateHint = (v) => {
      const hint = U.$('#todoHint');
      if (!v.trim()) { hint.textContent = AI.enabled() ? '✨ KI an: schreib einfach, was zu tun ist und wann' : 'Tipp: „Zahnarzt anrufen morgen 14:00 !1 #Privat“'; hint.classList.remove('live'); return; }
      if (AI.enabled() && !Object.keys(picked).length) { hint.textContent = '✨ Enter: KI erkennt Aufgabe, Tag und Uhrzeit'; hint.classList.add('live'); return; }
      hint.textContent = ''; hint.classList.remove('live');
    };
    input.addEventListener('input', () => { updateHint(previewText()); draw(); });
    // Filter oder Listen geändert: Standardwerte neu zeigen
    Store.subscribe((kind) => { if ((kind === 'settings' || kind === 'todos') && !extraEl.contains(document.activeElement)) draw(); });
    updateHint('');
    draw();
  }

  return { render, renderProgress, bind, toggle, parseQuick, progress };
})();
