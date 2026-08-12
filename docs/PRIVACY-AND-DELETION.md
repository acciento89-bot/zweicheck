# Datenschutz- und Löschkonzept – Produktionsstand 1.0

Stand: 12.08.2026

## Datensparsamkeit

ZweiCheck speichert nur Daten, die für Konten, private Vertrauensverbindungen, konkrete Prüfanfragen, Benachrichtigungen und die Absicherung des Dienstes erforderlich sind. TANs, Passwörter und vollständige Karteninformationen sind ausdrücklich nicht als Inhalt vorgesehen und werden in der Oberfläche untersagt.

Es gibt keine Werbung, kein Werbetracking, keine öffentliche Nutzersuche und keine öffentlich einsehbaren Profile.

## Zugriff

- Prüfanfragen sind nur für die anfragende Person und die aktuell zuständige aktive Vertrauensperson sichtbar.
- Anhänge besitzen keine öffentliche Datei-URL; jeder Abruf wird serverseitig autorisiert.
- Nach Aufhebung einer Vertrauensverbindung endet der Zugriff der ehemaligen Vertrauensperson sofort, soweit kein eigener anderer Beteiligungsgrund besteht.
- Aktivitäten enthalten bewusst nur generische, datensparsame Texte und keine vollständigen Prüfbeschreibungen oder Antwortnotizen.
- Push- und E-Mail-Benachrichtigungen enthalten keine vollständigen Beschreibungen, Bilder oder Antwortnotizen.

## Technische Schutzmaßnahmen

- Passwörter werden mit bcrypt gehasht und nicht im Klartext gespeichert.
- Sitzungstokens werden als SHA-256-Hash gespeichert.
- Authentifizierungscookies sind HttpOnly, Secure in Produktion und SameSite=Lax.
- Schreibende API-Anfragen werden gegen fremde Origins geschützt.
- Uploads sind auf definierte Bildtypen, Größen und Dateianzahl begrenzt und werden zusätzlich anhand ihrer Dateisignatur geprüft.
- API- und Auth-Endpunkte verfügen über Sicherheitsheader und Rate Limits.

## Aufbewahrung

- abgelaufene Sessions werden automatisiert entfernt,
- Einladungen laufen nach ihrer Gültigkeit ab,
- verwendete E-Mail-Tokens werden nicht erneut verwendet,
- Prüfungen bleiben für die beteiligten Konten verfügbar, bis sie durch Kontolöschung oder eine spätere definierte Löschroutine entfernt werden,
- Server-Logs sollen keine Prüfbeschreibungen, Anhänge, Passwörter oder Session-Tokens enthalten,
- Sicherungskopien dürfen gelöschte Daten nur bis zum Ablauf der regulären Backup-Rotation enthalten.

## Datenexport

Im Bereich **Konto → Meine Daten herunterladen** kann ein angemeldeter Nutzer eine JSON-Datei mit den gespeicherten Kontodaten, Prüfungen, Vertrauensverbindungen und Aktivitäten abrufen.

Nicht exportiert werden insbesondere:

- Passwort-Hashes,
- Sitzungstokens und deren Hashes,
- E-Mail-Token,
- Push-Geheimnisse oder andere Authentifizierungsgeheimnisse.

Der Export wird mit `Cache-Control: no-store` ausgeliefert.

## Self-Service-Kontolöschung

Die Kontolöschung ist produktiv implementiert und direkt im Konto-Bereich erreichbar.

Ablauf:

1. Nutzer öffnet **Konto → Konto löschen**.
2. Das aktuelle Passwort muss erneut eingegeben werden.
3. Eine ausdrückliche Bestätigung über die dauerhafte Löschung ist erforderlich.
4. Die API prüft das Passwort erneut.
5. Beteiligte Prüfungen und deren Anhänge werden aus der Datenbank entfernt.
6. Zugehörige Upload-Dateien werden physisch aus dem Upload-Speicher gelöscht.
7. Vertrauensverbindungen, Sessions, Push-Abos und relevante Einladungsbezüge werden entfernt bzw. bereinigt.
8. Verbleibende Aktivitätsspuren bei anderen Personen werden anonymisiert, sodass der gelöschte Name nicht als personenbezogene Aktivitätsinformation bestehen bleibt.
9. Das Auth-Cookie wird gelöscht.

Der Löschvorgang wird in der CI mit einem realen PostgreSQL-Testkonto, Verbindung, Prüfung, Datei, Push-Abo und Einladung geprüft.

## Öffentliche Datenschutzinformationen

Für App Store und Web werden nach Deployment folgende öffentliche Seiten bereitgestellt:

- `/privacy` – ZweiCheck-Datenschutzinformation
- `/privacy-choices` – Datenexport, Push und Kontolöschung erklärt
- `/support` – Kontakt und Support

Die allgemeine Kamilunavo-Datenschutzinformation bleibt zusätzlich unter `https://kamilunavo.com/privacy` erreichbar.

## Drittanbieter / Auftragsverarbeitung

Derzeit werden insbesondere technische Hosting- und E-Mail-Dienstleister eingesetzt. Die öffentliche ZweiCheck-Datenschutzseite nennt den aktuellen Server- und Mailbetrieb. Änderungen an Dienstleistern müssen vor Release oder Update auch in den öffentlichen Datenschutzinformationen und den App-Store-Privacy-Angaben nachgezogen werden.

## Release-Regel

Neue Funktionen, SDKs oder native iOS-Komponenten dürfen vor Veröffentlichung nicht stillschweigend zusätzliche Datentypen sammeln. Jede Änderung wird gegen folgende Punkte geprüft:

1. Ist die Datenerhebung für die Kernfunktion erforderlich?
2. Muss eine iOS-Systemberechtigung angefragt werden?
3. Muss die Datenschutzseite angepasst werden?
4. Muss App Privacy in App Store Connect aktualisiert werden?
5. Muss die Lösch-/Exportlogik erweitert werden?
