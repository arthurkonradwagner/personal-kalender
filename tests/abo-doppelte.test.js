// Abos ergänzen nur: Termine, die es sichtbar schon gibt, werden beim Anzeigen ausgeblendet.
// Start: node tests/abo-doppelte.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['util', 'subscriptions'].map((f) => fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8').replace("'use strict';", '')).join('\n');

const base = () => ({
  calendars: [{ id: 'main', type: 'normal', visible: true }, { id: 'boku', type: 'subscription', visible: true }, { id: 'proton', type: 'subscription', visible: true }],
  events: [
    { id: 'e1', calId: 'main', title: 'Zahnarzt', start: '2026-11-20T09:00' },
    { id: 'e2', calId: 'main', title: 'Import', start: '2026-11-21T10:00', uid: 'imp-1' },
    { id: 'b1', calId: 'boku', title: 'VO Holzbau', start: '2026-11-18T08:00', uid: 'boku-1' },
    { id: 'p1', calId: 'proton', title: '  zahnarzt ', start: '2026-11-20T09:00' },                       // = eigener Termin
    { id: 'p2', calId: 'proton', title: 'VO Holzbau (Raum 3)', start: '2026-11-18T08:00', uid: 'boku-1' }, // gleiche UID wie BOKU
    { id: 'p3', calId: 'proton', title: 'Irgendwas', start: '2026-11-22T10:00', uid: 'e1@personal-kalender' }, // eigener Termin aus Export
    { id: 'p4', calId: 'proton', title: 'Import', start: '2026-11-25T10:00', uid: 'imp-1' },
    { id: 'p5', calId: 'proton', title: 'Meeting mit Lisa', start: '2026-11-19T14:00', uid: 'new-1' },    // wirklich neu
  ],
});
// hiddenIds merkt sich das Ergebnis bis zur nächsten Änderung; im Test jedes Mal frisch laden
const fresh = (state) => new Function('Store', src + '\nreturn Subs;')({ state, subscribe() {} }).hiddenIds();

const tests = {
  'nur Proton-Doppelte werden ausgeblendet, eigene und BOKU nie': () => assert.deepEqual([...fresh(base())].sort(), ['p1', 'p2', 'p3', 'p4']),
  'Daten bleiben vollständig (nur Anzeige)': () => { const s = base(); fresh(s); assert.equal(s.events.length, 8); },
  'BOKU ausgeschaltet: Proton zeigt die BOKU-Termine selbst': () => {
    const s = base(); s.calendars[1].visible = false;
    assert.ok(!fresh(s).has('p2'));
  },
  'zweites, ausgeblendetes BOKU-Abo weiter oben versteckt das sichtbare nicht': () => {
    const s = base();
    s.calendars.splice(1, 0, { id: 'boku-alt', type: 'subscription', visible: false });
    s.events.push({ id: 'x1', calId: 'boku-alt', title: 'VO Holzbau', start: '2026-11-18T08:00', uid: 'boku-1' });
    assert.ok(!fresh(s).has('b1'));
  },
  'eigene Termine werden nie ausgeblendet': () => {
    const s = base(); s.events.push({ id: 'e3', calId: 'main', title: 'VO Holzbau', start: '2026-11-18T08:00' });
    const h = fresh(s); assert.ok(!h.has('e3') && h.has('b1'));
  },
};
let bad = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok    ', name); } catch (e) { bad++; console.log('FEHLER', name, '\n', e.message); }
}
console.log(bad ? bad + ' Fehler' : 'Alles grün');
process.exit(bad ? 1 : 0);
