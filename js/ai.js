/* KI-Schnelleingabe: versteht freien Text und macht daraus Aufgaben oder Termine.
   Der Schlüssel liegt nur in den Einstellungen (Browser + privates Firebase-Konto), nie im Code. */
'use strict';

const AI = (() => {
  const PROVIDERS = {
    claude: { name: 'Claude', models: ['claude-haiku-5-5', 'claude-haiku-4-5'] },
    gemini: { name: 'Google Gemini', models: ['gemini-flash-latest', 'gemini-2.5-flash'] },
  };
  const cfg = () => Store.state.settings;
  const enabled = () => !!(PROVIDERS[cfg().aiProvider] && cfg().aiKey);

  function prompt(text) {
    const S = Store.state;
    const now = new Date();
    const lists = S.todoLists.map((l) => l.name).join(', ') || '–';
    const cals = S.calendars.filter((c) => c.type !== 'subscription').map((c) => c.name + (c.type === 'birthday' ? ' (Geburtstage)' : '')).join(', ');
    return `Du bist der Eingabe-Assistent eines persönlichen Kalenders. Der Nutzer tippt freien Text (oft Umgangssprache, Tippfehler, mehrere Dinge auf einmal).
Heute ist ${U.WEEKDAYS[now.getDay()]}, ${U.dateKey(now)}, es ist ${U.timeKey(now)} Uhr. Wochen beginnen am Montag.
Vorhandene Aufgabenlisten: ${lists}
Vorhandene Kalender: ${cals}

Zerlege den Text in einzelne Einträge. Für jeden Eintrag:
- type: "event" für Termine mit festem Zeitpunkt, an denen man irgendwo ist oder sich mit jemandem trifft (Arzt, Treffen, Meeting, Training, Party, Feier, Geburtstag), oder wenn eine Dauer/Endzeit genannt ist. Sonst "todo" (etwas erledigen, besorgen, anrufen, schreiben, bezahlen …).
- title: kurzer, sauberer deutscher Titel ohne Datums- und Zeitangaben, erster Buchstabe groß.
- date: "YYYY-MM-DD" oder null, wenn kein Tag erkennbar ist. Löse relative Angaben selbst auf („morgen“, „nächsten Freitag“, „Ende des Monats“, „in zwei Wochen“, „am 3.“). Ein genannter Wochentag ohne Zusatz ist der nächste kommende (heute nur, wenn ausdrücklich „heute“).
- time: "HH:MM" oder null. „nachmittags“ ohne Uhrzeit = null. „halb drei“ = 14:30 wenn tagsüber gemeint.
- endTime: "HH:MM" oder null (aus Dauer oder Endzeit).
- allDay: true nur bei ganztägigen Terminen (Urlaub, Geburtstag) ohne Uhrzeit.
- priority: 0 normal, 1 hoch („wichtig“, „dringend“, „!!“), 2 mittel, 3 niedrig.
- list: Name einer vorhandenen Aufgabenliste, falls eindeutig passend, sonst null.
- calendar: Name eines vorhandenen Kalenders für Termine, Geburtstage in den Geburtstage-Kalender, sonst null.
- birthYear: Geburtsjahr, falls bei einem Geburtstag genannt, sonst null.
- notes: zusätzliche Details (Ort, Telefonnummer …) oder null.
Antworte nur mit JSON: {"items":[...]}

Text: ${text}`;
  }

  async function callGemini(key, model, p) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: p }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw apiError(r.status, j.error && j.error.message);
    return j.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
  }

  async function callClaude(key, model, p) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 1024, temperature: 0, messages: [{ role: 'user', content: p }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw apiError(r.status, j.error && j.error.message);
    return (j.content || []).map((x) => x.text || '').join('');
  }

  function apiError(status, msg) {
    const e = new Error(msg || 'HTTP ' + status);
    e.status = status;
    e.userMsg = status === 400 && /key/i.test(msg || '') || status === 401 || status === 403 ? 'Der KI-Schlüssel ist ungültig.'
      : status === 429 ? 'Zu viele KI-Anfragen oder Kontingent aufgebraucht.'
      : status === 404 ? null : 'KI-Fehler: ' + (msg || status);
    return e;
  }

  async function ask(text) {
    const st = cfg();
    const prov = PROVIDERS[st.aiProvider];
    const call = st.aiProvider === 'claude' ? callClaude : callGemini;
    const p = prompt(text);
    let last;
    for (const model of prov.models) {
      try {
        const out = await call(st.aiKey.trim(), model, p);
        const m = out.match(/\{[\s\S]*\}/);
        const data = JSON.parse(m ? m[0] : out);
        return Array.isArray(data.items) ? data.items : [];
      } catch (e) {
        last = e;
        if (e.status !== 404) break; // nur bei unbekanntem Modell das nächste probieren
      }
    }
    throw last;
  }

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(U.parseDate(s));
  const isTime = (s) => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);
  const normTime = (s) => { const [a, b] = s.split(':'); return `${U.pad(Math.min(23, +a))}:${U.pad(Math.min(59, +b))}`; };
  const byName = (arr, name) => name && arr.find((x) => x.name.toLowerCase() === String(name).toLowerCase());

  // Ergebnis der KI in Aufgaben/Termine umsetzen. Gibt die angelegten Titel zurück.
  function apply(items, fallbackListId) {
    const S = Store.state;
    const made = [];
    if (!items.length) return made;
    Store.snapshot();
    for (const it of items) {
      const title = String(it.title || '').trim().slice(0, 200);
      if (!title) continue;
      const date = isDate(it.date) ? it.date : null;
      const time = isTime(it.time) ? normTime(it.time) : null;
      const notes = it.notes ? String(it.notes).slice(0, 1000) : '';
      if (it.type === 'event' && date) {
        const cal = byName(S.calendars.filter((c) => c.type !== 'subscription'), it.calendar) || S.calendars.find((c) => c.id === S.defaultCalendar) || S.calendars[0];
        const ev = { title, notes, calId: cal.id };
        if (it.allDay || !time || cal.type === 'birthday') {
          Object.assign(ev, { allDay: true, start: date, end: date });
          if (cal.type === 'birthday') { ev.rrule = { freq: 'yearly', interval: 1 }; if (+it.birthYear > 1900) ev.birthYear = +it.birthYear; }
        } else {
          const s = new Date(`${date}T${time}`);
          let e = isTime(it.endTime) ? new Date(`${date}T${normTime(it.endTime)}`) : null;
          if (!e || e <= s) e = U.addMinutes(s, S.settings.defaultDuration || 60);
          Object.assign(ev, { allDay: false, start: U.dtKey(s), end: U.dtKey(e) });
        }
        Store.addEvent(ev);
        made.push({ kind: 'event', title, date, time });
      } else {
        const list = byName(S.todoLists, it.list);
        const pr = [0, 1, 2, 3].includes(+it.priority) ? +it.priority : 0;
        Store.addTodo({ title, notes, due: date, time: date ? time : null, priority: pr, listId: list ? list.id : fallbackListId });
        made.push({ kind: 'todo', title, date, time });
      }
    }
    return made;
  }

  function summary(made) {
    if (!made.length) return 'Die KI hat nichts erkannt.';
    if (made.length > 1) return `${made.length} Einträge angelegt`;
    const m = made[0];
    const when = m.date ? ' · ' + U.relDay(U.parseDate(m.date)) + (m.time ? ' ' + m.time : '') : '';
    return `${m.kind === 'event' ? 'Termin' : 'Aufgabe'} „${m.title}“${when}`;
  }

  async function test() {
    const items = await ask('morgen um 10 zahnarzt');
    return items.length > 0;
  }

  return { PROVIDERS, enabled, ask, apply, summary, test };
})();
