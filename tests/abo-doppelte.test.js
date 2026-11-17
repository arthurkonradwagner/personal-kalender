// Abos ergänzen nur: schon vorhandene Termine werden ausgeblendet. Start: node tests/abo-doppelte.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['util', 'subscriptions'].map((f) => fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8').replace("'use strict';", '')).join('\n');
const Store = { state: {
  calendars: [{ id: 'main', type: 'default' }, { id: 'boku', type: 'subscription' }, { id: 'proton', type: 'subscription' }],
  events: [
    { id: 'e1', calId: 'main', title: 'Zahnarzt', start: '2026-11-20T09:00' },
    { id: 'e2', calId: 'main', title: 'Import', start: '2026-11-21T10:00', uid: 'imp-1' },
    { id: 'sub-boku-1', calId: 'boku', title: 'VO Holzbau', start: '2026-11-18T08:00', uid: 'boku-1' },
  ],
} };
const Subs = new Function('Store', src + '\nreturn Subs;')(Store);

const proton = [
  { id: 'p1', title: '  zahnarzt ', start: '2026-11-20T09:00' },                       // gleicher Titel + Beginn wie eigener Termin
  { id: 'p2', title: 'VO Holzbau (Raum 3)', start: '2026-11-18T08:00', uid: 'boku-1' }, // gleiche UID wie BOKU
  { id: 'p3', title: 'Irgendwas', start: '2026-11-22T10:00', uid: 'e1@personal-kalender' }, // eigener Termin, über Proton zurückgekommen
  { id: 'p4', title: 'Import', start: '2026-11-25T10:00', uid: 'imp-1' },               // UID eines importierten Termins
  { id: 'p5', title: 'Meeting mit Lisa', start: '2026-11-19T14:00', uid: 'new-1' },    // wirklich neu
];
const kept = Subs.dropKnown(proton, Subs.knownKeys('proton')).map((e) => e.id);

const tests = {
  'nur der neue Proton-Termin bleibt': () => assert.deepEqual(kept, ['p5']),
  'BOKU (weiter oben) wird nicht gegen Proton (weiter unten) abgeglichen': () =>
    assert.deepEqual(Subs.dropKnown([{ id: 'b', title: 'Meeting mit Lisa', start: '2026-11-19T14:00' }], Subs.knownKeys('boku')).length, 1),
  'BOKU wird aber gegen eigene Termine abgeglichen': () =>
    assert.equal(Subs.dropKnown([{ id: 'b', title: 'Zahnarzt', start: '2026-11-20T09:00' }], Subs.knownKeys('boku')).length, 0),
};
let bad = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok    ', name); } catch (e) { bad++; console.log('FEHLER', name, '\n', e.message); }
}
console.log(bad ? bad + ' Fehler' : 'Alles grün');
process.exit(bad ? 1 : 0);
