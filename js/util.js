/* Hilfsfunktionen: Datum, DOM, Farben */
'use strict';

const U = (() => {
  const DAY_MS = 86400000;
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
  const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const pad = (n) => String(n).padStart(2, '0');

  // Datum <-> lokale Strings ("YYYY-MM-DD" und "YYYY-MM-DDTHH:mm")
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dtKey = (d) => `${dateKey(d)}T${timeKey(d)}`;
  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return new Date(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const addMinutes = (d, n) => new Date(d.getTime() + n * 60000);
  const addMonths = (d, n) => {
    const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
    const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), last));
    return r;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
  const startOfWeek = (d, weekStart = 1) => {
    const s = startOfDay(d);
    const diff = (s.getDay() - weekStart + 7) % 7;
    return addDays(s, -diff);
  };
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

  // ISO-Kalenderwoche
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / DAY_MS + 1) / 7);
  }

  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDateLong = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const fmtDateShort = (d) => `${WEEKDAYS_SHORT[d.getDay()]}., ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
  const fmtDateNum = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

  function relDay(d) {
    const diff = daysBetween(new Date(), d);
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Morgen';
    if (diff === 2) return 'Übermorgen';
    if (diff === -1) return 'Gestern';
    if (diff > 2 && diff < 7) return WEEKDAYS[d.getDay()];
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
  }

  // IDs
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // DOM
  function h(tag, attrs, ...children) {
    const el = tag === 'svg' ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Farben
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 100, g: 100, b: 100 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function textOn(hex) {
    const { r, g, b } = hexToRgb(hex);
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return L > 0.62 ? '#1f2328' : '#ffffff';
  }
  function alpha(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Farbpalette (angelehnt an Google/Proton)
  const PALETTE = [
    { name: 'Tomate', hex: '#d50000' }, { name: 'Flamingo', hex: '#e67c73' },
    { name: 'Mandarine', hex: '#f4511e' }, { name: 'Banane', hex: '#f6bf26' },
    { name: 'Salbei', hex: '#33b679' }, { name: 'Basilikum', hex: '#0b8043' },
    { name: 'Pfau', hex: '#039be5' }, { name: 'Heidelbeere', hex: '#3f51b5' },
    { name: 'Lavendel', hex: '#7986cb' }, { name: 'Traube', hex: '#8e24aa' },
    { name: 'Graphit', hex: '#616161' }, { name: 'Violett', hex: '#6d5efc' },
    { name: 'Rosa', hex: '#ec407a' }, { name: 'Türkis', hex: '#00acc1' },
    { name: 'Kakao', hex: '#795548' }, { name: 'Oliv', hex: '#827717' },
  ];

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return {
    DAY_MS, MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, PALETTE,
    pad, dateKey, timeKey, dtKey, parseDate, startOfDay, addDays, addMinutes, addMonths,
    sameDay, daysBetween, startOfWeek, startOfMonth, minutesOfDay, isoWeek,
    fmtTime, fmtDateLong, fmtDateShort, fmtDateNum, relDay, uid, h, $, $$, esc,
    hexToRgb, textOn, alpha, debounce, download,
  };
})();
