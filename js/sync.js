/* Synchronisation über Firebase (Login + Firestore). Ohne Konfiguration läuft alles nur lokal. */
'use strict';

const Sync = (() => {
  const { h } = U;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const cfg = window.FIREBASE_CONFIG;
  const enabled = !!(cfg && cfg.apiKey);
  let auth = null, db = null, user = null, docRef = null, unsub = null;
  let uploadTimer = null, firstSnap = true, status = 'off';

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Laden fehlgeschlagen: ' + src));
      document.head.append(s);
    });
  }

  function setStatus(st, text) {
    status = st;
    const el = U.$('#syncStatus');
    if (!el) return;
    el.hidden = false;
    el.dataset.state = st;
    el.title = text || {
      ok: 'Synchronisiert', saving: 'Wird gespeichert …', offline: 'Offline – wird später synchronisiert', error: 'Sync-Fehler', login: 'Nicht angemeldet',
    }[st] || '';
  }

  async function init() {
    if (!enabled) return;
    setStatus('saving', 'Verbinde …');
    try {
      await loadScript(SDK + 'firebase-app-compat.js');
      await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
    } catch (e) {
      setStatus('offline', 'Offline – Änderungen bleiben auf diesem Gerät, bis du wieder online bist');
      window.addEventListener('online', () => location.reload(), { once: true });
      return;
    }
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* z. B. privates Fenster */ }
    auth.onAuthStateChanged((u) => {
      if (u) { hideLogin(); start(u); } else { stop(); showLogin(); }
    });
    window.addEventListener('online', () => status === 'offline' && setStatus('ok'));
    window.addEventListener('offline', () => setStatus('offline'));
    Store.subscribe((kind) => { if (kind !== 'remote' && user) scheduleUpload(); });
  }

  function start(u) {
    user = u;
    firstSnap = true;
    docRef = db.collection('users').doc(u.uid);
    unsub = docRef.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.hasPendingWrites) { setStatus(navigator.onLine ? 'saving' : 'offline'); return; }
      setStatus(navigator.onLine ? 'ok' : 'offline');
      const localAt = Store.state._updatedAt || 0;
      if (!snap.exists) { if (firstSnap) upload(); firstSnap = false; return; }
      const d = snap.data();
      if ((d.updatedAt || 0) > localAt) {
        try { Store.applyRemote(JSON.parse(d.data), d.updatedAt); App.applyTheme(); } catch (e) { console.error(e); }
      } else if (firstSnap && localAt > (d.updatedAt || 0)) {
        upload();
      }
      firstSnap = false;
    }, (err) => { console.error(err); setStatus('error', 'Sync-Fehler: ' + err.message); });
  }

  function stop() {
    if (unsub) unsub();
    unsub = null; user = null; docRef = null;
    setStatus('login');
  }

  function scheduleUpload() {
    clearTimeout(uploadTimer);
    setStatus(navigator.onLine ? 'saving' : 'offline');
    uploadTimer = setTimeout(upload, 700);
  }
  function upload() {
    if (!docRef) return;
    const at = Store.state._updatedAt || Date.now();
    docRef.set({ data: JSON.stringify(Store.exportForSync()), updatedAt: at, device: navigator.userAgent.slice(0, 120) })
      .catch((e) => { console.error(e); setStatus('error', 'Speichern fehlgeschlagen: ' + e.message); });
  }

  // ---------- Anmeldung ----------
  function showLogin() {
    const box = U.$('#loginScreen');
    box.innerHTML = '';
    const email = h('input', { type: 'email', placeholder: 'E-Mail', autocomplete: 'username', required: true });
    const pw = h('input', { type: 'password', placeholder: 'Passwort', autocomplete: 'current-password', required: true });
    const msg = h('div', { class: 'login-msg' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Anmelden');
    const form = h('form', { class: 'login-card' },
      h('div', { class: 'brand-logo big' }, '✓'),
      h('h2', null, 'Personal Kalender'),
      h('p', { class: 'muted' }, 'Melde dich an, damit PC und Handy synchron bleiben.'),
      email, pw, btn, msg,
      h('button', { type: 'button', class: 'btn btn-ghost small', onclick: async () => {
        if (!email.value) { msg.textContent = 'Bitte zuerst die E-Mail eintragen.'; return; }
        try { await auth.sendPasswordResetEmail(email.value.trim()); msg.textContent = 'E-Mail zum Zurücksetzen wurde verschickt.'; }
        catch (e) { msg.textContent = fehler(e); }
      } }, 'Passwort vergessen?'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true; msg.textContent = '';
      try { await auth.signInWithEmailAndPassword(email.value.trim(), pw.value); }
      catch (err) { msg.textContent = fehler(err); }
      btn.disabled = false;
    });
    box.append(form);
    box.hidden = false;
    setTimeout(() => email.focus(), 50);
  }
  function hideLogin() { U.$('#loginScreen').hidden = true; }

  function fehler(e) {
    const c = e && e.code || '';
    if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login')) return 'E-Mail oder Passwort ist falsch.';
    if (c.includes('too-many-requests')) return 'Zu viele Versuche. Bitte kurz warten.';
    if (c.includes('network')) return 'Keine Internetverbindung.';
    if (c.includes('invalid-email')) return 'Die E-Mail-Adresse ist ungültig.';
    return 'Fehler: ' + (e.message || c);
  }

  function logout() { if (auth) auth.signOut(); }
  const info = () => ({ enabled, email: user ? user.email : null, status });

  return { init, logout, info };
})();
