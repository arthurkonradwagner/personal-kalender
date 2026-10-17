/* iCalendar (.ics) Import und Export – kompatibel mit Google, Proton, Outlook, Apple */
'use strict';

const ICS = (() => {
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const escTxt = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const unescTxt = (s) => String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  const fold = (line) => {
    const out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  };
  const dt = (d) => `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}T${U.pad(d.getHours())}${U.pad(d.getMinutes())}00`;
  const dOnly = (d) => `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}`;

  function exportEvents(events, calendars) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Persönlicher Kalender//DE', 'CALSCALE:GREGORIAN'];
    const stamp = dt(new Date());
    for (const ev of events) {
      const cal = calendars.find((c) => c.id === ev.calId);
      const { s, e } = Recur.bounds(ev);
      lines.push('BEGIN:VEVENT', `UID:${ev.id}@personal-kalender`, `DTSTAMP:${stamp}`);
      if (ev.allDay) lines.push(`DTSTART;VALUE=DATE:${dOnly(s)}`, `DTEND;VALUE=DATE:${dOnly(e)}`);
      else lines.push(`DTSTART:${dt(s)}`, `DTEND:${dt(e)}`);
      lines.push(fold(`SUMMARY:${escTxt(ev.title)}`));
      if (ev.location) lines.push(fold(`LOCATION:${escTxt(ev.location)}`));
      if (ev.notes) lines.push(fold(`DESCRIPTION:${escTxt(ev.notes)}`));
      if (cal) lines.push(fold(`CATEGORIES:${escTxt(cal.name)}`));
      if (ev.color || cal) lines.push(`X-PK-COLOR:${ev.color || cal.color}`);
      const r = ev.rrule;
      if (r && r.freq) {
        let rule = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
        if (r.freq === 'weekly' && r.byDay && r.byDay.length) rule += `;BYDAY=${r.byDay.map((d) => DAYS[d]).join(',')}`;
        if (r.freq === 'monthly' && r.monthlyMode === 'weekday') {
          const nth = Math.ceil(s.getDate() / 7);
          const isLast = U.addDays(s, 7).getMonth() !== s.getMonth();
          rule += `;BYDAY=${isLast && nth >= 4 ? -1 : nth}${DAYS[s.getDay()]}`;
        }
        if (r.until) rule += `;UNTIL=${U.parseDate(r.until).toISOString().slice(0, 10).replace(/-/g, '')}T235959Z`;
        else if (r.count) rule += `;COUNT=${r.count}`;
        lines.push(rule);
        for (const x of ev.exdates || []) {
          const xd = U.parseDate(x);
          lines.push(ev.allDay ? `EXDATE;VALUE=DATE:${dOnly(xd)}` : `EXDATE:${dt(new Date(xd.getFullYear(), xd.getMonth(), xd.getDate(), s.getHours(), s.getMinutes()))}`);
        }
      }
      if (ev.reminder != null) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${escTxt(ev.title)}`), `TRIGGER:-PT${ev.reminder}M`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function parseDt(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value);
    if (!m) return null;
    const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params || '');
    let d;
    if (m[7]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    else d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    return { d, allDay };
  }

  function importText(text, calId) {
    const raw = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let cur = null, inAlarm = false;
    for (const line of raw) {
      if (line === 'BEGIN:VEVENT') { cur = { props: {}, ex: [] }; continue; }
      if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
      if (!cur) continue;
      if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
      if (line === 'END:VALARM') { inAlarm = false; continue; }
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const left = line.slice(0, idx), value = line.slice(idx + 1);
      const [name, ...pp] = left.split(';');
      const params = pp.join(';');
      if (inAlarm) { if (name === 'TRIGGER') cur.trigger = value; continue; }
      if (name === 'EXDATE') { value.split(',').forEach((v) => { const p = parseDt(v, params); if (p) cur.ex.push(U.dateKey(p.d)); }); continue; }
      cur.props[name] = { value, params };
    }

    const result = [];
    for (const c of events) {
      const P = c.props;
      if (!P.DTSTART) continue;
      const st = parseDt(P.DTSTART.value, P.DTSTART.params);
      if (!st) continue;
      let en = P.DTEND ? parseDt(P.DTEND.value, P.DTEND.params) : null;
      const allDay = st.allDay;
      let endDate;
      if (en) endDate = allDay ? U.addDays(en.d, -1) : en.d;
      else if (P.DURATION) {
        const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(P.DURATION.value) || [];
        endDate = new Date(st.d.getTime() + ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000);
        if (allDay) endDate = U.addDays(endDate, -1);
      } else endDate = allDay ? st.d : U.addMinutes(st.d, 60);
      if (allDay && endDate < st.d) endDate = st.d;

      const ev = {
        id: U.uid(), calId, title: unescTxt(P.SUMMARY?.value || '(Ohne Titel)'), allDay,
        start: allDay ? U.dateKey(st.d) : U.dtKey(st.d), end: allDay ? U.dateKey(endDate) : U.dtKey(endDate),
        location: unescTxt(P.LOCATION?.value || ''), notes: unescTxt(P.DESCRIPTION?.value || ''), categories: unescTxt(P.CATEGORIES?.value || ''),
        color: /^#[0-9a-f]{6}$/i.test(P['X-PK-COLOR']?.value || '') ? P['X-PK-COLOR'].value : null,
        rrule: null, exdates: c.ex, reminder: null,
      };
      if (P.UID) ev.uid = P.UID.value;
      if (P['RECURRENCE-ID']) { const r = parseDt(P['RECURRENCE-ID'].value, P['RECURRENCE-ID'].params); if (r) ev.recurId = U.dateKey(r.d); }
      if (c.trigger) {
        const m = /-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(c.trigger);
        if (m) ev.reminder = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
      }
      if (P.RRULE) {
        const r = Object.fromEntries(P.RRULE.value.split(';').map((kv) => kv.split('=')));
        const freq = (r.FREQ || '').toLowerCase();
        if (['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
          ev.rrule = { freq, interval: +r.INTERVAL || 1, byDay: [], until: null, count: r.COUNT ? +r.COUNT : null };
          if (r.BYDAY) {
            if (freq === 'weekly') ev.rrule.byDay = r.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((x) => x >= 0);
            if (freq === 'monthly') ev.rrule.monthlyMode = 'weekday';
          }
          if (r.UNTIL) { const u = parseDt(r.UNTIL, ''); if (u) ev.rrule.until = U.dateKey(u.d); }
        }
      }
      result.push(ev);
    }
    return result;
  }

  return { exportEvents, importText };
})();
