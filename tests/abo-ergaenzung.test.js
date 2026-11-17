// Eigene Notiz/Prüfung zu Abo-Terminen: liegt getrennt, überlebt das Neuladen des Abos und den Sync.
// Start: node tests/abo-ergaenzung.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['util', 'recurrence', 'store', 'views'].map((f) => fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8').replace("'use strict';", '')).join('\n');

function boot() {
  const mem = {};
  const g = {
    localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    Subs: { hiddenIds: () => new Set() }, Holidays: { inRange: () => [] }, App: null, document: {},
  };
  const api = new Function(...Object.keys(g), src + '\nreturn { Store, Views, U };')(...Object.values(g));
  const S = api.Store.state;
  S.settings.holidays = false; S.settings.showTodosInCalendar = false;
  S.calendars.push({ id: 'boku', type: 'subscription', visible: true, color: '#039be5' });
  S.events.push(
    { id: 'sub-boku-a', calId: 'boku', uid: 'a', title: 'VO Holzbau', start: '2026-11-18T08:00', end: '2026-11-18T10:00', rrule: null, exdates: [] },
    { id: 'sub-boku-b', calId: 'boku', uid: 'b', title: 'Prüfung Statik', start: '2026-11-19T08:00', end: '2026-11-19T10:00', rrule: null, exdates: [] });
  return api;
}
const occ = ({ Views }, uid) => Views.occurrences(new Date(2026, 10, 16), new Date(2026, 10, 23)).find((o) => o.ev.uid === uid);

const tests = {
  'Stift: Notiz und Prüfung werden angezeigt': () => {
    const a = boot(); const o = occ(a, 'a');
    assert.equal(o.exam, false);
    a.Store.setOverlay(o.okey, { notes: 'Skript mitnehmen', exam: true });
    const n = occ(a, 'a'); assert.equal(n.exam, true); assert.equal(n.ov.notes, 'Skript mitnehmen');
  },
  'automatische Prüfung lässt sich entfernen': () => {
    const a = boot(); const o = occ(a, 'b');
    assert.equal(o.exam, true);
    a.Store.setOverlay(o.okey, { exam: false });
    assert.equal(occ(a, 'b').exam, false);
  },
  'Neuladen des Abos (alle Abo-Termine ersetzt) behält die Ergänzung': () => {
    const a = boot(); const S = a.Store.state;
    a.Store.setOverlay(occ(a, 'a').okey, { notes: 'x', exam: true });
    // wie Subs.refresh: Termine des Abos neu aufbauen
    S.events = S.events.filter((e) => e.calId !== 'boku').concat([{ id: 'sub-boku-a', calId: 'boku', uid: 'a', title: 'VO Holzbau', start: '2026-11-18T08:00', end: '2026-11-18T10:00', rrule: null, exdates: [] }]);
    a.Store.emit('events');
    assert.equal(S.events.length, 3);
    assert.equal(occ(a, 'a').exam, true); assert.equal(occ(a, 'a').ov.notes, 'x');
  },
  'Sync: Ergänzung kommt auf das andere Gerät, leeren löscht sie überall': () => {
    const a = boot(), b = boot();
    const key = occ(a, 'a').okey;
    a.Store.setOverlay(key, { notes: 'hallo' });
    b.Store.mergeRemote(a.Store.exportForSync());
    assert.equal(b.Store.overlay(key).notes, 'hallo');
    a.Store.setOverlay(key, {});
    assert.equal(a.Store.overlay(key), undefined);
    b.Store.mergeRemote(a.Store.exportForSync());
    assert.equal(b.Store.overlay(key), undefined);
    assert.equal(b.Store.state.events.filter((e) => e.calId === 'boku').length, 2);   // Abo-Daten unberührt
  },
};
let bad = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok    ', name); } catch (e) { bad++; console.log('FEHLER', name, '\n', e.stack); }
}
console.log(bad ? bad + ' Fehler' : 'Alles grün');
process.exit(bad ? 1 : 0);
