/* Dialoge: Termin-Editor, Vorschau, Kalender-, Listen- und Einstellungsdialoge */
'use strict';

const Modal = (() => {
  const stack = [];
  function open(content, { width = 520, onClose, cls = '' } = {}) {
    const back = U.h('div', { class: 'modal-backdrop' });
    const box = U.h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true', style: { maxWidth: width + 'px' } }, content);
    back.append(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.body.append(back);
    const entry = { back, onClose };
    stack.push(entry);
    requestAnimationFrame(() => back.classList.add('show'));
    const first = box.querySelector('[autofocus], input:not([type=checkbox]):not([type=color]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return entry;
  }
  function close(result) {
    const e = stack.pop();
    if (!e) return;
    e.back.classList.remove('show');
    setTimeout(() => e.back.remove(), 150);
    e.onClose && e.onClose(result);
  }
  const isOpen = () => stack.length > 0;

  // Auswahl-Dialog -> Promise<value|null>
  function choose(title, text, options) {
    return new Promise((resolve) => {
      let done = false;
      const btns = options.map((o) => U.h('button', { class: 'btn ' + (o.primary ? 'btn-primary' : o.danger ? 'btn-danger' : 'btn-outline'), onclick: () => { done = true; close(); resolve(o.value); } }, o.label));
      const content = U.h('div', { class: 'choose' }, U.h('h3', null, title), text ? U.h('p', null, text) : null,
        U.h('div', { class: 'choose-btns' }, ...btns, U.h('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Abbrechen')));
      open(content, { width: 420, onClose: () => { if (!done) resolve(null); } });
    });
  }
  return { open, close, isOpen, choose };
})();

const Dialogs = (() => {
  const { h } = U;

  function colorPicker(current, inheritColor, onPick, inheritTitle = 'Kalenderfarbe verwenden') {
    const wrap = h('div', { class: 'color-picker' });
    const draw = (sel) => {
      wrap.innerHTML = '';
      if (inheritColor) {
        const b = h('button', { type: 'button', class: 'swatch inherit' + (!sel ? ' sel' : ''), title: inheritTitle, style: { background: inheritColor } }, '');
        b.addEventListener('click', () => { onPick(null); draw(null); });
        wrap.append(b);
      }
      for (const p of U.PALETTE) {
        const b = h('button', { type: 'button', class: 'swatch' + (sel && sel.toLowerCase() === p.hex ? ' sel' : ''), title: p.name, style: { background: p.hex } });
        b.addEventListener('click', () => { onPick(p.hex); draw(p.hex); });
        wrap.append(b);
      }
      const custom = h('label', { class: 'swatch custom' + (sel && !U.PALETTE.some((p) => p.hex === sel.toLowerCase()) ? ' sel' : ''), title: 'Eigene Farbe', style: sel && !U.PALETTE.some((p) => p.hex === sel.toLowerCase()) ? { background: sel } : null }, '+');
      const inp = h('input', { type: 'color', value: sel || inheritColor || '#6d5efc' });
      inp.addEventListener('input', () => { onPick(inp.value); });
      inp.addEventListener('change', () => draw(inp.value));
      custom.append(inp);
      wrap.append(custom);
    };
    draw(current);
    return { el: wrap, setInherit: (c) => { inheritColor = c; draw(current); } };
  }

  // ---------- Termin-Editor ----------
  // data: Felder für neuen Termin; occ: bestehendes Vorkommen (bearbeiten)
  function eventEditor(data = {}, occ = null, onClose) {
    const S = Store.state;
    const ev = occ ? occ.ev : null;
    // Startwerte: bei Wiederholung das angeklickte Vorkommen anzeigen
    const base = ev ? { ...ev, start: ev.allDay ? U.dateKey(occ.start) : U.dtKey(occ.start), end: ev.allDay ? U.dateKey(U.addDays(occ.end, -1)) : U.dtKey(occ.end) } : {
      title: '', calId: S.defaultCalendar, allDay: false, color: null, location: '', notes: '', rrule: null, reminder: null, ...data,
    };
    let cal = Store.calendar(base.calId) || S.calendars[0];
    if (!ev && cal.type === 'birthday') { base.allDay = true; base.rrule = base.rrule || { freq: 'yearly', interval: 1 }; }
    let color = base.color || null;
    let rrule = base.rrule ? JSON.parse(JSON.stringify(base.rrule)) : null;

    const sd = U.parseDate(base.start) || new Date();
    const ed = U.parseDate(base.end) || U.addMinutes(sd, 60);

    const title = h('input', { class: 'ed-title', placeholder: 'Titel hinzufügen', value: base.title || '', maxlength: 200, autofocus: true });
    const allDay = h('input', { type: 'checkbox', checked: !!base.allDay });
    const sDate = h('input', { type: 'date', value: U.dateKey(sd) });
    const sTime = h('input', { type: 'time', value: base.allDay ? '09:00' : U.fmtTime(sd), step: 300 });
    const eDate = h('input', { type: 'date', value: U.dateKey(ed) });
    const eTime = h('input', { type: 'time', value: base.allDay ? '10:00' : U.fmtTime(ed), step: 300 });

    const toggleTimes = () => { [sTime, eTime].forEach((x) => x.classList.toggle('hidden', allDay.checked)); };
    allDay.addEventListener('change', toggleTimes);
    toggleTimes();

    // Ende automatisch mitschieben, wenn Start verändert wird
    let lastStart = new Date(+sd);
    const readStart = () => U.parseDate(`${sDate.value}T${allDay.checked ? '00:00' : sTime.value || '00:00'}`);
    const readEnd = () => U.parseDate(`${eDate.value}T${allDay.checked ? '00:00' : eTime.value || '00:00'}`);
    const onStartChange = () => {
      const ns = readStart(); if (!ns) return;
      const ne = readEnd();
      const diff = ns - lastStart;
      if (ne) { const moved = new Date(ne.getTime() + diff); eDate.value = U.dateKey(moved); if (!allDay.checked) eTime.value = U.fmtTime(moved); }
      lastStart = ns;
      updateRecurOptions();
    };
    sDate.addEventListener('change', onStartChange);
    sTime.addEventListener('change', onStartChange);

    // Wiederholung
    const recur = h('select', { class: 'ed-recur' });
    const updateRecurOptions = () => {
      const s = readStart() || sd;
      const nth = Math.ceil(s.getDate() / 7);
      const isLast = U.addDays(s, 7).getMonth() !== s.getMonth();
      const opts = [
        ['none', 'Wiederholt sich nicht'],
        ['daily', 'Täglich'],
        ['weekly', `Wöchentlich am ${U.WEEKDAYS[s.getDay()]}`],
        ['workdays', 'Jeden Werktag (Mo–Fr)'],
        ['monthly', `Monatlich am ${s.getDate()}.`],
        ['monthlyW', `Monatlich am ${isLast && nth >= 4 ? 'letzten' : nth + '.'} ${U.WEEKDAYS[s.getDay()]}`],
        ['yearly', `Jährlich am ${s.getDate()}. ${U.MONTHS[s.getMonth()]}`],
        ['custom', 'Benutzerdefiniert …'],
      ];
      const cur = currentRecurKey();
      recur.innerHTML = '';
      for (const [v, l] of opts) recur.append(h('option', { value: v, selected: v === cur }, l));
      if (cur === 'custom' && rrule) recur.querySelector('option[value=custom]').textContent = Recur.describe(rrule, U.dtKey(s));
    };
    const currentRecurKey = () => {
      if (!rrule || !rrule.freq) return 'none';
      const simple = (rrule.interval || 1) === 1 && !rrule.until && !rrule.count;
      const s = readStart() || sd;
      if (simple && rrule.freq === 'daily') return 'daily';
      if (simple && rrule.freq === 'weekly') {
        const d = rrule.byDay || [];
        if (!d.length || (d.length === 1 && d[0] === s.getDay())) return 'weekly';
        if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return 'workdays';
      }
      if (simple && rrule.freq === 'monthly') return rrule.monthlyMode === 'weekday' ? 'monthlyW' : 'monthly';
      if (simple && rrule.freq === 'yearly') return 'yearly';
      return 'custom';
    };
    recur.addEventListener('change', async () => {
      const s = readStart() || sd;
      const v = recur.value;
      if (v === 'none') rrule = null;
      else if (v === 'daily') rrule = { freq: 'daily', interval: 1 };
      else if (v === 'weekly') rrule = { freq: 'weekly', interval: 1, byDay: [s.getDay()] };
      else if (v === 'workdays') rrule = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
      else if (v === 'monthly') rrule = { freq: 'monthly', interval: 1 };
      else if (v === 'monthlyW') rrule = { freq: 'monthly', interval: 1, monthlyMode: 'weekday' };
      else if (v === 'yearly') rrule = { freq: 'yearly', interval: 1 };
      else if (v === 'custom') {
        const r = await customRecur(rrule || { freq: 'weekly', interval: 1, byDay: [s.getDay()] }, s);
        if (r) rrule = r;
      }
      updateRecurOptions();
    });
    updateRecurOptions();

    // Kalender
    const calSel = h('select', null, ...S.calendars.filter((c) => c.type !== 'subscription' || c.id === cal.id).map((c) => h('option', { value: c.id, selected: c.id === cal.id }, c.name)));
    const calDot = h('span', { class: 'dot big', style: { background: cal.color } });
    const birthRow = h('label', { class: 'ed-row' }, h('span', { class: 'ed-ico', title: 'Geburtsjahr' }, '🎂'));
    const birthYear = h('input', { type: 'number', min: 1900, max: 2100, placeholder: 'Geburtsjahr (optional, für Altersanzeige)', value: base.birthYear || '' });
    birthRow.append(birthYear);
    const picker = colorPicker(color, cal.color, (c) => { color = c; title.style.borderBottomColor = c || cal.color; });
    const syncCal = () => {
      cal = Store.calendar(calSel.value);
      calDot.style.background = cal.color;
      picker.setInherit(cal.color);
      birthRow.classList.toggle('hidden', cal.type !== 'birthday');
      title.style.borderBottomColor = color || cal.color;
    };
    calSel.addEventListener('change', () => {
      syncCal();
      if (cal.type === 'birthday' && !ev) {
        allDay.checked = true; toggleTimes();
        rrule = { freq: 'yearly', interval: 1 }; updateRecurOptions();
      }
    });

    const location = h('input', { placeholder: 'Ort hinzufügen', value: base.location || '' });
    const reminder = h('select', null, ...[[null, 'Keine Erinnerung'], [0, 'Zu Beginn'], [5, '5 Minuten vorher'], [10, '10 Minuten vorher'], [15, '15 Minuten vorher'], [30, '30 Minuten vorher'], [60, '1 Stunde vorher'], [120, '2 Stunden vorher'], [1440, '1 Tag vorher'], [10080, '1 Woche vorher']]
      .map(([v, l]) => h('option', { value: v ?? '', selected: (base.reminder ?? null) === v }, l)));
    const notes = h('textarea', { placeholder: 'Beschreibung hinzufügen', rows: 3 }, base.notes || '');

    const content = h('form', { class: 'editor' },
      h('div', { class: 'ed-head' }, h('h3', null, ev ? 'Termin bearbeiten' : 'Neuer Termin'), h('button', { type: 'button', class: 'icon-btn', title: 'Schließen (Esc)', onclick: () => Modal.close() }, '✕')),
      title,
      h('div', { class: 'ed-row ed-when' }, h('span', { class: 'ed-ico' }, '🕒'),
        h('div', { class: 'ed-dt' }, h('div', { class: 'ed-dt-line' }, sDate, sTime, h('span', { class: 'ed-to' }, 'bis'), eDate, eTime),
          h('div', { class: 'ed-dt-line' }, h('label', { class: 'check' }, allDay, ' Ganztägig'), recur))),
      h('label', { class: 'ed-row' }, h('span', { class: 'ed-ico' }, calDot), calSel),
      birthRow,
      h('div', { class: 'ed-row' }, h('span', { class: 'ed-ico' }, '🎨'), picker.el),
      h('label', { class: 'ed-row' }, h('span', { class: 'ed-ico' }, '📍'), location),
      h('label', { class: 'ed-row' }, h('span', { class: 'ed-ico' }, '🔔'), reminder),
      h('label', { class: 'ed-row' }, h('span', { class: 'ed-ico' }, '📝'), notes),
      h('div', { class: 'ed-actions' },
        ev ? h('button', { type: 'button', class: 'btn btn-danger-ghost', onclick: () => { Modal.close(); App.deleteOccurrence(occ); } }, 'Löschen') : null,
        ev ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { Modal.close(); App.duplicateEvent(ev); } }, 'Duplizieren') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern')));
    syncCal();

    content.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); content.requestSubmit(); } });
    content.addEventListener('submit', async (e) => {
      e.preventDefault();
      let s = readStart(), en = readEnd();
      if (!s) { sDate.focus(); return; }
      if (!en || en < s || (!allDay.checked && +en === +s)) en = allDay.checked ? s : U.addMinutes(s, 60);
      const out = {
        title: title.value.trim(), calId: cal.id, allDay: allDay.checked,
        start: allDay.checked ? U.dateKey(s) : U.dtKey(s), end: allDay.checked ? U.dateKey(en) : U.dtKey(en),
        color, location: location.value.trim(), notes: notes.value, rrule: rrule && rrule.freq ? rrule : null,
        reminder: reminder.value === '' ? null : +reminder.value,
        birthYear: cal.type === 'birthday' && birthYear.value ? +birthYear.value : null,
      };
      if (out.rrule && out.rrule.freq === 'weekly' && (!out.rrule.byDay || !out.rrule.byDay.length)) out.rrule.byDay = [s.getDay()];
      if (!ev) {
        Store.addEvent(out);
        Modal.close();
        App.toast('Termin gespeichert');
        return;
      }
      if (ev.rrule && ev.rrule.freq) {
        const scope = await Modal.choose('Wiederkehrenden Termin speichern', null, [
          { label: 'Nur diesen Termin', value: 'this' },
          { label: 'Diesen und alle folgenden', value: 'following' },
          { label: 'Alle Termine', value: 'all', primary: true },
        ]);
        if (!scope) return;
        App.applyRecurringEdit(occ, out, scope);
      } else {
        Store.snapshot();
        Store.updateEvent(ev.id, out);
      }
      Modal.close();
      App.toast('Termin aktualisiert');
    });

    return Modal.open(content, { width: 660, onClose, cls: 'modal-editor' });
  }

  function customRecur(r, start) {
    return new Promise((resolve) => {
      let done = false;
      const interval = h('input', { type: 'number', min: 1, max: 99, value: r.interval || 1, style: { width: '70px' } });
      const freq = h('select', null, ...[['daily', 'Tag(e)'], ['weekly', 'Woche(n)'], ['monthly', 'Monat(e)'], ['yearly', 'Jahr(e)']].map(([v, l]) => h('option', { value: v, selected: r.freq === v }, l)));
      const days = new Set(r.byDay && r.byDay.length ? r.byDay : [start.getDay()]);
      const dayBtns = h('div', { class: 'day-toggles' }, ...[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const b = h('button', { type: 'button', class: 'day-toggle' + (days.has(d) ? ' on' : '') }, U.WEEKDAYS_SHORT[d]);
        b.addEventListener('click', () => { if (days.has(d)) { if (days.size > 1) days.delete(d); } else days.add(d); b.classList.toggle('on', days.has(d)); });
        return b;
      }));
      const monthMode = h('select', null, h('option', { value: 'day', selected: r.monthlyMode !== 'weekday' }, `Am ${start.getDate()}. des Monats`), h('option', { value: 'weekday', selected: r.monthlyMode === 'weekday' }, `Am ${Math.ceil(start.getDate() / 7)}. ${U.WEEKDAYS[start.getDay()]}`));
      const endMode = h('select', null, h('option', { value: 'never', selected: !r.until && !r.count }, 'Nie'), h('option', { value: 'until', selected: !!r.until }, 'Am'), h('option', { value: 'count', selected: !!r.count }, 'Nach'));
      const until = h('input', { type: 'date', value: r.until || U.dateKey(U.addMonths(start, 3)) });
      const count = h('input', { type: 'number', min: 1, max: 999, value: r.count || 10, style: { width: '80px' } });
      const countLbl = h('span', null, 'Terminen');
      const sync = () => {
        dayBtns.classList.toggle('hidden', freq.value !== 'weekly');
        monthMode.classList.toggle('hidden', freq.value !== 'monthly');
        until.classList.toggle('hidden', endMode.value !== 'until');
        count.classList.toggle('hidden', endMode.value !== 'count');
        countLbl.classList.toggle('hidden', endMode.value !== 'count');
      };
      [freq, endMode].forEach((x) => x.addEventListener('change', sync));
      const ok = () => {
        const res = { freq: freq.value, interval: Math.max(1, +interval.value || 1) };
        if (res.freq === 'weekly') res.byDay = [...days];
        if (res.freq === 'monthly' && monthMode.value === 'weekday') res.monthlyMode = 'weekday';
        if (endMode.value === 'until') res.until = until.value;
        if (endMode.value === 'count') res.count = Math.max(1, +count.value || 1);
        done = true; Modal.close(); resolve(res);
      };
      const content = h('div', { class: 'custom-recur' },
        h('h3', null, 'Benutzerdefinierte Wiederholung'),
        h('div', { class: 'cr-line' }, 'Wiederholen alle', interval, freq),
        dayBtns, monthMode,
        h('div', { class: 'cr-line' }, 'Endet', endMode, until, count, countLbl),
        h('div', { class: 'ed-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'), h('button', { class: 'btn btn-primary', onclick: ok }, 'Fertig')));
      sync();
      Modal.open(content, { width: 440, onClose: () => { if (!done) resolve(null); } });
    });
  }

  // ---------- Kalender bearbeiten ----------
  function editCalendar(cal) {
    const isNew = !cal;
    const S = Store.state;
    let color = cal ? cal.color : U.PALETTE[(S.calendars.length * 3) % U.PALETTE.length].hex;
    const name = h('input', { value: cal ? cal.name : '', placeholder: 'Name, z. B. Arbeit, Sport, Familie', maxlength: 60 });
    const type = h('select', null, h('option', { value: 'normal', selected: !cal || cal.type !== 'birthday' }, 'Normaler Kalender'), h('option', { value: 'birthday', selected: cal && cal.type === 'birthday' }, 'Geburtstagskalender (jährlich, mit Alter)'));
    const isDefault = h('input', { type: 'checkbox', checked: cal ? S.defaultCalendar === cal.id : false });
    const picker = colorPicker(color, null, (c) => { color = c; });
    const content = h('form', { class: 'simple-form' },
      h('h3', null, isNew ? 'Neuer Kalender' : 'Kalender bearbeiten'),
      h('label', null, 'Name', name),
      h('label', null, 'Art', type),
      h('div', { class: 'lbl' }, 'Farbe'), picker.el,
      h('label', { class: 'check' }, isDefault, ' Standardkalender für neue Termine'),
      h('div', { class: 'ed-actions' },
        !isNew && S.calendars.length > 1 ? h('button', { type: 'button', class: 'btn btn-danger-ghost', onclick: async () => {
          const n = S.events.filter((e) => e.calId === cal.id).length;
          const ok = await Modal.choose(`„${cal.name}“ löschen?`, n ? `Dabei werden ${n} Termin(e) gelöscht.` : null, [{ label: 'Löschen', value: true, danger: true }]);
          if (ok) { Store.removeCalendar(cal.id); Modal.close(); App.toast('Kalender gelöscht', { undo: true }); }
        } }, 'Löschen') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern')));
    content.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = { name: name.value.trim() || 'Kalender', color: color || '#039be5', type: type.value };
      let c;
      if (isNew) c = Store.addCalendar(data); else { Store.updateCalendar(cal.id, data); c = cal; }
      if (isDefault.checked) { S.defaultCalendar = c.id; Store.emit('calendars'); }
      Modal.close();
    });
    Modal.open(content, { width: 460 });
  }

  function editTodoList(list) {
    const isNew = !list;
    let color = list ? list.color : U.PALETTE[(Store.state.todoLists.length * 5) % U.PALETTE.length].hex;
    const name = h('input', { value: list ? list.name : '', placeholder: 'Name der Liste', maxlength: 40 });
    const picker = colorPicker(color, null, (c) => { color = c; });
    const content = h('form', { class: 'simple-form' },
      h('h3', null, isNew ? 'Neue Aufgabenliste' : 'Liste bearbeiten'),
      h('label', null, 'Name', name), h('div', { class: 'lbl' }, 'Farbe'), picker.el,
      h('div', { class: 'ed-actions' },
        !isNew && Store.state.todoLists.length > 1 ? h('button', { type: 'button', class: 'btn btn-danger-ghost', onclick: async () => {
          const n = Store.state.todos.filter((t) => t.listId === list.id).length;
          const ok = await Modal.choose(`Liste „${list.name}“ löschen?`, n ? `${n} Aufgabe(n) werden mitgelöscht.` : null, [{ label: 'Löschen', value: true, danger: true }]);
          if (ok) { Store.removeTodoList(list.id); Modal.close(); App.toast('Liste gelöscht', { undo: true }); }
        } }, 'Löschen') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern')));
    content.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = { name: name.value.trim() || 'Liste', color: color || '#6d5efc' };
      if (isNew) Store.addTodoList(data); else Store.updateTodoList(list.id, data);
      Modal.close();
    });
    Modal.open(content, { width: 420 });
  }

  // ---------- Schnellfenster „Aufgabe hinzufügen“ für einen Tag ----------
  // Farbe: null = Farbe der Liste (wie bisher), sonst eigene Farbe nur für diese Aufgabe.
  function quickTodo(day, onAdded) {
    const S = Store.state;
    const listId = S.settings.todoListFilter || S.todoLists[0]?.id;
    const list = Store.todoList(listId);
    let color = null;
    const title = h('input', { placeholder: 'Was ist zu tun?', maxlength: 200, autofocus: true });
    const notes = h('textarea', { placeholder: 'Beschreibung (optional)', rows: 2 });
    const picker = colorPicker(null, list ? list.color : '#616161', (c) => { color = c; }, 'Standardfarbe');
    const content = h('form', { class: 'simple-form quick-todo' },
      h('h3', null, 'Aufgabe hinzufügen'),
      h('small', { class: 'qt-day' }, U.sameDay(day, new Date()) ? 'Heute · ' + U.fmtDateShort(day) : U.fmtDateShort(day)),
      title, notes, h('div', { class: 'lbl' }, 'Farbe'), picker.el,
      h('div', { class: 'ed-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost small qt-event', title: 'Stattdessen einen ganztägigen Termin anlegen',
          onclick: () => { Modal.close(); App.openEditor({ allDay: true, start: U.dateKey(day), end: U.dateKey(day) }); } }, 'Ganztägiger Termin'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Hinzufügen')));
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); content.requestSubmit(); } });
    content.addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = title.value.trim();
      if (!txt) { title.focus(); return; }
      const p = Todos.parseQuick(txt);
      const t = Store.addTodo({ title: p.title || txt, notes: notes.value.trim(), due: U.dateKey(day), time: p.time || null,
        priority: p.priority || 0, listId: p.listId || listId, color });
      Modal.close();
      App.toast('Aufgabe hinzugefügt');
      onAdded && onAdded(t);
    });
    Modal.open(content, { width: 420, cls: 'modal-quick-todo' });
  }

  // ---------- Einstellungen ----------
  function settings() {
    const S = Store.state;
    const st = S.settings;
    const row = (label, control, hint) => h('label', { class: 'set-row' }, h('span', null, label, hint ? h('small', null, hint) : null), control);
    const sel = (key, opts, num) => {
      const s = h('select', null, ...opts.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l)));
      s.addEventListener('change', () => { Store.setSetting(key, num ? +s.value : s.value); if (key === 'theme') App.applyTheme(); });
      return s;
    };
    const chk = (key) => { const c = h('input', { type: 'checkbox', class: 'switch', checked: !!st[key] }); c.addEventListener('change', () => Store.setSetting(key, c.checked)); return c; };

    const fileJson = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
    fileJson.addEventListener('change', async () => {
      const f = fileJson.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.events || !data.calendars) throw new Error('Format');
        const ok = await Modal.choose('Sicherung wiederherstellen?', 'Alle aktuellen Daten werden durch die Sicherung ersetzt.', [{ label: 'Ersetzen', value: true, danger: true }]);
        if (ok) { Store.replaceAll(data); App.applyTheme(); App.toast('Sicherung wiederhergestellt', { undo: true }); }
      } catch (e) { App.toast('Datei konnte nicht gelesen werden.', { type: 'error' }); }
      fileJson.value = '';
    });
    const icsCal = h('select', null, ...S.calendars.filter((c) => c.type !== 'subscription').map((c) => h('option', { value: c.id, selected: c.id === S.defaultCalendar }, c.name)));
    const fileIcs = h('input', { type: 'file', accept: '.ics,text/calendar', class: 'hidden' });
    fileIcs.addEventListener('change', async () => {
      const f = fileIcs.files[0]; if (!f) return;
      try {
        const evs = ICS.importText(await f.text(), icsCal.value);
        if (!evs.length) throw new Error('leer');
        Store.snapshot();
        S.events.push(...evs);
        Store.emit('events');
        App.toast(`${evs.length} Termine importiert`, { undo: true });
      } catch (e) { App.toast('Keine Termine in der Datei gefunden.', { type: 'error' }); }
      fileIcs.value = '';
    });

    const content = h('div', { class: 'settings' },
      h('div', { class: 'ed-head' }, h('h3', null, 'Einstellungen'), h('button', { class: 'icon-btn', onclick: () => Modal.close() }, '✕')),
      syncSection(),
      h('h4', null, 'Darstellung'),
      row('Design', sel('theme', [['system', 'Wie System'], ['light', 'Hell'], ['dark', 'Dunkel']])),
      row('Woche beginnt am', sel('weekStart', [[1, 'Montag'], [0, 'Sonntag'], [6, 'Samstag']], true)),
      row('Kalenderwochen anzeigen', chk('showWeekNumbers')),
      row('Tagesansicht scrollt zu', sel('dayStartHour', Array.from({ length: 13 }, (_, i) => [i + 4, `${U.pad(i + 4)}:00 Uhr`]), true), 'wenn heute nicht sichtbar ist'),
      row('Standarddauer neuer Termine', sel('defaultDuration', [[15, '15 Minuten'], [30, '30 Minuten'], [45, '45 Minuten'], [60, '1 Stunde'], [90, '1,5 Stunden'], [120, '2 Stunden']], true)),
      aiSection(),
      h('h4', null, 'Feiertage & Aufgaben'),
      row('Feiertage anzeigen', chk('holidays')),
      row('Bundesland', sel('holidayState', Object.entries(Holidays.STATES))),
      row('Aufgaben mit Datum im Kalender zeigen', chk('showTodosInCalendar')),
      row('Ka-Ching-Ton beim Erledigen', chk('soundDone')),
      row('Termine im Tagesfortschritt mitzählen', chk('progressCountsEvents'), 'vergangene Termine von heute gelten als erledigt'),
      Subs.settingsSection(),
      h('h4', null, 'Daten'),
      h('p', { class: 'muted' }, 'Alle Daten liegen nur hier im Browser (localStorage). Mach ab und zu eine Sicherung.'),
      h('div', { class: 'set-btns' },
        h('button', { class: 'btn btn-outline', onclick: () => U.download(`kalender-sicherung-${U.dateKey(new Date())}.json`, JSON.stringify({ ...S, settings: { ...S.settings, aiKey: '' } }, null, 2), 'application/json') }, '⬇ Sicherung speichern (.json)'),
        h('button', { class: 'btn btn-outline', onclick: () => fileJson.click() }, '⬆ Sicherung laden'), fileJson),
      h('div', { class: 'set-btns' },
        h('button', { class: 'btn btn-outline', onclick: () => U.download(`kalender-${U.dateKey(new Date())}.ics`, ICS.exportEvents(S.events, S.calendars), 'text/calendar') }, '⬇ Alle Termine als .ics exportieren')),
      h('div', { class: 'set-btns' }, h('span', null, '.ics importieren (z. B. aus Google oder Proton) in'), icsCal,
        h('button', { class: 'btn btn-outline', onclick: () => fileIcs.click() }, '⬆ Datei wählen'), fileIcs),
      h('div', { class: 'set-btns danger-zone' },
        h('button', { class: 'btn btn-danger-ghost', onclick: async () => {
          const ok = await Modal.choose('Alles zurücksetzen?', 'Alle Termine, Kalender und Aufgaben werden gelöscht.', [{ label: 'Zurücksetzen', value: true, danger: true }]);
          if (ok) { Store.reset(); App.applyTheme(); App.toast('Zurückgesetzt', { undo: true }); }
        } }, 'Alles zurücksetzen')));
    Modal.open(content, { width: 600, cls: 'modal-settings' });
  }

  function aiSection() {
    const st = Store.state.settings;
    const prov = h('select', null, h('option', { value: '' }, 'Aus'),
      ...Object.entries(AI.PROVIDERS).map(([k, p]) => h('option', { value: k, selected: st.aiProvider === k }, p.name + (k === 'gemini' ? ' (kostenlos)' : ' (empfohlen)'))));
    const key = h('input', { type: 'password', placeholder: 'API-Schlüssel einfügen', value: st.aiKey || '', autocomplete: 'off', spellcheck: false });
    const msg = h('small', { class: 'ai-msg' });
    const help = h('p', { class: 'muted small' });
    const updHelp = () => {
      help.innerHTML = prov.value === 'gemini'
        ? 'Schlüssel kostenlos holen: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → „Create API key“ → kopieren und hier einfügen.'
        : prov.value === 'claude'
          ? 'Schlüssel holen: <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> → „Create Key“ → kopieren und hier einfügen. Braucht etwas Guthaben (wenige Cent im Monat).'
          : 'Mit KI kannst du Aufgaben ganz frei eintippen, z. B. „am Freitag nach der Arbeit noch Geschenk für Mama kaufen“.';
      key.parentNode && (key.closest('.set-row').hidden = !prov.value);
    };
    const refreshHint = () => U.$('#todoAddInput').dispatchEvent(new Event('input'));
    prov.addEventListener('change', () => { Store.setSetting('aiProvider', prov.value); msg.textContent = ''; updHelp(); refreshHint(); });
    key.addEventListener('change', () => { Store.setSetting('aiKey', key.value.trim()); msg.textContent = ''; refreshHint(); });
    const testBtn = h('button', { type: 'button', class: 'btn btn-outline small', onclick: async () => {
      Store.setSetting('aiKey', key.value.trim());
      if (!AI.enabled()) { msg.textContent = 'Bitte Anbieter wählen und Schlüssel einfügen.'; return; }
      msg.textContent = 'Teste …'; testBtn.disabled = true;
      try { msg.textContent = (await AI.test()) ? '✓ Funktioniert' : 'Antwort war leer.'; }
      catch (e) { msg.textContent = e.userMsg || 'Fehler: ' + e.message; }
      testBtn.disabled = false;
    } }, 'Testen');
    const box = h('div', null, h('h4', null, '✨ KI für Aufgaben'),
      h('label', { class: 'set-row' }, h('span', null, 'Anbieter'), prov),
      help,
      h('div', { class: 'set-row ai-key-row' }, h('span', null, 'Schlüssel', h('small', null, 'bleibt privat in deinem Konto')), h('div', { class: 'ai-key' }, key, testBtn)),
      msg);
    setTimeout(updHelp);
    return box;
  }

  function syncSection() {
    const i = Sync.info();
    if (!i.enabled) return h('div', null, h('h4', null, 'Sync'), h('p', { class: 'muted' }, 'Sync ist noch nicht eingerichtet. Die Daten liegen nur in diesem Browser.'));
    return h('div', null, h('h4', null, 'Konto & Sync'),
      h('div', { class: 'set-row' }, h('span', null, i.email || 'Nicht angemeldet', h('small', null, { ok: 'Alles synchronisiert', saving: 'Wird gespeichert …', offline: 'Offline – wird nachgeholt', error: 'Sync-Fehler', login: 'Bitte anmelden' }[i.status] || '')),
        i.email ? h('button', { class: 'btn btn-outline small', onclick: () => { Modal.close(); Sync.logout(); } }, 'Abmelden') : null));
  }

  function shortcuts() {
    const rows = [['T', 'Zu heute springen'], ['D / W / M / Y / A', 'Tag / Woche / Monat / Jahr / Liste'], ['← → oder J / K', 'Zurück / Weiter'], ['N oder C', 'Neuer Termin'], ['Q', 'Neue Aufgabe'], ['/', 'Suchen'], ['Strg + Z', 'Rückgängig'], ['Strg + Enter', 'Termin speichern'], ['Esc', 'Schließen'], ['?', 'Diese Hilfe']];
    Modal.open(h('div', { class: 'shortcuts' }, h('div', { class: 'ed-head' }, h('h3', null, 'Tastenkürzel'), h('button', { class: 'icon-btn', onclick: () => Modal.close() }, '✕')),
      h('table', null, ...rows.map(([k, v]) => h('tr', null, h('td', null, ...k.split(' ').map((p) => (p.length <= 5 && p !== 'oder' && p !== '/' ? h('kbd', null, p) : ' ' + p + ' '))), h('td', null, v))))), { width: 440 });
  }

  return { eventEditor, editCalendar, editTodoList, quickTodo, settings, shortcuts, colorPicker };
})();
