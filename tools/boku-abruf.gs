/* Eigener Abruf-Dienst für den Persönlichen Kalender (Google Apps Script).
   Holt externe iCal-Kalender (BOKU, BOKUlearn, Google, Proton, Outlook, iCloud) auf Googles Servern ab
   und gibt sie an die App weiter. So braucht die App keine Gratis-Vermittler (corsproxy.io usw.) mehr.
   Einrichtung: script.google.com → Neues Projekt → diesen Text einfügen → Bereitstellen →
   Neue Bereitstellung → Typ „Web-App“ → Ausführen als: Ich → Zugriff: Jeder → Link kopieren
   → in der App unter Einstellungen → Externe Kalender → „Eigener Abruf-Dienst“ einfügen.
   Nach einer Änderung an diesem Text: Bereitstellen → Bereitstellungen verwalten → Bearbeiten → „Neue Version“. */
var ERLAUBT = /^https:\/\/(([a-z0-9-]+\.)*boku\.ac\.at|calendar\.google\.com|calendar\.proton\.me|outlook\.(office365|live)\.com|([a-z0-9-]+\.)*icloud\.com)\//i;

function doGet(e) {
  var url = String((e && e.parameter && e.parameter.url) || '').replace(/^webcals?:\/\//i, 'https://');
  // nur bekannte Kalender-Adressen, damit niemand den Dienst für andere Seiten missbraucht
  if (!ERLAUBT.test(url)) {
    return ContentService.createTextOutput('Nicht erlaubt: nur Kalender-Links von BOKU, Google, Proton, Outlook oder iCloud');
  }
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  return ContentService.createTextOutput(r.getContentText()).setMimeType(ContentService.MimeType.TEXT);
}
