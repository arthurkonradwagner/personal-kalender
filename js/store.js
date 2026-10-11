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
        progressCountsEvents: true, defaultDuration: 60, dayStartHour: 7, aiProvider: '', aiKey: '',
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
    if (kind !== 'remote') state._updatedAt = Date.now();
    save(); listeners.forEach((fn) => fn(kind));
  }

  // Einstellungen, die pro Gerät bleiben und nicht synchronisiert werden
  const LOCAL_SETTINGS = ['view', 'sidebarOpen', 'todoOpen', 'todoFilter', 'todoListFilter', 'dayStartHour'];
  function exportForSync() {
    const copy = JSON.parse(JSON.stringify(state));
    for (const k of LOCAL_SETTINGS) delete copy.settings[k];
    return copy;
  }
  function applyRemote(data, updatedAt) {
    const def = defaults();
    const local = {};
    for (const k of LOCAL_SETTINGS) local[k] = state.settings[k];
    state = { ...def, ...data, settings: { ...def.settings, ...(data.settings || {}), ...local } };
    state._updatedAt = updatedAt;
    emit('remote');
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
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); listeners.forEach((fn) => fn('all')); } });

  load();
  return {
    get state() { return state; }, subscribe, emit, save, snapshot, undo, exportForSync, applyRemote,
    calendar, addCalendar, updateCalendar, removeCalendar,
    event, addEvent, updateEvent, removeEvent,
    todo, addTodo, updateTodo, removeTodo, toggleTodo,
    todoList, addTodoList, updateTodoList, removeTodoList,
    setSetting, replaceAll, reset,
  };
})();
