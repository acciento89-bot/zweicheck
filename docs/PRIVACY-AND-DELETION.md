# Datenschutz- und Löschkonzept – technischer Entwurf

## Datensparsamkeit

ZweiCheck speichert nur Daten, die für Konten, private Verbindungen und konkrete Prüfanfragen erforderlich sind. TANs, Passwörter und vollständige Karteninformationen sind ausdrücklich nicht vorgesehen und werden in der Oberfläche untersagt.

## Zugriff

- Keine öffentliche Nutzersuche.
- Keine öffentlich einsehbaren Profile.
- Prüfanfragen sind nur für die anfragende Person und die ausgewählte aktive Vertrauensperson sichtbar.
- Anhänge besitzen keine öffentliche URL und werden bei jedem Abruf serverseitig autorisiert.
- Nach Aufhebung einer Verbindung endet der Zugriff der ehemaligen Vertrauensperson sofort.

## Aufbewahrung

Für den MVP gelten vorläufig folgende technische Zielwerte:

- abgelaufene Sessions: automatisches Löschen beim Serverstart; später zusätzlich täglicher Job
- abgelaufene Einladungen: automatische Sperrung
- verwendete E-Mail-Tokens: für eine kurze Nachweisfrist speichern und später automatisiert entfernen
- abgeschlossene Prüfungen: bis zur Löschung durch die anfragende Person beziehungsweise bis zur Kontolöschung
- Server-Logs: keine Beschreibungen, Anhänge, Passwörter oder Session-Tokens protokollieren

## Kontolöschung

Die endgültige Self-Service-Kontolöschung wird erst freigeschaltet, wenn geklärt ist, wie gemeinsame Prüfanfragen rechtssicher behandelt werden. Vorgesehen ist:

1. aktive Verbindungen sofort widerrufen,
2. Sitzungen und offene Tokens löschen,
3. eigene Anhänge physisch entfernen,
4. eigene Prüfanfragen löschen oder nach festgelegter Frist anonymisieren,
5. Beteiligte über den Verlust des gemeinsamen Zugriffs informieren,
6. Backups nach ihrer regulären Rotation auslaufen lassen.

Bis dieser Ablauf implementiert und rechtlich geprüft ist, erfolgt eine Löschung administrativ. Vor einem öffentlichen Start sind Datenschutzerklärung, Auftragsverarbeitung, Backup-Fristen und SMTP-Anbieter festzulegen.
