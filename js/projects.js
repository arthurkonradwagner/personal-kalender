/* Projekte: große Vorhaben ohne festes Datum, optional einem Monat oder Jahr zugeordnet */
'use strict';

const Projects = (() => {
  const { h } = U;
  const COLORS = ['#d7d9de', '#7986cb', '#33b679', '#039be5', '#f6bf26', '#e67c73', '#8e24aa', '#f4511e'];

  const S = () => Store.state;
  const list = () => S().projects || (S().projects = []);
  const get = (id) => list().find((p) => p.id === id);
  const save = () => Store.emit('todos');
  function add(title, horizon) {
    const p = { id: 'prj-' + U.uid(), title, notes: '', horizon: horizon || null, color: COLORS[list().length % COLORS.length], steps: [], done: false, doneAt: null, createdAt: Date.now() };
    list().unshift(p); save(); return p;
  }
  function update(id, patch) { Object.assign(get(id), patch); save(); }
  function remove(id) { Store.snapshot(); S().projects = list().filter((p) => p.id !== id); save(); App.toast('Projekt gelöscht', { undo: true }); }

  // Zeitraum: null | 'YYYY-MM' | 'YYYY'
  const now = () => new Date();
  const ym = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`;
  const horizonLabel = (hz) => {
    if (!hz) return 'Irgendwann';
    if (/^\d{4}$/.test(hz)) return hz === String(now().getFullYear()) ? `Dieses Jahr · ${hz}` : hz;
    const [y, m] = hz.split('-').map(Number);
    const name = `${U.MONTHS[m - 1]} ${y}`;
    return hz === ym(now()) ? `Diesen Monat · ${name}` : name;
  };
  const horizonShort = (hz) => {
    if (!hz) return 'Ohne Zeitraum';
    if (/^\d{4}$/.test(hz)) return hz;
    const [y, m] = hz.split('-').map(Number);
    return `${U.MONTHS_SHORT[m - 1]} ${y}`;
  };
  const isPast = (hz) => hz && (/^\d{4}$/.test(hz) ? +hz < now().getFullYear() : hz < ym(now()));
  const sortKey = (hz) => !hz ? '9999-99' : /^\d{4}$/.test(hz) ? hz + '-13' : hz;

  function horizonSelect(value, onChange) {
    const d = now();
    const opts = [['', 'Ohne Zeitraum']];
    for (let i = 0; i < 18; i++) { const m = new Date(d.getFullYear(), d.getMonth() + i, 1); opts.push([ym(m), `${U.MONTHS[m.getMonth()]} ${m.getFullYear()}`]); }
    for (let y = d.getFullYear(); y <= d.getFullYear() + 3; y++) opts.push([String(y), `Ganzes Jahr ${y}`]);
    if (value && !opts.some(([v]) => v === value)) opts.push([value, horizonShort(value)]);
    const sel = h('select', null, ...opts.map(([v, l]) => h('option', { value: v, selected: (value || '') === v }, l)));
    sel.addEventListener('change', () => onChange(sel.value || null));
    return sel;
  }
  function colorRow(value, onPick) {
    const row = h('div', { class: 'prj-colors' });
    const draw = (sel) => {
      row.replaceChildren(...COLORS.map((c) => {
        const b = h('button', { type: 'button', class: 'swatch' + (c === sel ? ' sel' : ''), title: 'Farbe', style: { background: c } });
        b.addEventListener('click', () => { onPick(c); draw(c); });
        return b;
      }));
    };
    draw(value);
    return row;
  }
  const field = (label, el) => h('label', { class: 'prj-field' }, h('span', null, label), el);
  const stepCount = (p) => `${p.steps.filter((s) => s.done).length}/${p.steps.length} Schritte`;
  const groupKey = (p) => isPast(p.horizon) ? 'late' : (p.horizon || '');
  const groupLabel = (k) => k === 'late' ? 'Zeitraum überschritten' : horizonLabel(k);

  const progress = (p) => p.steps.length ? Math.round((p.steps.filter((s) => s.done).length / p.steps.length) * 100) : (p.done ? 100 : 0);

  // Übersicht: ruhige Karte mit Farbstreifen, Titel, Zeitraum, Fortschritt
  function card(p) {
    const el = h('button', { type: 'button', class: 'prj-card' + (p.done ? ' done' : '') + (isPast(p.horizon) && !p.done ? ' late' : ''), style: { '--c': p.color } },
      h('span', { class: 'prj-title' }, p.title),
      h('span', { class: 'prj-meta' },
        h('span', { class: 'prj-hz' }, horizonShort(p.horizon)),
        h('span', null, p.steps.length ? stepCount(p) : 'Noch keine Schritte')),
      h('span', { class: 'prj-bar' }, h('i', { style: { width: progress(p) + '%' } })));
    el.addEventListener('click', () => edit(p.id));
    return el;
  }

  // Neues Projekt: Fenster (am Handy von unten)
  function create() {
    let color = COLORS[list().length % COLORS.length], horizon = null;
    const title = h('input', { class: 'prj-ed-title', placeholder: 'z. B. „Bachelorarbeit schreiben“', maxlength: 200, autofocus: true });
    const notes = h('textarea', { rows: 3, placeholder: 'Notizen, Ideen, Links …' });
    const form = h('form', { class: 'prj-form' },
      h('h3', null, 'Neues Projekt'),
      field('Titel', title),
      field('Zeitraum', horizonSelect(null, (v) => { horizon = v; })),
      h('div', { class: 'prj-field' }, h('span', null, 'Farbe'), colorRow(color, (c) => { color = c; })),
      field('Notizen', notes),
      h('div', { class: 'prj-foot' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => Modal.close() }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Anlegen')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = title.value.trim();
      if (!t) { title.focus(); return; }
      const p = add(t, horizon);
      update(p.id, { color, notes: notes.value });
      Modal.close();
    });
    Modal.open(form, { width: 460, cls: 'prj-modal' });
  }

  // Schritte per Ziehen am Griff sortieren (Maus und Finger)
  function sortable(box, p, redraw) {
    box.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.prj-grip');
      if (!grip) return;
      e.preventDefault();
      const row = grip.closest('.prj-step');
      row.classList.add('dragging');
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const over = [...box.children].find((r) => r !== row && ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        box.insertBefore(row, over || null);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        row.classList.remove('dragging');
        const order = [...box.children].map((r) => r.dataset.id);
        p.steps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        save(); redraw();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
  }

  // Bearbeiten: eigenes Fenster bzw. Blatt von unten
  function edit(id) {
    const p = get(id);
    if (!p) return;
    const wrap = h('div', { class: 'prj-editor', style: { '--c': p.color } });
    const title = h('input', { class: 'prj-ed-title', value: p.title, maxlength: 200, 'aria-label': 'Titel' });
    const notes = h('textarea', { rows: 3, placeholder: 'Notizen, Ideen, Links …' }, p.notes || '');
    const commit = () => {
      if (!get(id)) return;
      const t = title.value.trim() || p.title;
      if (t !== p.title || notes.value !== (p.notes || '')) update(id, { title: t, notes: notes.value });
    };
    title.addEventListener('change', commit);
    notes.addEventListener('change', commit);

    const steps = h('div', { class: 'prj-steps' });
    const label = h('div', { class: 'prj-label' });
    const stepIn = h('input', { class: 'prj-step-in', placeholder: '+ Schritt hinzufügen', maxlength: 200, enterkeyhint: 'enter' });
    const drawSteps = () => {
      label.textContent = p.steps.length ? 'Schritte · ' + stepCount(p).replace(' Schritte', '') : 'Schritte';
      steps.replaceChildren(...p.steps.map((s) => {
        const row = h('div', { class: 'prj-step' + (s.done ? ' done' : ''), dataset: { id: s.id } });
        const check = h('button', { type: 'button', class: 'todo-check', title: s.done ? 'Als offen markieren' : 'Erledigt', style: { '--p': 'var(--border-strong)' } },
          h('svg', { viewBox: '0 0 24 24', html: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' }));
        check.addEventListener('click', () => {
          if (s.done) { s.done = false; save(); drawSteps(); return; }
          Sound.done(check);
          row.classList.add('completing');
          setTimeout(() => { s.done = true; save(); drawSteps(); }, 380);
        });
        const x = h('button', { type: 'button', class: 'prj-x', title: 'Schritt entfernen' }, '✕');
        x.addEventListener('click', () => { p.steps = p.steps.filter((y) => y !== s); save(); drawSteps(); });
        row.append(h('span', { class: 'prj-grip', title: 'Ziehen zum Sortieren', 'aria-hidden': 'true' }, '⋮⋮'), check, h('span', { class: 'prj-step-t' }, s.title), x);
        return row;
      }));
    };
    sortable(steps, p, drawSteps);
    stepIn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const t = stepIn.value.trim();
      if (!t) return;
      p.steps.push({ id: U.uid(), title: t, done: false });
      stepIn.value = '';
      save(); drawSteps(); stepIn.focus();
    });
    drawSteps();

    const finish = h('button', { type: 'button', class: 'btn ' + (p.done ? 'btn-outline' : 'btn-primary') }, p.done ? 'Wieder öffnen' : '✓ Projekt abschließen');
    finish.addEventListener('click', (e) => {
      commit();
      if (!p.done) Sound.done(e.currentTarget);
      update(id, { done: !p.done, doneAt: p.done ? null : Date.now() });
      Modal.close();
    });
    const del = h('button', { type: 'button', class: 'btn btn-danger-ghost small' }, 'Löschen');
    del.addEventListener('click', () => { Modal.close(); remove(id); });

    wrap.append(title,
      label, steps, stepIn,
      field('Zeitraum', horizonSelect(p.horizon, (v) => update(id, { horizon: v }))),
      h('div', { class: 'prj-field' }, h('span', null, 'Farbe'), colorRow(p.color, (c) => { wrap.style.setProperty('--c', c); update(id, { color: c }); })),
      field('Notizen', notes),
      h('div', { class: 'prj-foot' }, del, finish));
    Modal.open(wrap, { width: 520, cls: 'prj-modal', onClose: commit });
    // Handy: Tastatur nicht sofort aufklappen, Modal fokussiert sonst den Titel
    if (matchMedia('(hover: none)').matches) setTimeout(() => title.blur(), 60);
  }

  let filter = '*';       // '*' = alle Zeiträume, sonst Gruppenschlüssel ('' = Irgendwann)
  let showDone = false;   // „Abgeschlossen“ aufgeklappt

  function render(box) {
    const all = list();
    const active = all.filter((p) => !p.done).sort((a, b) => sortKey(a.horizon).localeCompare(sortKey(b.horizon)));
    const groups = new Map();
    for (const p of active) {
      const k = groupKey(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const order = [...groups.keys()].sort((a, b) => (a === 'late' ? -1 : b === 'late' ? 1 : sortKey(a).localeCompare(sortKey(b))));
    if (filter !== '*' && !groups.has(filter)) filter = '*';

    const addBtn = h('button', { type: 'button', class: 'btn btn-primary prj-new' }, '+ Projekt');
    addBtn.addEventListener('click', create);
    const sel = h('select', { class: 'prj-filter', 'aria-label': 'Zeitraum filtern' },
      h('option', { value: '*' }, 'Zeitraum: Alle'),
      ...order.map((k) => h('option', { value: k, selected: k === filter }, 'Zeitraum: ' + groupLabel(k))));
    sel.addEventListener('change', () => { filter = sel.value; Todos.render(); });
    box.append(h('div', { class: 'prj-top' }, h('h3', null, 'Projekte'), addBtn), h('div', { class: 'prj-tools' }, sel));

    if (!active.length) box.append(h('div', { class: 'todo-empty' }, 'Noch keine Projekte. Leg mit „+ Projekt“ dein erstes an.'));
    for (const k of order) {
      if (filter !== '*' && k !== filter) continue;
      const sec = h('section', { class: 'prj-group' + (k === 'late' ? ' overdue' : '') });
      sec.append(h('div', { class: 'prj-gtitle' }, groupLabel(k), h('span', { class: 'cnt' }, groups.get(k).length)));
      for (const p of groups.get(k)) sec.append(card(p));
      box.append(sec);
    }
    const done = all.filter((p) => p.done);
    if (done.length) {
      const sec = h('section', { class: 'prj-group prj-done' + (showDone ? ' open' : '') });
      const toggle = h('button', { type: 'button', class: 'prj-gtitle prj-done-toggle', 'aria-expanded': String(showDone) }, `Abgeschlossen (${done.length})`, h('span', { class: 'chev' }, '▸'));
      toggle.addEventListener('click', () => { showDone = !showDone; Todos.render(); });
      sec.append(toggle);
      if (showDone) for (const p of done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))) sec.append(card(p));
      box.append(sec);
    }
  }

  const openCount = () => list().filter((p) => !p.done).length;
  return { render, openCount, add, update, remove, edit, create };
})();
