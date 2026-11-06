// Zeitumstellung 25.10.2026 unter österreichischer Zeit prüfen. Start: node tests/zeitumstellung.test.js
process.env.TZ = 'Europe/Vienna';
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['util', 'recurrence', 'ics'].map((f) => fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8').replace("'use strict';", '')).join('\n');
const { U, Recur, ICS } = new Function(src + '\nreturn { U, Recur, ICS };')();

const ics = (body) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:T\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const imported = (body) => ICS.importText(ics(body), 'cal')[0];
// Uhrzeit des Vorkommens an einem Tag, so wie sie im Kalender steht
const shownAt = (ev, day) => {
  const from = U.parseDate(day), o = Recur.expand(ev, from, U.addDays(from, 1))[0];
  return o && U.fmtTime(o.start);
};
const hand = (start, end, rrule) => ({ id: 'a', start, end, allDay: false, rrule: rrule || null, exdates: [] });

const tests = {
  'von Hand, einmalig: bleibt 11:00': () => assert.equal(shownAt(hand('2026-11-06T11:00', '2026-11-06T12:00'), '2026-11-06'), '11:00'),
  'von Hand, wöchentlich ab 22.10.: bleibt 11:00': () => assert.equal(shownAt(hand('2026-10-22T11:00', '2026-10-22T12:00', { freq: 'weekly', interval: 1 }), '2026-11-05'), '11:00'),
  'von Hand, täglich ab 22.10.: bleibt 11:00': () => assert.equal(shownAt(hand('2026-10-22T11:00', '2026-10-22T12:00', { freq: 'daily', interval: 1 }), '2026-11-06'), '11:00'),
  'Import, einmalig in UTC: 11:00': () => assert.equal(shownAt(imported('DTSTART:20261106T100000Z\r\nDTEND:20261106T110000Z'), '2026-11-06'), '11:00'),
  'Import, Serie in Wiener Zeit: bleibt 11:00': () => assert.equal(shownAt(imported('DTSTART;TZID=Europe/Vienna:20261022T110000\r\nDTEND;TZID=Europe/Vienna:20261022T120000\r\nRRULE:FREQ=WEEKLY'), '2026-11-05'), '11:00'),
  'Import, Serie in UTC: im Oktober 12:00, im November 11:00': () => {
    const ev = imported('DTSTART:20261022T100000Z\r\nDTEND:20261022T110000Z\r\nRRULE:FREQ=WEEKLY');
    assert.equal(shownAt(ev, '2026-10-22'), '12:00');
    assert.equal(shownAt(ev, '2026-11-05'), '11:00');
  },
  'Import, Termin aus anderer Zeitzone (Athen 12:00 = Wien 11:00)': () => assert.equal(shownAt(imported('DTSTART;TZID=Europe/Athens:20261106T120000\r\nDTEND;TZID=Europe/Athens:20261106T130000'), '2026-11-06'), '11:00'),
  'Import, unbekannter Zeitzonenname: Uhrzeit bleibt wie angegeben': () => assert.equal(shownAt(imported('DTSTART;TZID=W. Europe Standard Time:20261106T110000\r\nDTEND;TZID=W. Europe Standard Time:20261106T120000'), '2026-11-06'), '11:00'),
  'Serie über die Umstellung verschieben: Uhrzeit bleibt 11:00': () => assert.equal(U.fmtTime(U.shiftWall(U.parseDate('2026-10-15T11:00'), U.parseDate('2026-10-22T11:00'), U.parseDate('2026-10-25T11:00'))), '11:00'),
  'Klick am Umstellungstag auf 11:00 ergibt 11:00': () => assert.equal(U.fmtTime(U.atMinutes(U.parseDate('2026-10-25'), 660)), '11:00'),
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log('ok     ' + name); }
  catch (e) { failed++; console.log('FEHLER ' + name + ' -> ' + e.message.split('\n')[0]); }
}
console.log(failed ? `${failed} Fehler` : 'Alles grün');
process.exit(failed ? 1 : 0);
