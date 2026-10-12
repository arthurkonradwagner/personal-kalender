/* Datenhaltung: alles liegt im localStorage des Browsers */
'use strict';

const Store = (() => {
  const KEY = 'personal-kalender-v1';
  const listeners = new Set();
  let state;

  function defaults() {
    const today = new Date();
    const d = (off, h, m) => U.dtKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + off, h, m));
    const mainId = 'cal-main', bdayId = 'cal-birthdays';
    const listInbox = 'list-inbox', listPrivate = 'list-private', listWork = 'list-work';
    return {
      version: 2,
      calendars: [
        { id: mainId, name: 'Main', color: '#6d5efc', visible: true, type: 'normal' },
        { id: bdayId, name: 'Geburtstage', color: '#33b679', visible: true, type: 'birthday' },
      ],
      defaultCalendar: mainId,
      events: [
        { id: U.uid(), calId: mainId, title: 'Willkommen in deinem Kalender 👋', allDay: false,
          start: d(0, 9, 0), end: d(0, 10, 0), color: null, location: '',
          notes: 'Klick auf einen freien Bereich oder ziehe mit der Maus, um einen Termin anzulegen. Termine kannst du per Drag & Drop verschieben und unten an der Kante länger ziehen.',
          rrule: null, exdates: [], reminder: null },
        { id: U.uid(), calId: mainId, title: 'Sport', allDay: false,
          start: d(1, 18, 0), end: d(1, 19, 30), color: '#f4511e', location: 'Fitnessstudio', notes: '',
          rrule: { freq: 'weekly', interval: 1, byDay: [new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getDay()], until: null, count: null },
          exdates: [], reminder: 30 },
      ],
      todoLists: [
        { id: listInbox, name: 'Eingang', color: '#6d5efc' },
        { id: listPrivate, name: 'Privat', color: '#33b679' },
        { id: listWork, name: 'Arbeit', color: '#039be5' },
      ],
      todos: [
        { id: U.uid(), listId: listInbox, title: 'Kalender ausprobieren', notes: '', due: U.dateKey(today), time: null, priority: 1, done: false, doneAt: null, createdAt: Date.now(), order: 0, subtasks: [] },
        { id: U.uid(), listId: listPrivate, title: 'Geburtstage eintragen', notes: 'Im Kalender „Geburtstage“ – wiederholt sich automatisch jährlich.', due: U.dateKey(today), time: null, priority: 2, done: false, doneAt: null, createdAt: Date.now(), order: 1,
          subtasks: [{ id: U.uid(), title: 'Familie', done: false }, { id: U.uid(), title: 'Freunde', done: false }] },
      ],
      settings: {
        view: 'week', theme: 'dark', weekStart: 1, showWeekNumbers: true,
        holidays: true, holidayState: 'ALL', showTodosInCalendar: true,
        progressCountsEvents: true, defaultDuration: 60, dayStartHour: 7, aiProvider: '', aiKey: '', phoneTodoMode: 'compact',
        todoFilter: 'today', todoListFilter: null, sidebarOpen: true, todoOpen: true,
      },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = defaults();
        state = { ...def, ...parsed, settings: { ...def.settings, ...(parsed.settings || {}) } };
        if ((parsed.version || 1) < 2) { state.version = 2; state.settings.theme = 'dark'; state.settings.view = 'week'; }
        return;
      }
    } catch (e) { console.warn('Laden fehlgeschlagen', e); }
    state = defaults();
    state._fresh = true; // Beispieldaten eines neuen Geräts: beim ersten Sync nicht ins Konto übernehmen
    save();
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.error(e); App && App.toast('Speichern fehlgeschlagen – Speicher voll?', { type: 'error' }); }
    }, 80);
  }
  function flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function emit(kind) {
    if (kind !== 'remote') stamp();
    save(); listeners.forEach((fn) => fn(kind));
  }

  // ---------- Sync-Grundlage: jeder Eintrag merkt sich, wann er zuletzt geändert wurde ----------
  // _u = Änderungszeit eines Eintrags, _del = gelöschte Einträge mit Zeitpunkt, _setAt = Änderungszeit der Einstellungen.
  // Beim Abgleich gewinnt pro Eintrag die neuere Version. So kann ein alter Stand nichts Neueres mehr löschen.
  const COLS = ['calendars', 'events', 'todoLists', 'todos'];
  // Einstellungen, die pro Gerät bleiben und nicht synchronisiert werden
  const LOCAL_SETTINGS = ['view', 'sidebarOpen', 'todoOpen', 'todoFilter', 'todoListFilter', 'dayStartHour'];
  const TOMB_DAYS = 120;
  let known = null;
  const itemJson = (it) => { const { _u, ...rest } = it; return JSON.stringify(rest); };
  const syncedSettings = (st) => { const o = { ...st }; for (const k of LOCAL_SETTINGS) delete o[k]; return o; };
  const settingsJson = () => JSON.stringify([syncedSettings(state.settings), state.defaultCalendar]);
  function index() {
    known = { settings: settingsJson() };
    for (const c of COLS) known[c] = new Map(state[c].map((it) => [it.id, itemJson(it)]));
  }
  function stamp() {
    const now = Date.now();
    if (!known) index();
    state._del = state._del || {};
    for (const c of COLS) {
      const seen = new Set();
      for (const it of state[c]) {
        seen.add(it.id);
        if (known[c].get(it.id) !== itemJson(it)) it._u = now;
      }
      for (const id of known[c].keys()) if (!seen.has(id)) state._del[c + ':' + id] = now;
    }
    if (known.settings !== settingsJson()) state._setAt = now;
    index();
  }

  function exportForSync() {
    const s = state;
    return JSON.parse(JSON.stringify({
      version: s.version, calendars: s.calendars, defaultCalendar: s.defaultCalendar, events: s.events,
      todoLists: s.todoLists, todos: s.todos, settings: syncedSettings(s.settings), _del: s._del || {}, _setAt: s._setAt || 0,
    }));
  }
  // Zwei Stände zusammenführen (a = lokal, b = Server). Nichts geht verloren, pro Eintrag gewinnt der neuere.
  function merge(a, b) {
    const minT = Date.now() - TOMB_DAYS * 86400000;
    const del = {};
    for (const src of [a._del || {}, b._del || {}]) for (const [k, t] of Object.entries(src)) if (t > minT && !(del[k] >= t)) del[k] = t;
    const out = { version: Math.max(a.version || 2, b.version || 2) };
    for (const c of COLS) {
      const map = new Map();
      for (const it of [...(a[c] || []), ...(b[c] || [])]) {
        const cur = map.get(it.id);
        if (!cur || (it._u || 0) > (cur._u || 0)) map.set(it.id, it);
      }
      out[c] = [...map.values()].filter((it) => {
        const t = del[c + ':' + it.id];
        if (t == null) return true;
        if ((it._u || 0) > t) { delete del[c + ':' + it.id]; return true; } // wiederhergestellt
        return false;
      });
    }
    const newer = (b._setAt || 0) > (a._setAt || 0) ? b : a;
    out.settings = syncedSettings(newer.settings || {});
    out.defaultCalendar = newer.defaultCalendar;
    out._setAt = Math.max(a._setAt || 0, b._setAt || 0);
    out._del = del;
    if (!out.calendars.some((c) => c.id === out.defaultCalendar)) out.defaultCalendar = out.calendars[0]?.id;
    return out;
  }
  // stabile Textform zum Vergleichen
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
  function normalize(data) {
    return merge({ calendars: [], events: [], todoLists: [], todos: [], settings: {}, _setAt: -1 }, data);
  }
  // Server-Stand einarbeiten. Gibt zurück, ob der Server etwas Älteres hat (dann hochladen).
  function mergeRemote(remote) {
    const r = normalize(remote);
    if (state._fresh) {
      // neues Gerät: Beispieldaten verwerfen, Konto-Stand übernehmen
      delete state._fresh;
      for (const c of COLS) state[c] = [];
      state._del = {}; state._setAt = -1;
      index();
    }
    const local = exportForSync();
    const merged = merge(local, r);
    if (canon(merged) !== canon(local)) {
      const def = defaults();
      const keep = {};
      for (const k of LOCAL_SETTINGS) keep[k] = state.settings[k];
      state = { ...state, ...merged, settings: { ...def.settings, ...merged.settings, ...keep } };
      index();
      emit('remote');
    }
    return canon(merged) !== canon(r);
  }
  const subscribe = (fn) => listeners.add(fn);

  // Rückgängig: einfacher Snapshot-Stack
  const undoStack = [];
  function snapshot() {
    undoStack.push(JSON.stringify({ events: state.events, todos: state.todos, calendars: state.calendars, todoLists: state.todoLists }));
    if (undoStack.length > 30) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return false;
    Object.assign(state, JSON.parse(s));
    emit('all');
    return true;
  }

  // --- Kalender ---
  const calendar = (id) => state.calendars.find((c) => c.id === id);
  function addCalendar(data) {
    const c = { id: 'cal-' + U.uid(), name: 'Neuer Kalender', color: '#039be5', visible: true, type: 'normal', ...data };
    state.calendars.push(c); emit('calendars'); return c;
  }
  function updateCalendar(id, patch) { Object.assign(calendar(id), patch); emit('calendars'); }
  function removeCalendar(id) {
    snapshot();
    state.calendars = state.calendars.filter((c) => c.id !== id);
    state.events = state.events.filter((e) => e.calId !== id);
    if (state.defaultCalendar === id) state.defaultCalendar = state.calendars[0]?.id;
    emit('calendars');
  }

  // --- Termine ---
  const event = (id) => state.events.find((e) => e.id === id);
  function addEvent(data) {
    const e = { id: U.uid(), calId: state.defaultCalendar, title: '', allDay: false, color: null, location: '', notes: '', rrule: null, exdates: [], reminder: null, ...data };
    state.events.push(e); emit('events'); return e;
  }
  function updateEvent(id, patch, silent) { Object.assign(event(id), patch); if (!silent) emit('events'); }
  function removeEvent(id) { snapshot(); state.events = state.events.filter((e) => e.id !== id); emit('events'); }

  // --- Aufgaben ---
  const todo = (id) => state.todos.find((t) => t.id === id);
  function addTodo(data) {
    const minOrder = state.todos.reduce((m, t) => Math.min(m, t.order ?? 0), 0);
    const t = { id: U.uid(), listId: state.todoLists[0]?.id, title: '', notes: '', due: null, time: null, priority: 0, done: false, doneAt: null, createdAt: Date.now(), order: minOrder - 1, subtasks: [], ...data };
    state.todos.push(t); emit('todos'); return t;
  }
  function updateTodo(id, patch) { Object.assign(todo(id), patch); emit('todos'); }
  function removeTodo(id) { snapshot(); state.todos = state.todos.filter((t) => t.id !== id); emit('todos'); }
  function toggleTodo(id) {
    const t = todo(id);
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    emit('todos');
    return t.done;
  }
  const todoList = (id) => state.todoLists.find((l) => l.id === id);
  function addTodoList(data) { const l = { id: 'list-' + U.uid(), name: 'Neue Liste', color: '#f6bf26', ...data }; state.todoLists.push(l); emit('todos'); return l; }
  function updateTodoList(id, patch) { Object.assign(todoList(id), patch); emit('todos'); }
  function removeTodoList(id) {
    snapshot();
    state.todoLists = state.todoLists.filter((l) => l.id !== id);
    state.todos = state.todos.filter((t) => t.listId !== id);
    if (state.settings.todoListFilter === id) state.settings.todoListFilter = null;
    emit('todos');
  }

  function setSetting(k, v) { state.settings[k] = v; emit('settings'); }

  function replaceAll(data) {
    snapshot();
    const def = defaults();
    state = { ...def, ...data, settings: { ...def.settings, ...(data.settings || {}) } };
    emit('all');
  }
  function reset() { snapshot(); state = defaults(); emit('all'); }

  window.addEventListener('beforeunload', flush);
  // Mehrere Tabs synchron halten
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); index(); listeners.forEach((fn) => fn('all')); } });

  load();
  index();
  return {
    get state() { return state; }, subscribe, emit, save, snapshot, undo, exportForSync, merge, mergeRemote,
    calendar, addCalendar, updateCalendar, removeCalendar,
    event, addEvent, updateEvent, removeEvent,
    todo, addTodo, updateTodo, removeTodo, toggleTodo,
    todoList, addTodoList, updateTodoList, removeTodoList,
    setSetting, replaceAll, reset,
  };
})();
