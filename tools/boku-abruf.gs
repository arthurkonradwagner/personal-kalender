/* Eigener Abruf-Dienst für den Persönlichen Kalender (Google Apps Script).
   Holt den BOKU-iCal-Kalender auf Googles Servern ab und gibt ihn an die App weiter.
   So braucht die App keine Gratis-Vermittler (corsproxy.io usw.) mehr.
   Einrichtung: script.google.com → Neues Projekt → diesen Text einfügen → Bereitstellen →
   Neue Bereitstellung → Typ „Web-App“ → Ausführen als: Ich → Zugriff: Jeder → Link kopieren
   → in der App unter Einstellungen → Kalender-Abos → „Eigener Abruf-Dienst“ einfügen. */
function doGet(e) {
  var url = String((e && e.parameter && e.parameter.url) || '').replace(/^webcals?:\/\//i, 'https://');
  // nur BOKU-Adressen, damit niemand den Dienst für andere Seiten missbraucht
  if (!/^https:\/\/([a-z0-9-]+\.)*boku\.ac\.at\//i.test(url)) {
    return ContentService.createTextOutput('Nicht erlaubt: nur Links von boku.ac.at');
  }
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  return ContentService.createTextOutput(r.getContentText()).setMimeType(ContentService.MimeType.TEXT);
}
