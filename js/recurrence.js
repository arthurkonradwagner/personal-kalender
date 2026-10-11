/* Wiederholungen: Termine in einzelne Vorkommen innerhalb eines Zeitraums auflösen */
'use strict';

const Recur = (() => {
  const ORDER_MON = [1, 2, 3, 4, 5, 6, 0];

  // Start/Ende eines Termins als Date (Ende bei ganztägigen exklusiv, also Folgetag 0:00)
  function bounds(ev) {
    const s = U.parseDate(ev.start);
    let e = U.parseDate(ev.end) || s;
    if (ev.allDay) e = U.addDays(U.startOfDay(e), 1);
    if (e <= s) e = ev.allDay ? U.addDays(s, 1) : U.addMinutes(s, 30);
    return { s, e };
  }

  function nthWeekdayOfMonth(year, month, weekday, n) {
    if (n === 5) { // „letzter“
      const last = new Date(year, month + 1, 0);
      const diff = (last.getDay() - weekday + 7) % 7;
      return new Date(year, month, last.getDate() - diff);
    }
    const first = new Date(year, month, 1);
    const diff = (weekday - first.getDay() + 7) % 7;
    const day = 1 + diff + (n - 1) * 7;
    const d = new Date(year, month, day);
    return d.getMonth() === month ? d : null;
  }

  function withTime(d, src) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), src.getHours(), src.getMinutes()); }

  // Liefert alle Vorkommen von ev, die [from, to) überlappen
  function expand(ev, from, to) {
    const { s, e } = bounds(ev);
    const dur = e - s;
    const out = [];
    const push = (start, idx) => {
      const end = new Date(start.getTime() + dur);
      if (end > from && start < to) out.push({ ev, start, end, idx });
    };
    const r = ev.rrule;
    if (!r || !r.freq) { push(s, 0); return out; }

    const interval = Math.max(1, r.interval | 0 || 1);
    const until = r.until ? U.addDays(U.parseDate(r.until), 1) : null; // inklusive
    const count = r.count ? r.count | 0 : null;
    const ex = new Set(ev.exdates || []);
    const hardEnd = until && until < to ? until : to;
    const lookFrom = new Date(from.getTime() - dur);
    let n = 0; // laufender Index (für „count“)
    let guard = 0;

    const emit = (start) => {
      if (start < s) return true;
      if (until && start >= until) return false;
      if (count != null && n >= count) return false;
      n++;
      if (!ex.has(U.dateKey(start))) push(start, n - 1);
      return true;
    };

    if (r.freq === 'daily') {
      let k = count ? 0 : Math.max(0, Math.floor(U.daysBetween(s, lookFrom) / interval) - 1);
      n = k;
      for (; guard++ < 5000; k++) {
        const st = withTime(U.addDays(s, k * interval), s);
        if (st >= hardEnd) break;
        if (!emit(st)) break;
      }
    } else if (r.freq === 'weekly') {
      const days = (r.byDay && r.byDay.length ? r.byDay : [s.getDay()]).slice().sort((a, b) => ORDER_MON.indexOf(a) - ORDER_MON.indexOf(b));
      const baseWeek = U.startOfWeek(s, 1);
      let w = count ? 0 : Math.max(0, Math.floor(U.daysBetween(baseWeek, lookFrom) / (7 * interval)) - 1);
      if (!count && w > 0) {
        // Zähler für bereits übersprungene Wochen nicht relevant ohne count
      }
      let stop = false;
      for (; guard++ < 3000 && !stop; w++) {
        const weekStart = U.addDays(baseWeek, w * 7 * interval);
        if (weekStart >= hardEnd) break;
        for (const wd of days) {
          const off = (wd - 1 + 7) % 7;
          const st = withTime(U.addDays(weekStart, off), s);
          if (st >= hardEnd) { stop = true; break; }
          if (!emit(st)) { stop = true; break; }
        }
      }
    } else if (r.freq === 'monthly') {
      const byWeekday = r.monthlyMode === 'weekday';
      const nth = Math.ceil(s.getDate() / 7);
      const isLast = U.addDays(s, 7).getMonth() !== s.getMonth();
      let k = count ? 0 : Math.max(0, Math.floor(((lookFrom.getFullYear() - s.getFullYear()) * 12 + lookFrom.getMonth() - s.getMonth()) / interval) - 1);
      for (; guard++ < 2000; k++) {
        const y = s.getFullYear(), m = s.getMonth() + k * interval;
        let st;
        if (byWeekday) {
          const d = nthWeekdayOfMonth(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(), s.getDay(), isLast && nth >= 4 ? 5 : nth);
          if (!d) continue;
          st = withTime(d, s);
        } else {
          st = new Date(y, m, s.getDate(), s.getHours(), s.getMinutes());
          if (st.getDate() !== s.getDate()) { if (new Date(y, m, 1) >= hardEnd) break; continue; }
        }
        if (st >= hardEnd) break;
        if (!emit(st)) break;
      }
    } else if (r.freq === 'yearly') {
      let k = count ? 0 : Math.max(0, Math.floor((lookFrom.getFullYear() - s.getFullYear()) / interval) - 1);
      for (; guard++ < 1000; k++) {
        const y = s.getFullYear() + k * interval;
        let st = new Date(y, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes());
        if (st.getMonth() !== s.getMonth()) st = new Date(y, s.getMonth() + 1, 0, s.getHours(), s.getMinutes()); // 29.2. -> 28.2.
        if (st >= hardEnd) break;
        if (!emit(st)) break;
      }
    }
    return out;
  }

  function describe(r, startStr) {
    if (!r || !r.freq) return 'Einmalig';
    const s = U.parseDate(startStr) || new Date();
    const i = Math.max(1, r.interval || 1);
    let txt;
    switch (r.freq) {
      case 'daily': txt = i === 1 ? 'Täglich' : `Alle ${i} Tage`; break;
      case 'weekly': {
        const days = (r.byDay && r.byDay.length ? r.byDay : [s.getDay()]).slice().sort((a, b) => ORDER_MON.indexOf(a) - ORDER_MON.indexOf(b));
        const names = days.map((d) => U.WEEKDAYS_SHORT[d]).join(', ');
        const isWork = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
        txt = (i === 1 ? 'Wöchentlich' : `Alle ${i} Wochen`) + (isWork ? ' an Werktagen' : ` am ${names}`);
        break;
      }
      case 'monthly':
        if (r.monthlyMode === 'weekday') {
          const nth = Math.ceil(s.getDate() / 7);
          const isLast = U.addDays(s, 7).getMonth() !== s.getMonth();
          const nthTxt = isLast && nth >= 4 ? 'letzten' : `${nth}.`;
          txt = (i === 1 ? 'Monatlich' : `Alle ${i} Monate`) + ` am ${nthTxt} ${U.WEEKDAYS[s.getDay()]}`;
        } else txt = (i === 1 ? 'Monatlich' : `Alle ${i} Monate`) + ` am ${s.getDate()}.`;
        break;
      case 'yearly': txt = (i === 1 ? 'Jährlich' : `Alle ${i} Jahre`) + ` am ${s.getDate()}. ${U.MONTHS[s.getMonth()]}`; break;
      default: txt = 'Wiederholt';
    }
    if (r.until) txt += `, bis ${U.fmtDateNum(U.parseDate(r.until))}`;
    else if (r.count) txt += `, ${r.count}×`;
    return txt;
  }

  return { expand, bounds, describe, nthWeekdayOfMonth };
})();
