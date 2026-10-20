/* Kalenderansichten: Tag, Woche, Monat, Jahr, Liste */
'use strict';

const Views = (() => {
  const { h } = U;
  let HOUR_PX = 48;        // Höhe einer Stunde; am Handy so, dass der ganze Tag ab Tagesbeginn passt
  const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
  const SNAP = 15;
  const LONG_MS = 450;     // so lange muss man auf dem Handy drücken, um einen Termin anzulegen
  const TOUCH_SLOP = 10;   // mehr Bewegung = Wischen/Scrollen statt langem Druck
  let touchBusy = false;   // läuft gerade ein Ziehen nach langem Druck? Dann kein Wischen
  let carry = null;        // Termin, der über den Wochenrand in die nächste/vorige Woche getragen wird
  const EDGE_MS = 550;     // so lange am Rand verweilen, bis umgeblättert wird
  const vibrate = () => { try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* egal */ } };

  // Langer Druck auf dem Handy (nur Touch). Kurzes Tippen ruft onTap auf.
  function onLongPress(el, cb, onTap) {
    let lp = null, suppressClick = false;
    el.addEventListener('pointerdown', (e) => {
      suppressClick = false;
      if (e.pointerType !== 'touch') return;
      const st = { x: e.clientX, y: e.clientY, target: e.target };
      st.timer = setTimeout(() => { lp = null; suppressClick = true; vibrate(); cb(st.target); }, LONG_MS);
      lp = st;
    });
    el.addEventListener('pointermove', (e) => {
      if (lp && (Math.abs(e.clientX - lp.x) > TOUCH_SLOP || Math.abs(e.clientY - lp.y) > TOUCH_SLOP)) { clearTimeout(lp.timer); lp = null; suppressClick = true; }
    });
    const end = (e) => { if (lp) { clearTimeout(lp.timer); lp = null; if (e.type === 'pointerup') suppressClick = 'tap'; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => { end(e); suppressClick = true; });
    el.addEventListener('contextmenu', (e) => { if (e.pointerType === 'touch' || suppressClick) e.preventDefault(); });
    // gibt zurück: 'mouse' (normaler Klick), 'tap' (kurz getippt) oder false (schon erledigt)
    return (e) => {
      const r = suppressClick === 'tap' ? 'tap' : suppressClick ? false : 'mouse';
      suppressClick = false;
      return r;
    };
  }

  // ---------- Prüfungen in Abos erkennen ----------
  const EXAM_BG = '#f6d3cf';
  let examCache = { words: null, re: null };
  function examRe() {
    const words = Store.state.settings.examWords || '';
    if (examCache.words !== words) {
      const list = words.split(',').map((w) => w.trim()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      // Wortanfang reicht: „Prüfung“ trifft auch „Prüfungstermin“
      examCache = { words, re: list.length ? new RegExp('(^|[^\\p{L}])(' + list.join('|') + ')', 'iu') : null };
    }
    return examCache.re;
  }
  const isExam = (ev, cal) => cal.type === 'subscription' && !!examRe()?.test([ev.title, ev.categories, ev.notes].join('\n'));
  const examBadge = (o) => (o.exam ? h('span', { class: 'exam-badge' }, 'Prüfung') : null);

  // ---------- Daten für einen Zeitraum ----------
  function occurrences(from, to, opts = {}) {
    const S = Store.state;
    const out = [];
    const calMap = Object.fromEntries(S.calendars.map((c) => [c.id, c]));
    for (const ev of S.events) {
      const cal = calMap[ev.calId];
      if (!cal || (!cal.visible && !opts.includeHidden)) continue;
      const exam = isExam(ev, cal);
      for (const o of Recur.expand(ev, from, to)) {
        let title = ev.title || '(Ohne Titel)';
        if (cal.type === 'birthday') {
          title = '🎂 ' + title;
          if (ev.birthYear) {
            const age = o.start.getFullYear() - ev.birthYear;
            if (age > 0) title += ` (${age})`;
          }
        }
        out.push({
          kind: 'event', id: ev.id, ev, cal, start: o.start, end: o.end, idx: o.idx, readonly: cal.type === 'subscription',
          allDay: !!ev.allDay, title, exam, color: exam ? EXAM_BG : ev.color || cal.color, recurring: !!(ev.rrule && ev.rrule.freq),
          key: ev.id + '|' + U.dateKey(o.start),
        });
      }
    }
    if (S.settings.holidays && !opts.noExtras) {
      for (const hd of Holidays.inRange(from, to, S.settings.holidayState)) {
        out.push({ kind: 'holiday', id: 'hol-' + hd.key, start: hd.date, end: U.addDays(hd.date, 1), allDay: true, title: hd.name, color: '#0b8043', readonly: true, key: 'hol' + hd.key });
      }
    }
    if (S.settings.showTodosInCalendar && !opts.noExtras) {
      for (const t of S.todos) {
        if (!t.due) continue;
        const d = U.parseDate(t.due);
        if (d < U.startOfDay(from) || d >= to) continue;
        const list = Store.todoList(t.listId);
        out.push({ kind: 'todo', id: t.id, todo: t, start: d, end: U.addDays(d, 1), allDay: true,
          title: (t.time ? t.time + ' ' : '') + t.title, color: t.color || (list ? list.color : '#6d5efc'), done: t.done, key: 'todo' + t.id });
      }
    }
    return out;
  }

  const sortOcc = (a, b) => {
    const ka = a.kind === 'holiday' ? 0 : a.kind === 'todo' ? 2 : 1;
    const kb = b.kind === 'holiday' ? 0 : b.kind === 'todo' ? 2 : 1;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (ka !== kb) return ka - kb;
    if (+a.start !== +b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  };

  function chipStyle(color, past) {
    return { background: color, color: U.textOn(color), opacity: past ? 0.62 : 1, '--ev': color };
  }

  // ---------- Zeitraum & Titel ----------
  function range(view, date) {
    const ws = Store.state.settings.weekStart;
    switch (view) {
      case 'day': { const s = U.startOfDay(date); return { from: s, to: U.addDays(s, 1), days: 1 }; }
      case 'week': { const s = U.startOfWeek(date, ws); return { from: s, to: U.addDays(s, 7), days: 7 }; }
      case 'month': {
        const first = U.startOfMonth(date);
        const s = U.startOfWeek(first, ws);
        const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const weeks = Math.ceil((U.daysBetween(s, last) + 1) / 7);
        return { from: s, to: U.addDays(s, weeks * 7), weeks };
      }
      case 'year': return { from: new Date(date.getFullYear(), 0, 1), to: new Date(date.getFullYear() + 1, 0, 1) };
      default: { const s = U.startOfDay(date); return { from: s, to: U.addDays(s, 60) }; }
    }
  }

  function title(view, date) {
    if (view === 'day') return { main: `${date.getDate()}. ${U.MONTHS[date.getMonth()]} ${date.getFullYear()}`, sub: U.WEEKDAYS[date.getDay()] + ' · KW ' + U.isoWeek(date) };
    if (view === 'week') {
      const { from } = range('week', date);
      const to = U.addDays(from, 6);
      let main;
      if (from.getMonth() === to.getMonth()) main = `${U.MONTHS[from.getMonth()]} ${from.getFullYear()}`;
      else if (from.getFullYear() === to.getFullYear()) main = `${U.MONTHS_SHORT[from.getMonth()]} – ${U.MONTHS_SHORT[to.getMonth()]} ${to.getFullYear()}`;
      else main = `${U.MONTHS_SHORT[from.getMonth()]} ${from.getFullYear()} – ${U.MONTHS_SHORT[to.getMonth()]} ${to.getFullYear()}`;
      return { main, sub: 'KW ' + U.isoWeek(U.addDays(from, 3)) };
    }
    if (view === 'month') return { main: `${U.MONTHS[date.getMonth()]} ${date.getFullYear()}` };
    if (view === 'year') return { main: String(date.getFullYear()) };
    return { main: 'Terminübersicht', sub: `ab ${U.fmtDateShort(date)}` };
  }

  // ---------- Monatsansicht ----------
  function renderMonth(root, date) {
    const { from, to, weeks } = range('month', date);
    const ws = Store.state.settings.weekStart;
    const showWn = Store.state.settings.showWeekNumbers;
    const occ = occurrences(from, to).sort(sortOcc);
    const today = new Date();

    const head = h('div', { class: 'month-head' + (showWn ? ' with-wn' : '') });
    if (showWn) head.append(h('div', { class: 'wn-head' }));
    for (let i = 0; i < 7; i++) head.append(h('div', null, U.WEEKDAYS_SHORT[(ws + i) % 7]));
    const grid = h('div', { class: 'month-grid' + (showWn ? ' with-wn' : ''), style: { gridTemplateRows: `repeat(${weeks}, 1fr)` } });
    root.append(h('div', { class: 'month' }, head, grid));

    // Platz je Zelle berechnen
    const avail = root.clientHeight - head.offsetHeight;
    const rowH = Math.max(80, avail / weeks);
    const maxItems = Math.max(1, Math.floor((rowH - 30) / 22));

    // Vorkommen je Tag
    const byDay = new Map();
    for (const o of occ) {
      const last = o.allDay ? U.addDays(o.end, -1) : new Date(o.end - 1);
      for (let d = U.startOfDay(o.start); d <= last && d < to; d = U.addDays(d, 1)) {
        if (d < from) continue;
        const k = U.dateKey(d);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push({ o, first: U.sameDay(d, o.start), last: U.sameDay(d, last) });
      }
    }

    for (let w = 0; w < weeks; w++) {
      if (showWn) {
        const wd = U.addDays(from, w * 7 + 3);
        grid.append(h('div', { class: 'wn-cell', title: 'Kalenderwoche' }, U.isoWeek(wd)));
      }
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(from, w * 7 + i);
        const key = U.dateKey(d);
        const items = byDay.get(key) || [];
        const cell = h('div', {
          class: 'month-cell' + (d.getMonth() !== date.getMonth() ? ' other' : '') + (U.sameDay(d, today) ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : ''),
          dataset: { date: key },
        });
        const num = h('button', { class: 'day-num', title: 'Tagesansicht öffnen' }, d.getDate() === 1 ? `${d.getDate()}. ${U.MONTHS_SHORT[d.getMonth()]}` : d.getDate());
        num.addEventListener('click', (e) => { e.stopPropagation(); App.goto(d, 'day'); });
        cell.append(num);
        const list = h('div', { class: 'month-items' });
        const visible = items.length > maxItems ? maxItems - 1 : items.length;
        // Bei Platzmangel Prüfungen nie unter „+ weitere“ verstecken
        const shown = new Set([...items].sort((a, b) => !!b.o.exam - !!a.o.exam).slice(0, visible));
        items.filter((x) => shown.has(x)).forEach(({ o, first, last }) => list.append(monthChip(o, first, last, d)));
        if (items.length > visible) {
          const more = h('button', { class: 'more-link' }, `+${items.length - visible} weitere`);
          more.addEventListener('click', (e) => { e.stopPropagation(); showDayList(d, items.map((x) => x.o), more); });
          list.append(more);
        }
        cell.append(list);
        const newAt9 = () => App.openEditor({ allDay: false, start: U.dtKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9)), end: U.dtKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10)) });
        const clickKind = onLongPress(cell, (t) => { if (!t.closest('.chip, .more-link')) newAt9(); });
        cell.addEventListener('click', (e) => {
          if (e.target.closest('.chip, .more-link')) return;
          const k = clickKind(e);
          if (k === 'tap') { App.goto(d, 'day'); return; }
          if (!k) return;
          App.openEditor({ allDay: false, start: U.dtKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9)), end: U.dtKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10)) });
        });
        // Drag & Drop Ziel
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drop'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
        cell.addEventListener('drop', (e) => {
          e.preventDefault(); cell.classList.remove('drop');
          const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
          if (!data.key) return;
          const o = occ.find((x) => x.key === data.key);
          if (!o) return;
          const delta = U.daysBetween(U.parseDate(data.from), d);
          if (delta === 0) return;
          if (o.kind === 'todo') { Store.updateTodo(o.id, { due: U.dateKey(U.addDays(o.start, delta)) }); return; }
          App.moveOccurrence(o, U.addDays(o.start, delta), U.addDays(o.end, delta));
        });
        grid.append(cell);
      }
    }
  }

  function monthChip(o, first, last, day) {
    const past = o.end < new Date();
    let el;
    if (o.kind === 'todo') {
      el = h('div', { class: 'chip chip-todo' + (o.done ? ' done' : ''), style: { '--c': o.color }, title: o.title },
        h('span', { class: 'todo-box' }, o.done ? '✓' : ''), h('span', { class: 'chip-title' }, o.title));
    } else if (o.allDay || !U.sameDay(o.start, new Date(o.end - 1))) {
      el = h('div', { class: 'chip chip-fill' + (first ? '' : ' cont-l') + (last ? '' : ' cont-r') + (o.kind === 'holiday' ? ' holiday' : '') + (o.exam ? ' exam' : ''),
        style: chipStyle(o.color, past && o.kind !== 'holiday'), title: o.title },
      !o.allDay && first ? h('span', { class: 'chip-time' }, U.fmtTime(o.start)) : null,
      h('span', { class: 'chip-title' }, o.title), examBadge(o));
    } else {
      el = h('div', { class: 'chip chip-dot' + (past ? ' past' : '') + (o.exam ? ' exam' : ''), title: `${U.fmtTime(o.start)} ${o.title}` },
        h('span', { class: 'dot', style: { background: o.color } }),
        h('span', { class: 'chip-time' }, U.fmtTime(o.start)),
        h('span', { class: 'chip-title' }, o.title), examBadge(o));
    }
    el.addEventListener('click', (e) => { e.stopPropagation(); clickOcc(o, el); });
    if (!o.readonly) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ key: o.key, from: U.dateKey(day) }));
        e.dataTransfer.effectAllowed = 'move';
        App.hidePopover();
      });
    }
    return el;
  }

  function clickOcc(o, el) {
    // Aufgabe antippen hakt nicht ab, sondern öffnet die Aufgabenliste des Tages
    if (o.kind === 'todo') { App.hidePopover(); taskSheet(U.startOfDay(o.start)); return; }
    App.showPopover(o, el);
  }

  function showDayList(d, list, anchor) {
    const box = h('div', { class: 'day-list-pop' },
      h('div', { class: 'dlp-head' }, h('div', { class: 'dlp-wd' }, U.WEEKDAYS_SHORT[d.getDay()]), h('div', { class: 'dlp-num' }, d.getDate())));
    for (const o of list.slice().sort(sortOcc)) {
      const c = monthChip(o, true, true, d);
      c.draggable = false;
      box.append(c);
    }
    App.showCustomPopover(box, anchor);
  }

  // Aufgaben eines Tages als Blatt von unten (Handy)
  function taskSheet(d) {
    const build = () => {
      const list = Store.state.todos.filter((t) => t.due === U.dateKey(d))
        .sort((a, b) => (a.done - b.done) || ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) || (a.priority || 9) - (b.priority || 9));
      const open = list.filter((t) => !t.done).length;
      const rows = list.map((t) => {
        const l = Store.todoList(t.listId);
        const row = h('div', { class: 'ts-item' + (t.done ? ' done' : ''), dataset: { id: t.id }, style: { '--c': t.color || (l ? l.color : 'var(--accent)') } },
          h('button', { class: 'ts-check', title: 'Erledigt' }, t.done ? '✓' : ''),
          h('div', { class: 'ts-body' }, h('div', { class: 'ts-title' }, t.title),
            t.notes ? h('div', { class: 'ts-desc' }, t.notes) : null,
            h('div', { class: 'ts-meta' }, [t.time ? '🕒 ' + t.time : null, l ? l.name : null, t.priority === 1 ? '⚑ Hoch' : null].filter(Boolean).join(' · '))),
          h('button', { class: 'icon-btn small ts-act ts-edit', title: 'Bearbeiten',
            onclick: () => Dialogs.quickTodo(d, rebuild, t) },
            h('svg', { viewBox: '0 0 24 24', html: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>' })),
          h('button', { class: 'icon-btn small ts-act ts-del', title: 'Löschen',
            onclick: () => { Store.removeTodo(t.id); App.toast('Aufgabe gelöscht', { undo: true }); rebuild(); } },
            h('svg', { viewBox: '0 0 24 24', html: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>' })));
        row.querySelector('.ts-check').addEventListener('click', (e) => { App.toggleTodo(t.id, e.currentTarget); setTimeout(rebuild, 260); });
        todoDragSource(row, t);
        return row;
      });
      return [
        h('div', { class: 'ts-handle' }),
        h('div', { class: 'ts-head' },
          h('div', null, h('h3', null, U.sameDay(d, new Date()) ? 'Aufgaben heute' : `Aufgaben am ${U.WEEKDAYS[d.getDay()]}`),
            h('small', null, `${U.fmtDateShort(d)} · ${open} offen von ${list.length}`)),
          h('button', { class: 'icon-btn', onclick: () => Modal.close() }, '✕')),
        h('button', { class: 'ts-add', onclick: () => Dialogs.quickTodo(d, rebuild) }, '+ Aufgabe hinzufügen'),
        h('div', { class: 'ts-list' }, ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Keine Aufgaben an diesem Tag.')])),
        rows.length ? h('p', { class: 'ts-hint' }, 'Tipp: Aufgabe länger halten und auf einen anderen Tag ziehen.') : null,
      ];
    };
    // Neu aufbauen mit FLIP: jede Karte gleitet von ihrem alten Platz (auch mitten in einer laufenden Bewegung) zum neuen
    const rebuild = () => {
      const oldList = box.querySelector('.ts-list'), scroll = oldList ? oldList.scrollTop : 0;
      const before = new Map([...box.querySelectorAll('.ts-item')].map((r) => [r.dataset.id, { top: r.getBoundingClientRect().top, o: getComputedStyle(r).opacity }]));
      box.replaceChildren(...build());
      box.querySelector('.ts-list').scrollTop = scroll;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      for (const r of box.querySelectorAll('.ts-item')) {
        const b = before.get(r.dataset.id);
        if (!b) continue;
        const dy = b.top - r.getBoundingClientRect().top, o = getComputedStyle(r).opacity;
        if (Math.abs(dy) < 1 && b.o === o) continue;
        if (dy < 0) r.classList.add('ts-moving'); // nach unten wandernde (erledigte) Karte gleitet über die anderen
        r.animate([{ transform: `translateY(${dy}px)`, opacity: b.o }, { transform: 'none', opacity: o }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' })
          .finished.then(() => r.classList.remove('ts-moving'), () => {});
      }
    };
    const box = h('div', { class: 'task-sheet' });
    box.append(...build());
    // Rückgängig (Toast) stellt den ganzen Stand wieder her: Blatt neu aufbauen
    const onStore = (kind) => { if (kind === 'all') rebuild(); };
    Store.subscribe(onStore);
    Modal.open(box, { width: 520, cls: 'modal-task-sheet', onClose: () => Store.unsubscribe(onStore) });
  }

  // ---------- Aufgabe aus dem Aufgabenblatt auf einen anderen Tag ziehen ----------
  // Länger auf der Aufgabe halten (Maus oder Finger); mit der Maus geht auch einfach losziehen.
  // Das Blatt blendet sich aus, die Aufgabe hängt am Zeiger und landet auf dem Tag, über dem man loslässt.
  function todoDragSource(row, t) {
    row.addEventListener('contextmenu', (e) => e.preventDefault());
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.ts-check, .ts-act')) return;
      const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== 'mouse';
      if (!touch) e.preventDefault(); // kein Text markieren
      let timer = null, drag = null;
      const off = () => {
        clearTimeout(timer); timer = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('touchmove', tmove);
        window.removeEventListener('touchend', up);
        window.removeEventListener('touchcancel', up);
      };
      const begin = (x, y) => { clearTimeout(timer); timer = null; vibrate(); drag = startTodoDrag(t, row, x, y, touch); };
      const move = (ev) => {
        if (drag) { drag.move(ev.clientX, ev.clientY); return; }
        if (Math.abs(ev.clientX - x0) <= TOUCH_SLOP && Math.abs(ev.clientY - y0) <= TOUCH_SLOP) return;
        if (touch) off(); // Finger bewegt sich vor dem langen Druck: Liste scrollen
        else begin(ev.clientX, ev.clientY);
      };
      // Nach dem langen Druck darf der Finger nicht mehr scrollen
      const tmove = (ev) => {
        if (!drag) return;
        if (ev.cancelable) ev.preventDefault();
        const p = ev.touches[0];
        if (p) drag.move(p.clientX, p.clientY);
      };
      const up = () => { off(); if (drag) { const d = drag; drag = null; d.drop(); } };
      // Touch: das Blatt wird nur ausgeblendet, Touch-Ereignisse kommen weiter an
      const cancel = () => { if (drag && touch) return; off(); if (drag) { drag.abort(); drag = null; } };
      timer = setTimeout(() => begin(x0, y0), LONG_MS);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('touchmove', tmove, { passive: false });
      window.addEventListener('touchend', up);
      window.addEventListener('touchcancel', up);
    });
  }

  // Welcher Tag liegt unter dem Zeiger? Monats-, Wochen-, Tages-, Jahres- und Mini-Kalender
  function dayAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const c = el.closest('[data-date]');
    if (c) return c.dataset.date;
    // Woche/Tag: Kopf, Ganztägig-Zeile und Termine gehören zur Spalte darunter
    const tg = el.closest('.tg');
    if (tg) {
      for (const col of tg.querySelectorAll('.tg-col')) {
        const r = col.getBoundingClientRect();
        if (x >= r.left && x < r.right) return col.dataset.date;
      }
    }
    return null;
  }

  function startTodoDrag(t, row, x, y, touch) {
    const back = row.closest('.modal-backdrop');
    if (back) back.classList.add('todo-dragging'); // Blatt ausblenden, Kalender wird sichtbar
    App.hidePopover();
    const list = Store.todoList(t.listId);
    const ghost = h('div', { class: 'todo-drag-ghost', style: { '--c': t.color || (list ? list.color : 'var(--accent)') } },
      h('span', { class: 'todo-box' }), h('span', { class: 'tdg-title' }, t.title), h('span', { class: 'tdg-day' }));
    document.body.append(ghost);
    let target = null, edge = null, last = { x, y };

    const mark = (k) => {
      if (k === target) return;
      document.querySelectorAll('.todo-drop').forEach((el) => el.classList.remove('todo-drop'));
      target = k;
      if (k) document.querySelectorAll(`[data-date="${k}"]`).forEach((el) => el.classList.add('todo-drop'));
      const d = k && U.parseDate(k);
      ghost.querySelector('.tdg-day').textContent = d ? `→ ${U.WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}. ${U.MONTHS_SHORT[d.getMonth()]}` : '';
    };
    const clearEdge = () => { if (edge) { clearTimeout(edge.timer); edge.bar.remove(); edge = null; } };
    // Am linken/rechten Rand verweilen: Kalender umblättern, Aufgabe bleibt am Zeiger
    const checkEdge = () => {
      const vc = document.querySelector('.view-container');
      if (!vc) return;
      const r = vc.getBoundingClientRect();
      const zone = touch ? 22 : 12;
      const dir = last.y < r.top || last.y > r.bottom ? 0 : last.x >= r.right - zone ? 1 : last.x <= r.left + zone ? -1 : 0;
      if (!dir) { clearEdge(); return; }
      if (edge && edge.dir === dir) return;
      clearEdge();
      const bar = h('div', { class: 'drag-edge ' + (dir > 0 ? 'right' : 'left') }, h('span', null, dir > 0 ? 'Weiter >' : '< Zurück'));
      Object.assign(bar.style, { top: r.top + 'px', height: r.height + 'px', left: (dir > 0 ? r.right - 46 : r.left) + 'px' });
      document.body.append(bar);
      edge = { dir, bar, timer: setTimeout(() => {
        clearEdge();
        const sc = vc.querySelector('.tg-scroll');
        App.step(dir, sc ? { scrollTop: sc.scrollTop } : undefined);
        target = null; update();
      }, EDGE_MS) };
    };
    const update = () => {
      Object.assign(ghost.style, { left: last.x + 'px', top: last.y + 'px' });
      mark(dayAt(last.x, last.y));
      checkEdge();
    };
    const cleanup = () => {
      clearEdge(); mark(null); ghost.remove();
    };
    if (touch) ghost.classList.add('touch');
    update();
    return {
      move(nx, ny) { last = { x: nx, y: ny }; update(); },
      drop() {
        const k = target;
        cleanup();
        if (!k || k === t.due) { if (back) back.classList.remove('todo-dragging'); return; }
        Store.snapshot();
        Store.updateTodo(t.id, { due: k });
        Modal.close();
        const d = U.parseDate(k);
        App.toast(`Aufgabe auf ${U.WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}. ${U.MONTHS_SHORT[d.getMonth()]} verschoben`, { undo: true });
      },
      abort() { cleanup(); if (back) back.classList.remove('todo-dragging'); },
    };
  }

  // ---------- Tages- & Wochenansicht ----------
  function layoutColumns(items) {
    // items: [{start,end}] eines Tages -> setzt col / cols
    items.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const cols = [];
      for (const it of cluster) {
        let c = cols.findIndex((end) => end <= it.s);
        if (c === -1) { c = cols.length; cols.push(it.e); } else cols[c] = it.e;
        it.col = c;
      }
      for (const it of cluster) {
        it.cols = cols.length;
        // nach rechts ausdehnen, wenn Nachbarspalten frei sind
        let span = 1;
        for (let c = it.col + 1; c < cols.length; c++) {
          if (cluster.some((o) => o.col === c && o.s < it.e && o.e > it.s)) break;
          span++;
        }
        it.span = span;
      }
      cluster = []; clusterEnd = -1;
    };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    }
    if (cluster.length) flush();
    return items;
  }

  function renderTimeGrid(root, date, nDays, opts = {}) {
    const { from } = range(nDays === 1 ? 'day' : 'week', date);
    const to = U.addDays(from, nDays);
    const occ = occurrences(from, to);
    const today = new Date();
    const days = Array.from({ length: nDays }, (_, i) => U.addDays(from, i));

    const tg = h('div', { class: 'tg' + (nDays === 1 ? ' tg-day' : '') });
    const colsTpl = `var(--gutter) repeat(${nDays}, minmax(0, 1fr))`;

    // Aufgaben am Handy: 'all' (alle als Balken), 'compact' (2 + „+N“), 'badge' (Zahl am Tag), 'bar' (Leiste oben)
    const todoMode = Store.state.settings.phoneTodoMode || 'compact';
    const todosOf = (d) => occ.filter((o) => o.kind === 'todo' && U.sameDay(o.start, d));

    // Kopf
    const head = h('div', { class: 'tg-head', style: { gridTemplateColumns: colsTpl } });
    head.append(h('div', { class: 'tg-gutter-head' }, Store.state.settings.showWeekNumbers ? 'KW ' + U.isoWeek(U.addDays(from, Math.min(3, nDays - 1))) : ''));
    for (const d of days) {
      const dh = h('div', { class: 'tg-dayhead' + (U.sameDay(d, today) ? ' today' : '') + (d < U.startOfDay(today) ? ' past' : '') },
        h('div', { class: 'wd' }, U.WEEKDAYS_SHORT[d.getDay()]),
        h('button', { class: 'dn', title: 'Tagesansicht' }, d.getDate()));
      dh.querySelector('.dn').addEventListener('click', () => App.goto(d, 'day'));
      if (todoMode === 'badge') {
        const list = todosOf(d);
        if (list.length) {
          const open = list.filter((o) => !o.done).length;
          const b = h('button', { class: 'dh-tasks' + (open ? '' : ' all-done'), title: 'Aufgaben' }, open ? `✓ ${open}` : '✓');
          b.addEventListener('click', (e) => { e.stopPropagation(); taskSheet(d); });
          dh.append(b);
        }
      }
      head.append(dh);
    }

    // Ganztägig-Zeile
    let allday = occ.filter((o) => o.allDay || (o.end - o.start) >= U.DAY_MS).sort(sortOcc);
    if (todoMode !== 'all') allday = allday.filter((o) => o.kind !== 'todo');
    // Kompakt: pro Tag höchstens 2 Aufgaben, der Rest als „+N“
    const COMPACT_MAX = 2;
    const extraTodos = [];
    if (todoMode === 'compact') {
      days.forEach((d, i) => {
        const list = todosOf(d).sort((a, b) => (a.done - b.done) || sortOcc(a, b));
        const shown = list.length > COMPACT_MAX + 1 ? list.slice(0, COMPACT_MAX) : list;
        allday.push(...shown);
        if (list.length > shown.length) extraTodos.push({ i, d, n: list.length - shown.length });
      });
    }
    const timed = occ.filter((o) => !(o.allDay || (o.end - o.start) >= U.DAY_MS));
    const adRow = h('div', { class: 'tg-allday', style: { gridTemplateColumns: colsTpl } });
    adRow.append(h('div', { class: 'tg-gutter-ad' }, 'ganztägig'));
    const adArea = h('div', { class: 'tg-ad-area', style: { gridColumn: `2 / span ${nDays}` } });
    for (let i = 0; i < nDays; i++) {
      // Klick/Tippen auf den leeren Aufgabenbereich: ohne Aufgaben Schnellfenster, sonst das große Aufgabenfenster.
      // Lange halten (Handy) legt wie bisher einen ganztägigen Termin an.
      const slot = h('div', { class: 'tg-ad-slot', title: todosOf(days[i]).length ? 'Aufgaben ansehen' : 'Aufgabe hinzufügen', style: { left: `${(i / nDays) * 100}%`, width: `${100 / nDays}%` } });
      const newAllDay = () => App.openEditor({ allDay: true, start: U.dateKey(days[i]), end: U.dateKey(days[i]) });
      const tasksOrAdd = () => (todosOf(days[i]).length ? taskSheet(days[i]) : Dialogs.quickTodo(days[i]));
      const clickKind = onLongPress(slot, newAllDay);
      slot.addEventListener('click', (e) => { if (clickKind(e)) tasksOrAdd(); });
      adArea.append(slot);
    }
    const lanes = [];
    for (const o of allday) {
      const sIdx = Math.max(0, U.daysBetween(from, o.start));
      const eIdx = Math.min(nDays - 1, U.daysBetween(from, o.allDay ? U.addDays(o.end, -1) : new Date(o.end - 1)));
      let lane = lanes.findIndex((end) => end < sIdx);
      if (lane === -1) { lane = lanes.length; lanes.push(eIdx); } else lanes[lane] = eIdx;
      const contL = o.start < from, contR = (o.allDay ? U.addDays(o.end, -1) : o.end) >= to;
      let el;
      if (o.kind === 'todo') {
        el = h('div', { class: 'chip chip-todo ad-item' + (o.done ? ' done' : ''), style: { '--c': o.color } },
          h('span', { class: 'todo-box' }, o.done ? '✓' : ''), h('span', { class: 'chip-title' }, o.title));
      } else {
        el = h('div', { class: 'chip chip-fill ad-item' + (contL ? ' cont-l' : '') + (contR ? ' cont-r' : '') + (o.kind === 'holiday' ? ' holiday' : '') + (o.exam ? ' exam' : ''),
          style: chipStyle(o.color, o.end < today && o.kind !== 'holiday') },
        !o.allDay ? h('span', { class: 'chip-time' }, U.fmtTime(o.start)) : null, h('span', { class: 'chip-title' }, o.title), examBadge(o));
      }
      Object.assign(el.style, { left: `calc(${(sIdx / nDays) * 100}% + 2px)`, width: `calc(${((eIdx - sIdx + 1) / nDays) * 100}% - 4px)`, top: `${lane * 24 + 2}px` });
      el.title = o.title;
      el.addEventListener('click', (e) => { e.stopPropagation(); clickOcc(o, el); });
      adArea.append(el);
    }
    for (const x of extraTodos) {
      let lane = lanes.findIndex((end) => end < x.i);
      if (lane === -1) { lane = lanes.length; lanes.push(x.i); } else lanes[lane] = x.i;
      const more = h('button', { class: 'chip chip-more ad-item' }, nDays === 1 ? `+${x.n} weitere Aufgaben` : isPhone() ? `+${x.n}` : `+${x.n} Aufgaben`);
      Object.assign(more.style, { left: `calc(${(x.i / nDays) * 100}% + 2px)`, width: `calc(${100 / nDays}% - 4px)`, top: `${lane * 24 + 2}px` });
      more.addEventListener('click', (e) => { e.stopPropagation(); taskSheet(x.d); });
      adArea.append(more);
    }
    adArea.style.height = `${Math.max(1, lanes.length) * 24 + 6}px`;
    adRow.append(adArea);

    // Leiste „Aufgaben heute“
    let taskBar = null;
    if (todoMode === 'bar') {
      const d = days.find((x) => U.sameDay(x, today)) || days[0];
      const list = todosOf(d);
      const open = list.filter((o) => !o.done).length;
      const pct = list.length ? Math.round(((list.length - open) / list.length) * 100) : 100;
      taskBar = h('button', { class: 'tg-taskbar' },
        h('span', { class: 'tb-ring', style: { '--p': pct } }),
        h('span', { class: 'tb-text' }, h('b', null, U.sameDay(d, today) ? 'Aufgaben heute' : `Aufgaben ${U.WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}.`),
          h('small', null, list.length ? (open ? `${open} offen · ${list.length - open} erledigt` : 'alles erledigt 🎉') : 'keine Aufgaben')),
        h('span', { class: 'tb-arrow' }, '›'));
      taskBar.addEventListener('click', () => taskSheet(d));
    }

    // Zeitraster
    const scroller = h('div', { class: 'tg-scroll' });
    const startHour = Store.state.settings.dayStartHour ?? 7;
    tg.append(...(taskBar ? [taskBar] : []), head, adRow, scroller);
    root.append(tg);
    if (!isPhone()) HOUR_PX = 48;
    else if (scroller.clientHeight > 0) HOUR_PX = Math.max(24, Math.min(48, (scroller.clientHeight - 8) / (24 - startHour)));
    const body = h('div', { class: 'tg-body', style: { gridTemplateColumns: colsTpl, height: `${24 * HOUR_PX}px` } });
    const gutter = h('div', { class: 'tg-gutter' });
    for (let hr = 1; hr < 24; hr++) gutter.append(h('div', { class: 'tg-hour', style: { top: `${hr * HOUR_PX}px` } }, `${U.pad(hr)}:00`));
    body.append(gutter);

    const cols = [];
    days.forEach((d, i) => {
      const col = h('div', { class: 'tg-col' + (U.sameDay(d, today) ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : ''), dataset: { idx: i, date: U.dateKey(d) } });
      for (let hr = 0; hr < 24; hr++) col.append(h('div', { class: 'tg-line', style: { top: `${hr * HOUR_PX}px` } }), h('div', { class: 'tg-line half', style: { top: `${hr * HOUR_PX + HOUR_PX / 2}px` } }));
      const dayStart = d, dayEnd = U.addDays(d, 1);
      const items = timed.filter((o) => o.start < dayEnd && o.end > dayStart).map((o) => ({
        o, s: Math.max(0, (o.start - dayStart) / 60000), e: Math.min(1440, (o.end - dayStart) / 60000),
      }));
      layoutColumns(items);
      for (const it of items) col.append(timedEvent(it, d));
      if (U.sameDay(d, today)) {
        const nl = h('div', { class: 'now-line' }, h('span', { class: 'now-dot' }));
        nl.style.top = `${(U.minutesOfDay(today) / 60) * HOUR_PX}px`;
        col.append(nl);
      }
      cols.push(col);
      body.append(col);
    });
    scroller.append(body);

    // Scrollposition: aktuelle Uhrzeit oder Tagesbeginn (am Handy immer Tagesbeginn, dann passt alles bis Mitternacht)
    const inView = days.some((d) => U.sameDay(d, today));
    const target = inView && !isPhone() ? Math.max(0, (U.minutesOfDay(today) / 60 - 2)) : startHour;
    scroller.scrollTop = opts.scrollTop != null ? opts.scrollTop : Math.max(0, target * HOUR_PX - (isPhone() ? 8 : 0));

    attachGridInteractions(body, cols, days, scroller);
  }

  function timedEvent(it, day) {
    const { o } = it;
    const top = (it.s / 60) * HOUR_PX;
    const height = Math.max(18, ((it.e - it.s) / 60) * HOUR_PX - 2);
    const w = 100 / it.cols;
    const past = o.end < new Date();
    const short = height < 36;
    const el = h('div', {
      class: 'tg-event' + (short ? ' short' : '') + (past ? ' past' : '') + (o.exam ? ' exam' : ''),
      style: {
        top: `${top}px`, height: `${height}px`,
        left: `calc(${it.col * w}% + 1px)`, width: `calc(${w * it.span}% - ${it.col + it.span < it.cols ? 4 : 6}px)`,
        background: o.color, color: U.textOn(o.color), zIndex: 2 + it.col, '--ev': o.color,
      },
      dataset: { key: o.key },
    });
    const timeTxt = `${U.fmtTime(o.start)} – ${U.fmtTime(o.end)}`;
    if (short) el.append(h('div', { class: 'ev-line' }, h('b', null, o.title), ', ', U.fmtTime(o.start)));
    else {
      el.append(h('div', { class: 'ev-title' }, o.title, examBadge(o)), h('div', { class: 'ev-time' }, timeTxt));
      if (o.ev.location && height > 54) el.append(h('div', { class: 'ev-loc' }, o.ev.location));
    }
    if (o.recurring) el.append(h('span', { class: 'ev-rec', title: 'Wiederholt sich' }, '↻'));
    const startsToday = U.sameDay(o.start, day);
    const endsToday = o.end <= U.addDays(day, 1);
    if (endsToday) el.append(h('div', { class: 'ev-resize', title: 'Dauer ändern' }));
    el._occ = o;
    el._startsToday = startsToday;
    el.title = `${o.title}\n${timeTxt}${o.ev.location ? '\n' + o.ev.location : ''}`;
    return el;
  }

  function attachGridInteractions(body, cols, days, scroller) {
    let drag = null;
    const minuteAt = (clientY) => {
      const r = body.getBoundingClientRect();
      return Math.max(0, Math.min(1440, ((clientY - r.top) / HOUR_PX) * 60));
    };
    const colAt = (clientX) => {
      for (let i = 0; i < cols.length; i++) {
        const r = cols[i].getBoundingClientRect();
        if (clientX >= r.left && clientX < r.right) return i;
      }
      return clientX < cols[0].getBoundingClientRect().left ? 0 : cols.length - 1;
    };
    const snap = (m) => Math.round(m / SNAP) * SNAP;

    // ---- Termin über den Rand ziehen: Woche umblättern und weiter festhalten ----
    let edge = null; // { dir, timer, bar }
    const clearEdge = () => { if (edge) { clearTimeout(edge.timer); edge.bar.remove(); edge = null; } };
    const edgeDir = (x) => {
      const first = cols[0].getBoundingClientRect(), last = cols[cols.length - 1].getBoundingClientRect();
      if (x >= last.right - (drag && drag.touch ? 22 : 10)) return 1;
      if (x <= first.left + 2) return -1;
      return 0;
    };
    function checkEdge(e) {
      if (!drag || drag.mode !== 'move' || drag.o.readonly) { clearEdge(); return; }
      const dir = edgeDir(e.clientX);
      if (!dir) { clearEdge(); return; }
      if (edge && edge.dir === dir) return;
      clearEdge();
      const span = days.length === 1 ? 'Tag' : 'Woche';
      const bar = h('div', { class: 'drag-edge ' + (dir > 0 ? 'right' : 'left') }, h('span', null, dir > 0 ? `Nächste ${span} ›` : `‹ Vorige ${span}`));
      const r = scroller.getBoundingClientRect();
      Object.assign(bar.style, { top: r.top + 'px', height: r.height + 'px', left: (dir > 0 ? r.right - 46 : cols[0].getBoundingClientRect().left) + 'px' });
      document.body.append(bar);
      edge = { dir, bar, timer: setTimeout(() => flip(dir, e), EDGE_MS) };
    }
    function flip(dir, e) {
      clearEdge();
      if (!drag) return;
      const d = drag; drag = null;
      carry = {
        o: d.o, ci0: d.ci0, m0: d.m0, dm: d.dm || 0, shift: (d.shift || 0) + dir * days.length,
        ghost: d.ghost, x: e.clientX, y: e.clientY, dir, touch: !!d.touch, minute: minuteAt(e.clientY),
      };
      App.step(dir, { scrollTop: scroller.scrollTop });
    }

    let pending = null; // Touch: wartet auf langen Druck
    const cancelPending = () => { if (pending) { clearTimeout(pending.timer); pending = null; } };
    const startDrag = (e, evEl, ci, m) => {
      if (evEl) {
        const o = evEl._occ;
        const mode = e.target.classList.contains('ev-resize') ? 'resize' : 'move';
        drag = { mode, o, el: evEl, x0: e.clientX, y0: e.clientY, m0: m, ci0: ci, moved: false };
      } else {
        const sm = Math.floor(m / SNAP) * SNAP;
        drag = { mode: 'create', ci0: ci, m0: sm, x0: e.clientX, y0: e.clientY, moved: false };
      }
    };

    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const evEl = e.target.closest('.tg-event');
      const colEl = e.target.closest('.tg-col');
      if (!colEl) return;
      App.hidePopover();
      const ci = +colEl.dataset.idx;
      const m = minuteAt(e.clientY);
      if (e.pointerType === 'touch') {
        // Handy: nichts sofort anlegen, damit Wischen und Scrollen frei bleiben
        cancelPending();
        const pid = e.pointerId, x = e.clientX, y = e.clientY, target = e.target;
        pending = { x, y, evEl, timer: setTimeout(() => {
          pending = null;
          startDrag({ clientX: x, clientY: y, target }, evEl, ci, m);
          drag.touch = true; touchBusy = true;
          vibrate();
          try { body.setPointerCapture(pid); } catch (err) { /* Finger schon weg */ }
          if (drag.mode === 'create') {
            const s = drag.m0, en = s + (Store.state.settings.defaultDuration || 60);
            drag.ghost = h('div', { class: 'tg-ghost' });
            Object.assign(drag.ghost.style, { top: `${(s / 60) * HOUR_PX}px`, height: `${((en - s) / 60) * HOUR_PX}px` });
            drag.ghost.textContent = `${U.pad(Math.floor(s / 60))}:${U.pad(s % 60)} – ${U.pad(Math.floor(en / 60) % 24)}:${U.pad(en % 60)}`;
            cols[ci].append(drag.ghost);
          } else drag.el.classList.add('lp-active');
        }, LONG_MS) };
        return;
      }
      startDrag(e, evEl, ci, m);
      body.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    // Nach dem langen Druck darf der Finger nicht mehr die Seite scrollen
    body.addEventListener('touchmove', (e) => { if ((drag && drag.touch) || touchBusy) e.preventDefault(); }, { passive: false });
    body.addEventListener('contextmenu', (e) => { if (pending || (drag && drag.touch)) e.preventDefault(); });

    const onMove = (e) => {
      if (pending) {
        if (Math.abs(e.clientX - pending.x) > TOUCH_SLOP || Math.abs(e.clientY - pending.y) > TOUCH_SLOP) cancelPending();
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientY - drag.y0) < 4 && Math.abs(e.clientX - drag.x0) < 4) return;
      drag.moved = true;
      const m = minuteAt(e.clientY);
      // automatisch scrollen am Rand
      const sr = scroller.getBoundingClientRect();
      if (e.clientY < sr.top + 30) scroller.scrollTop -= 12; else if (e.clientY > sr.bottom - 30) scroller.scrollTop += 12;

      if (drag.mode === 'create') {
        const a = drag.m0, b = snap(m);
        // nur seitlich gezogen: Standarddauer statt 15 Minuten
        const vert = Math.abs(e.clientY - drag.y0) > HOUR_PX / 3;
        const s = vert ? Math.min(a, b) : a, en = vert ? Math.max(a + SNAP, b) : Math.min(1440, a + (Store.state.settings.defaultDuration || 60));
        // seitlich ziehen: gleiche Uhrzeit an mehreren Tagen nebeneinander
        const ci = colAt(e.clientX), lo = Math.min(drag.ci0, ci), hi = Math.max(drag.ci0, ci);
        if (!drag.ghost) { drag.ghost = h('div', { class: 'tg-ghost' }); cols[drag.ci0].append(drag.ghost); }
        drag.extra = drag.extra || {};
        for (const k of Object.keys(drag.extra)) if (k < lo || k > hi) { drag.extra[k].remove(); delete drag.extra[k]; }
        const label = `${U.pad(Math.floor(s / 60))}:${U.pad(s % 60)} – ${U.pad(Math.floor(en / 60) % 24)}:${U.pad(en % 60)}`;
        for (let i = lo; i <= hi; i++) {
          let g = i === drag.ci0 ? drag.ghost : drag.extra[i];
          if (!g) { g = drag.extra[i] = h('div', { class: 'tg-ghost' }); cols[i].append(g); }
          Object.assign(g.style, { top: `${(s / 60) * HOUR_PX}px`, height: `${((en - s) / 60) * HOUR_PX}px` });
          g.textContent = i === lo && hi > lo ? `${label} · ${hi - lo + 1} Tage` : label;
        }
        drag.s = s; drag.e = en; drag.lo = lo; drag.hi = hi;
      } else if (drag.o.readonly) {
        return;
      } else if (drag.mode === 'move') {
        const dm = snap(m - drag.m0);
        const dd = colAt(e.clientX) + (drag.shift || 0) - drag.ci0;
        const ci = colAt(e.clientX);
        drag.dm = dm; drag.dd = dd;
        const ns = U.addMinutes(U.addDays(drag.o.start, dd), dm);
        const ne = U.addMinutes(U.addDays(drag.o.end, dd), dm);
        if (!drag.ghost) { drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('dragging'); drag.el.classList.add('drag-src'); }
        const target = cols[ci];
        if (target && drag.ghost.parentNode !== target) target.append(drag.ghost);
        const top = (U.minutesOfDay(ns) / 60) * HOUR_PX;
        Object.assign(drag.ghost.style, { top: `${top}px`, left: '1px', width: 'calc(100% - 6px)', zIndex: 50 });
        const t = drag.ghost.querySelector('.ev-time');
        if (t) t.textContent = `${U.fmtTime(ns)} – ${U.fmtTime(ne)}`;
        checkEdge(e);
      } else if (drag.mode === 'resize') {
        const em = Math.max(snap(m), U.minutesOfDay(drag.o.start) + SNAP);
        drag.newEndMin = em;
        drag.el.style.height = `${Math.max(18, ((em - (drag.el._startsToday ? U.minutesOfDay(drag.o.start) : 0)) / 60) * HOUR_PX - 2)}px`;
        const t = drag.el.querySelector('.ev-time');
        if (t) t.textContent = `${U.fmtTime(drag.o.start)} – ${U.pad(Math.floor(em / 60) % 24)}:${U.pad(em % 60)}`;
      }
    };
    body.addEventListener('pointermove', onMove);
    const onTouchMove = (e) => { if (!drag) return; e.preventDefault(); const t = e.touches[0]; if (t) onMove({ clientX: t.clientX, clientY: t.clientY }); };

    const finish = (e) => {
      if (pending) {
        // kurz getippt: Termin zeigen, auf leerer Fläche nichts tun
        const p = pending; cancelPending();
        if (p.evEl) App.showPopover(p.evEl._occ, p.evEl);
        return;
      }
      clearEdge();
      if (!drag) return;
      const d = drag; drag = null; touchBusy = false;
      if (d.carried) {
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', finish);
        window.removeEventListener('touchmove', onTouchMove); window.removeEventListener('touchend', finish); window.removeEventListener('touchcancel', finish);
      }
      if (d.el) d.el.classList.remove('lp-active');
      if (d.mode === 'create') {
        if (d.touch && !d.moved) {
          // langer Druck ohne Ziehen: Termin mit Standarddauer an dieser Stelle
          const s = d.m0, en = s + (Store.state.settings.defaultDuration || 60);
          const day = days[d.ci0];
          App.openEditor({ allDay: false, start: U.dtKey(U.addMinutes(day, s)), end: U.dtKey(U.addMinutes(day, en)) }, () => d.ghost && d.ghost.remove());
          return;
        }
        const multi = d.moved && d.hi > d.lo;
        const day = days[multi ? d.lo : d.ci0];
        let s, en;
        if (!d.moved) {
          s = Math.floor(d.m0 / 30) * 30;
          en = s + (Store.state.settings.defaultDuration || 60);
        } else { s = d.s; en = d.e; }
        const sd = U.addMinutes(day, s), ed = U.addMinutes(day, en);
        // mehrere Tage: ein Termin, der sich täglich bis zum letzten gezogenen Tag wiederholt
        const rrule = multi ? { freq: 'daily', interval: 1, until: U.dateKey(days[d.hi]) } : null;
        const clean = () => { d.ghost && d.ghost.remove(); Object.values(d.extra || {}).forEach((g) => g.remove()); };
        App.openEditor({ allDay: false, start: U.dtKey(sd), end: U.dtKey(ed), rrule }, clean);
        if (!d.moved) {
          // kurze Vorschau, damit man sieht wo der Termin entsteht
          d.ghost = h('div', { class: 'tg-ghost' }, `${U.fmtTime(sd)} – ${U.fmtTime(ed)}`);
          Object.assign(d.ghost.style, { top: `${(s / 60) * HOUR_PX}px`, height: `${((en - s) / 60) * HOUR_PX}px` });
          cols[d.ci0].append(d.ghost);
        }
        return;
      }
      if (!d.moved) { App.showPopover(d.o, d.el); return; }
      if (d.o.readonly) return;
      if (d.mode === 'move') {
        if (!d.dm && !d.dd) { d.ghost && d.ghost.remove(); d.el && d.el.classList.remove('drag-src'); if (d.carried) App.render(); return; }
        App.moveOccurrence(d.o, U.addMinutes(U.addDays(d.o.start, d.dd), d.dm), U.addMinutes(U.addDays(d.o.end, d.dd), d.dm));
      } else if (d.mode === 'resize' && d.newEndMin != null) {
        const dayOfEnd = U.startOfDay(new Date(d.o.end - 1));
        const ne = U.addMinutes(dayOfEnd, d.newEndMin);
        App.moveOccurrence(d.o, d.o.start, ne);
      }
    };
    body.addEventListener('pointerup', finish);

    // Nach dem Umblättern: denselben Termin weiter an der Maus halten
    if (carry) {
      const c = carry; carry = null;
      // gleiche Uhrzeit unter der Maus wie vor dem Umblättern (Kopfzeile kann anders hoch sein)
      scroller.scrollTop += ((c.minute - minuteAt(c.y)) / 60) * HOUR_PX;
      drag = { mode: 'move', o: c.o, el: cols.map((col) => col.querySelector(`.tg-event[data-key="${CSS.escape(c.o.key)}"]`)).find(Boolean) || null,
        x0: c.x, y0: c.y, m0: c.m0, ci0: c.ci0, shift: c.shift, dm: c.dm, moved: true, carried: true, ghost: c.ghost, touch: c.touch };
      if (drag.el) drag.el.classList.add('drag-src');
      // Maus ist das alte Raster los: Bewegung und Loslassen am ganzen Fenster abfangen
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      if (c.touch) { touchBusy = true; window.addEventListener('touchmove', onTouchMove, { passive: false }); window.addEventListener('touchend', finish); window.addEventListener('touchcancel', finish); }
      onMove({ clientX: c.x, clientY: c.y });
    }
    body.addEventListener('pointercancel', () => { cancelPending(); clearEdge(); if (!drag) return; touchBusy = false; if (drag.el) drag.el.classList.remove('lp-active'); if (drag.mode === 'create') { drag.ghost && drag.ghost.remove(); Object.values(drag.extra || {}).forEach((g) => g.remove()); } else if (drag.moved) { App.render(); } drag = null; });
  }

  // ---------- Jahresansicht ----------
  function renderYear(root, date) {
    const y = date.getFullYear();
    const from = new Date(y, 0, 1), to = new Date(y + 1, 0, 1);
    const occ = occurrences(from, to);
    const count = new Map(), colorOf = new Map();
    for (const o of occ) {
      const last = o.allDay ? U.addDays(o.end, -1) : new Date(o.end - 1);
      for (let d = U.startOfDay(o.start); d <= last; d = U.addDays(d, 1)) {
        const k = U.dateKey(d);
        count.set(k, (count.get(k) || 0) + 1);
        if (!colorOf.has(k) || o.kind === 'holiday') colorOf.set(k, o.kind === 'holiday' ? 'holiday' : o.color);
      }
    }
    const ws = Store.state.settings.weekStart;
    const today = new Date();
    const grid = h('div', { class: 'year-grid' });
    for (let m = 0; m < 12; m++) {
      const box = h('div', { class: 'year-month' });
      const t = h('button', { class: 'ym-title' }, U.MONTHS[m]);
      t.addEventListener('click', () => App.goto(new Date(y, m, 1), 'month'));
      box.append(t);
      const g = h('div', { class: 'ym-grid' });
      for (let i = 0; i < 7; i++) g.append(h('div', { class: 'ym-wd' }, U.WEEKDAYS_SHORT[(ws + i) % 7][0]));
      const first = new Date(y, m, 1);
      const start = U.startOfWeek(first, ws);
      for (let i = 0; i < 42; i++) {
        const d = U.addDays(start, i);
        const k = U.dateKey(d);
        const inMonth = d.getMonth() === m;
        const c = count.get(k) || 0;
        const cell = h('button', {
          class: 'ym-day' + (inMonth ? '' : ' other') + (U.sameDay(d, today) ? ' today' : '') + (inMonth && c ? ' has' : '') + (inMonth && colorOf.get(k) === 'holiday' ? ' hol' : ''),
          title: inMonth && c ? `${c} Einträge` : '',
          style: inMonth && c && colorOf.get(k) !== 'holiday' ? { '--c': colorOf.get(k) } : null,
          dataset: inMonth ? { date: k } : null,
        }, d.getDate());
        if (inMonth) cell.addEventListener('click', () => App.goto(d, 'day'));
        else cell.tabIndex = -1;
        g.append(cell);
      }
      box.append(g);
      grid.append(box);
    }
    root.append(grid);
  }

  // ---------- Liste / Suche ----------
  function renderAgenda(root, date, opts = {}) {
    const from = opts.from || U.startOfDay(date);
    const to = opts.to || U.addDays(from, opts.days || 60);
    let occ = occurrences(from, to, { noExtras: !!opts.query }).filter((o) => o.kind !== 'todo' || !opts.query);
    if (opts.query) {
      const q = opts.query.toLowerCase();
      occ = occ.filter((o) => o.kind === 'event' && [o.ev.title, o.ev.location, o.ev.notes, o.cal.name].some((s) => (s || '').toLowerCase().includes(q)));
    }
    occ.sort(sortOcc);
    const wrap = h('div', { class: 'agenda' });
    if (opts.query) wrap.append(h('div', { class: 'agenda-search-head' }, `${occ.length} Treffer für „${opts.query}“`, h('button', { class: 'btn btn-ghost', onclick: () => App.clearSearch() }, 'Suche beenden')));
    const groups = new Map();
    for (const o of occ) {
      const d = o.start < from ? from : U.startOfDay(o.start);
      const k = U.dateKey(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    if (!groups.size) wrap.append(h('div', { class: 'empty' }, opts.query ? 'Keine Termine gefunden.' : 'Keine Termine in diesem Zeitraum. 🎉'));
    const today = new Date();
    for (const [k, list] of groups) {
      const d = U.parseDate(k);
      const row = h('div', { class: 'agenda-day' + (U.sameDay(d, today) ? ' today' : '') });
      const dl = h('button', { class: 'agenda-date' }, h('span', { class: 'ad-num' }, d.getDate()), h('span', { class: 'ad-meta' }, `${U.MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() !== today.getFullYear() ? d.getFullYear() : ''}, ${U.WEEKDAYS_SHORT[d.getDay()]}`));
      dl.addEventListener('click', () => App.goto(d, 'day'));
      const items = h('div', { class: 'agenda-items' });
      for (const o of list) {
        const time = o.allDay ? 'Ganztägig' : `${U.fmtTime(o.start)} – ${U.fmtTime(o.end)}`;
        const it = h('div', { class: 'agenda-item' + (o.end < today ? ' past' : '') + (o.kind === 'todo' && o.done ? ' done' : '') + (o.exam ? ' exam' : '') },
          o.kind === 'todo' ? h('span', { class: 'todo-box small', style: { '--c': o.color } }, o.done ? '✓' : '') : h('span', { class: 'dot', style: { background: o.color } }),
          h('span', { class: 'ai-time' }, o.kind === 'todo' ? 'Aufgabe' : time),
          h('span', { class: 'ai-title' }, o.title, examBadge(o)),
          o.ev && o.ev.location ? h('span', { class: 'ai-loc' }, '📍 ' + o.ev.location) : null);
        it.addEventListener('click', () => clickOcc(o, it));
        items.append(it);
      }
      row.append(dl, items);
      wrap.append(row);
    }
    if (!opts.query) {
      const more = h('button', { class: 'btn btn-outline agenda-more' }, 'Weitere 60 Tage laden');
      more.addEventListener('click', () => { root.innerHTML = ''; renderAgenda(root, date, { from, days: U.daysBetween(from, to) + 60 }); });
      wrap.append(more);
    }
    root.append(wrap);
  }

  // ---------- Mini-Kalender in der Seitenleiste ----------
  let miniDate = null;
  function renderMini(root, selected, view) {
    if (!miniDate || (selected && !miniDate._pinned)) miniDate = U.startOfMonth(selected);
    const ws = Store.state.settings.weekStart;
    const today = new Date();
    root.innerHTML = '';
    const head = h('div', { class: 'mini-head' },
      h('span', { class: 'mini-title' }, `${U.MONTHS[miniDate.getMonth()]} ${miniDate.getFullYear()}`),
      h('button', { class: 'icon-btn small', title: 'Vorheriger Monat', onclick: () => { miniDate = U.addMonths(miniDate, -1); miniDate._pinned = true; renderMini(root, selected, view); } }, h('span', { html: '‹' })),
      h('button', { class: 'icon-btn small', title: 'Nächster Monat', onclick: () => { miniDate = U.addMonths(miniDate, 1); miniDate._pinned = true; renderMini(root, selected, view); } }, h('span', { html: '›' })));
    const g = h('div', { class: 'mini-grid' });
    for (let i = 0; i < 7; i++) g.append(h('div', { class: 'mini-wd' }, U.WEEKDAYS_SHORT[(ws + i) % 7]));
    const start = U.startOfWeek(miniDate, ws);
    const r = range(view === 'week' || view === 'day' ? view : 'day', selected);
    const busy = new Set();
    for (const o of occurrences(start, U.addDays(start, 42), { noExtras: true })) busy.add(U.dateKey(o.start));
    for (let i = 0; i < 42; i++) {
      const d = U.addDays(start, i);
      const inSel = (view === 'week' || view === 'day') && d >= r.from && d < r.to;
      const b = h('button', {
        class: 'mini-day' + (d.getMonth() !== miniDate.getMonth() ? ' other' : '') + (U.sameDay(d, today) ? ' today' : '') + (U.sameDay(d, selected) ? ' sel' : '') + (inSel ? ' inrange' : '') + (busy.has(U.dateKey(d)) ? ' busy' : ''),
        dataset: { date: U.dateKey(d) },
      }, d.getDate());
      b.addEventListener('click', () => { miniDate._pinned = false; App.goto(d); });
      g.append(b);
    }
    root.append(head, g);
  }

  function resetMini() { miniDate = null; }

  function render(root, view, date, opts = {}) {
    root.innerHTML = '';
    root.className = 'view-container view-' + view;
    if (view === 'month') renderMonth(root, date);
    else if (view === 'week') renderTimeGrid(root, date, 7, opts);
    else if (view === 'day') renderTimeGrid(root, date, 1, opts);
    else if (view === 'year') renderYear(root, date);
    else renderAgenda(root, date);
  }

  return { render, renderAgenda, renderMini, resetMini, range, title, occurrences, hourPx: () => HOUR_PX, isTouchBusy: () => touchBusy, taskSheet };
})();
