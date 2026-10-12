/* Projekte: große Vorhaben ohne festes Datum, optional einem Monat oder Jahr zugeordnet */
'use strict';

const Projects = (() => {
  const { h } = U;
  const COLORS = ['#d7d9de', '#7986cb', '#33b679', '#039be5', '#f6bf26', '#e67c73', '#8e24aa', '#f4511e'];
  let open = null;       // aufgeklapptes Projekt
  let pickHorizon = '';  // Zeitraum für neue Projekte

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

  function horizonOptions() {
    const d = now();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return [['', 'Ohne Zeitraum'], [ym(d), 'Diesen Monat'], [ym(next), 'Nächsten Monat'], [String(d.getFullYear()), 'Dieses Jahr'], [String(d.getFullYear() + 1), 'Nächstes Jahr']];
  }
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

  const progress = (p) => p.steps.length ? Math.round((p.steps.filter((s) => s.done).length / p.steps.length) * 100) : (p.done ? 100 : 0);

  function card(p) {
    const pct = progress(p);
    const el = h('div', { class: 'prj-card' + (p.done ? ' done' : '') + (open === p.id ? ' open' : '') + (isPast(p.horizon) && !p.done ? ' late' : ''), style: { '--c': p.color } });
    const head = h('div', { class: 'prj-head' },
      h('div', { class: 'prj-title' }, p.title),
      h('div', { class: 'prj-meta' },
        h('span', { class: 'prj-hz' }, '🗓 ' + horizonShort(p.horizon)),
        p.steps.length ? h('span', null, `${p.steps.filter((s) => s.done).length}/${p.steps.length} Schritte`) : h('span', { class: 'muted' }, 'Noch keine Schritte')),
      h('div', { class: 'prj-bar' }, h('i', { style: { width: pct + '%' } })));
    head.addEventListener('click', () => { open = open === p.id ? null : p.id; Todos.render(); });
    el.append(head);
    if (open === p.id) el.append(detail(p));
    return el;
  }

  function detail(p) {
    const d = h('div', { class: 'prj-detail' });
    const title = h('input', { class: 'td-title', value: p.title });
    title.addEventListener('change', () => update(p.id, { title: title.value.trim() || p.title }));
    const steps = h('div', { class: 'prj-steps' });
    for (const s of p.steps) {
      const cb = h('input', { type: 'checkbox', checked: s.done });
      cb.addEventListener('change', () => { s.done = cb.checked; save(); });
      const x = h('button', { class: 'icon-btn small', title: 'Entfernen' }, '✕');
      x.addEventListener('click', () => { p.steps = p.steps.filter((y) => y !== s); save(); });
      steps.append(h('label', { class: 'prj-step' + (s.done ? ' done' : '') }, cb, h('span', null, s.title), x));
    }
    const stepIn = h('input', { placeholder: '+ Schritt hinzufügen' });
    stepIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && stepIn.value.trim()) { p.steps.push({ id: U.uid(), title: stepIn.value.trim(), done: false }); save(); setTimeout(() => U.$('.prj-card.open .prj-steps + input')?.focus(), 30); }
    });
    const notes = h('textarea', { class: 'td-notes', rows: 2, placeholder: 'Notizen, Ideen, Links …' }, p.notes || '');
    notes.addEventListener('change', () => update(p.id, { notes: notes.value }));
    const colors = h('div', { class: 'prj-colors' }, ...COLORS.map((c) => {
      const b = h('button', { class: 'swatch small' + (c === p.color ? ' sel' : ''), style: { background: c } });
      b.addEventListener('click', () => update(p.id, { color: c }));
      return b;
    }));
    d.append(title,
      h('div', { class: 'td-label' }, 'Schritte'), steps, stepIn,
      h('div', { class: 'prj-row' }, h('span', null, 'Zeitraum'), horizonSelect(p.horizon, (v) => update(p.id, { horizon: v }))),
      notes, colors,
      h('div', { class: 'prj-actions' },
        h('button', { class: 'btn ' + (p.done ? 'btn-outline' : 'btn-primary') + ' small', onclick: () => update(p.id, { done: !p.done, doneAt: p.done ? null : Date.now() }) }, p.done ? 'Wieder öffnen' : '✓ Projekt abschließen'),
        h('button', { class: 'btn btn-danger-ghost small', onclick: () => { open = null; remove(p.id); } }, 'Löschen')));
    return d;
  }

  function render(box) {
    const all = list();
    // Eingabe
    const input = h('input', { placeholder: 'Neues Projekt, z. B. „Bachelorarbeit schreiben“', maxlength: 200 });
    const chips = h('div', { class: 'prj-chips' }, ...horizonOptions().map(([v, l]) => {
      const b = h('button', { type: 'button', class: 'pill' + (pickHorizon === v ? ' active' : '') }, l);
      b.addEventListener('click', () => { pickHorizon = v; Todos.render(); setTimeout(() => U.$('.prj-add input')?.focus(), 20); });
      return b;
    }));
    const form = h('form', { class: 'prj-add' }, h('span', { class: 'todo-add-plus' }, '◆'), input);
    form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; const p = add(t, pickHorizon || null); open = p.id; });
    box.append(h('div', { class: 'prj-intro' }, h('h3', null, 'Große Projekte'), h('p', null, 'Vorhaben ohne festen Tag. Ordne sie einem Monat oder Jahr zu und hake Schritt für Schritt ab.')), form, chips);

    // Gruppen nach Zeitraum
    const active = all.filter((p) => !p.done);
    const groups = new Map();
    for (const p of active.sort((a, b) => sortKey(a.horizon).localeCompare(sortKey(b.horizon)))) {
      const key = isPast(p.horizon) ? 'late' : (p.horizon || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    if (!active.length) box.append(h('div', { class: 'todo-empty' }, 'Noch keine Projekte. Leg oben dein erstes an.'));
    const order = [...groups.keys()].sort((a, b) => (a === 'late' ? -1 : b === 'late' ? 1 : sortKey(a).localeCompare(sortKey(b))));
    for (const k of order) {
      const sec = h('section', { class: 'todo-group' + (k === 'late' ? ' overdue' : '') });
      sec.append(h('div', { class: 'tg-title' }, k === 'late' ? 'Zeitraum überschritten' : horizonLabel(k), h('span', { class: 'cnt' }, groups.get(k).length)));
      for (const p of groups.get(k)) sec.append(card(p));
      box.append(sec);
    }
    const done = all.filter((p) => p.done);
    if (done.length) {
      const sec = h('section', { class: 'todo-group done-group' });
      sec.append(h('div', { class: 'tg-title' }, `Abgeschlossen (${done.length})`));
      for (const p of done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))) sec.append(card(p));
      box.append(sec);
    }
  }

  const openCount = () => list().filter((p) => !p.done).length;
  return { render, openCount, add, update, remove };
})();
