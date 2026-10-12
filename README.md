# Persönlicher Kalender

Doppelklick auf **index.html** öffnet den Kalender im Browser (Chrome, Edge oder Firefox). Es braucht kein Internet und keinen Server.

## Was er kann
- **Ansichten:** Tag, Woche, Monat, Jahr und Liste, dazu ein Mini-Kalender links
- **Termine:** anlegen per Klick oder durch Ziehen im Raster, per Drag & Drop verschieben, unten an der Kante länger ziehen
- **Wiederholungen:** täglich, wöchentlich, an Werktagen, monatlich (z. B. „jeden letzten Freitag“), jährlich oder benutzerdefiniert, mit Enddatum oder Anzahl. Beim Ändern fragt er: nur dieser, dieser und folgende, oder alle
- **Farben:** jeder Kalender hat eine Farbe, jeder einzelne Termin kann eine eigene bekommen (16 Farben oder frei wählbar)
- **Unterkalender:** „Main“ und „Geburtstage“ sind schon da, mit **+** legst du weitere an. Haken setzen oder entfernen blendet sie ein und aus. Im Geburtstagskalender wiederholen sich Einträge jährlich und zeigen das Alter an, wenn du das Geburtsjahr einträgst
- **Feiertage:** gesetzliche Feiertage in Deutschland, je nach Bundesland (Einstellungen)
- **Erinnerungen:** Hinweis mit Ton, solange der Kalender im Browser offen ist
- **Aufgaben rechts:** Tabs Heute, Geplant, Alle, Erledigt, eigene Listen mit Farben, Priorität, Unteraufgaben, Notizen. Schnelleingabe versteht z. B. `Zahnarzt anrufen morgen 14:00 !1 #Privat`
- **KI-Eingabe:** Mit einem eigenen Claude- oder Gemini-Schlüssel (⚙ Einstellungen → „KI für Aufgaben“) kannst du ganz frei eintippen, z. B. „Freitag nach der Arbeit Geschenk für Mama kaufen und Dienstag 14 Uhr Zahnarzt“. Die KI legt daraus Aufgaben und Termine am richtigen Tag an. Ohne Schlüssel oder ohne Internet greift die normale Erkennung.
- **Tagesfortschritt:** der Ring oben rechts zeigt, wie viel Prozent von heute erledigt sind (Aufgaben von heute und vergangene Termine von heute)
- **Suche, Hell/Dunkel, Rückgängig (Strg+Z)** und Tastenkürzel (Taste **?**)
- **Import/Export:** .ics-Dateien aus Google oder Proton importieren, alles als .ics exportieren, Sicherung als .json

## Handy und Sync
Online gestellt läuft der Kalender als App auf dem Handy: Seite im Browser öffnen, dann „Zum Startbildschirm hinzufügen“ (iPhone: Safari → Teilen; Android: Chrome → Menü ⋮ → App installieren). Nach dem Anmelden werden Termine und Aufgaben über Firebase zwischen allen Geräten abgeglichen. Offline geht alles weiter und wird nachgeholt, sobald wieder Internet da ist.

Am Handy: nach links oder rechts wischen blättert zur nächsten Woche (bzw. Tag oder Monat), die neue Woche gleitet dabei mit herein. Einen neuen Termin legst du an, indem du kurz länger auf die gewünschte Uhrzeit drückst (danach ziehen = Dauer). Kurz auf einen Termin tippen zeigt ihn an; ein Termin lässt sich nach langem Druck verschieben. Kurz auf einen Tag in der Monatsansicht tippen öffnet die Tagesansicht.

Die Zugangsdaten für Firebase stehen in `js/firebase-config.js`. Steht dort `null`, läuft der Kalender nur lokal im Browser. Die Sicherheitsregeln für die Datenbank liegen in `firestore.rules`.

## Wichtig zu den Daten (ohne Sync)
Alles wird im Speicher des Browsers abgelegt, mit dem du die Datei öffnest. Öffne den Kalender also immer mit demselben Browser, und lösche dort nicht die Website-Daten. Unter ⚙ Einstellungen → „Sicherung speichern“ kannst du jederzeit eine Sicherungsdatei anlegen.

## Dateien
- `index.html` Startseite
- `css/style.css` Gestaltung
- `js/` Programmlogik (Ansichten, Aufgaben, Wiederholungen, Feiertage, Import/Export)

## BOKU-Stundenplan und andere Kalender-Abos
Unter ⚙ Einstellungen → „Kalender-Abos“ fügst du einen iCal-Link ein (z. B. aus BOKUonline). Die Termine erscheinen als eigener, schreibgeschützter Kalender und werden alle 30 Minuten neu geladen. Weil viele Uni-Server keinen direkten Abruf aus dem Browser erlauben, holt der Kalender den Link notfalls über einen öffentlichen Vermittler (corsproxy.io bzw. allorigins.win).
