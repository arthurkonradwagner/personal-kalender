/* Gesetzliche Feiertage in Deutschland (bundesweit + je Bundesland) */
'use strict';

const Holidays = (() => {
  const STATES = {
    ALL: 'Nur bundesweite', BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
    HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
    RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
  };

  // Gaußsche Osterformel (Anonymer Gregorianischer Algorithmus)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  const cache = new Map();
  function forYear(y, st) {
    const key = y + st;
    if (cache.has(key)) return cache.get(key);
    const E = easter(y);
    const list = [
      [new Date(y, 0, 1), 'Neujahr'],
      [U.addDays(E, -2), 'Karfreitag'],
      [E, 'Ostersonntag', ['BB']],
      [U.addDays(E, 1), 'Ostermontag'],
      [new Date(y, 4, 1), 'Tag der Arbeit'],
      [U.addDays(E, 39), 'Christi Himmelfahrt'],
      [U.addDays(E, 49), 'Pfingstsonntag', ['BB']],
      [U.addDays(E, 50), 'Pfingstmontag'],
      [new Date(y, 9, 3), 'Tag der Deutschen Einheit'],
      [new Date(y, 11, 25), '1. Weihnachtstag'],
      [new Date(y, 11, 26), '2. Weihnachtstag'],
      [new Date(y, 0, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']],
      [new Date(y, 2, 8), 'Internationaler Frauentag', ['BE', 'MV']],
      [U.addDays(E, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
      [new Date(y, 7, 15), 'Mariä Himmelfahrt', ['SL']],
      [new Date(y, 8, 20), 'Weltkindertag', ['TH']],
      [new Date(y, 9, 31), 'Reformationstag', ['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH']],
      [new Date(y, 10, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']],
    ];
    // Buß- und Bettag: Mittwoch vor dem 23. November
    const nov23 = new Date(y, 10, 23);
    list.push([U.addDays(nov23, -(((nov23.getDay() - 3 + 7) % 7) || 7)), 'Buß- und Bettag', ['SN']]);

    const res = list.filter(([, , states]) => !states || (st !== 'ALL' && states.includes(st)))
      .map(([date, name]) => ({ date, name, key: U.dateKey(date) }));
    cache.set(key, res);
    return res;
  }

  function inRange(from, to, st) {
    const out = [];
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      for (const hday of forYear(y, st)) if (hday.date >= U.startOfDay(from) && hday.date < to) out.push(hday);
    }
    return out;
  }

  return { STATES, inRange, easter };
})();
