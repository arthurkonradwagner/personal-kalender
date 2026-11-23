// Mehrfachauswahl im Aufgabenfenster: Strg schaltet einzeln um, Shift nimmt den Bereich.
// Start: node tests/mehrfachauswahl.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const U = new Function(fs.readFileSync(path.join(__dirname, '../js/util.js'), 'utf8').replace("'use strict';", '') + '\nreturn U;')();
const ids = ['a', 'b', 'c', 'd'];
// Klickfolge abspielen: 'b' = Klick, '^b' = Strg, '+b' = Shift, '^+b' = beides
const run = (...clicks) => {
  let s = { sel: new Set(), anchor: null };
  for (const c of clicks) s = U.pickMulti(ids, s.sel, s.anchor, c.slice(-1), c.includes('^'), c.includes('+'));
  return [...s.sel].sort().join('');
};
const tests = {
  'Strg sammelt einzeln': () => assert.equal(run('^a', '^c'), 'ac'),
  'Strg nochmal nimmt wieder heraus': () => assert.equal(run('^a', '^c', '^a'), 'c'),
  'Klick, dann Shift: Bereich': () => assert.equal(run('b', '+d'), 'bcd'),
  'Shift rückwärts, weiter ab demselben Anker': () => assert.equal(run('c', '+d', '+a'), 'abc'),
  'Strg+Shift ergänzt den Bereich': () => assert.equal(run('^a', '^c', '^+d'), 'acd'),
  'Shift ohne Anker wählt nur die eine': () => assert.equal(run('+c'), 'c'),
  'einfacher Klick hebt auf': () => assert.equal(run('^a', '^b', 'c'), ''),
};
let bad = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok    ', name); } catch (e) { bad++; console.log('FEHLER', name, '\n', e.message); }
}
console.log(bad ? bad + ' Fehler' : 'Alles grün');
process.exit(bad ? 1 : 0);
