# ZweiCheck – Phase-3-Architektur

## Ziel

Phase 3 ersetzt den lokalen Demo-Stand durch eine echte, serverseitig geschützte Anwendung. Frontend und API laufen unter derselben Domain. PostgreSQL speichert Konten, Sitzungen, Verbindungen und Prüfanfragen. Bilder liegen in einem privaten Docker-Volume und werden ausschließlich über eine berechtigungsgeprüfte API ausgeliefert.

## Komponenten

- **Node.js/Express**: Web-App, REST-API, Authentifizierung und Berechtigungsprüfung
- **PostgreSQL**: Konten, Sessions, E-Mail-Tokens, Einladungen, Vertrauensverbindungen, Prüfungen und Dateimetadaten
- **Privates Upload-Volume**: Bilder und Screenshots; kein direkter öffentlicher Dateipfad
- **Caddy**: TLS und Reverse Proxy auf `zweicheck:3000`
- **Portainer Stack**: App, Datenbank, Volumes und Netzwerke

## Authentifizierung

- Passwörter werden mit bcrypt und Kostenfaktor 12 gehasht.
- Sitzungen verwenden zufällige, undurchsichtige Tokens.
- In der Datenbank wird nur der SHA-256-Hash des Session-Tokens gespeichert.
- Das Browser-Cookie ist `HttpOnly`, `Secure` und `SameSite=Lax`.
- Passwortänderungen löschen alle bestehenden Sitzungen.
- Schreibende Requests mit fremdem `Origin` werden abgewiesen.

## Rollenmodell

Jedes Konto kann beide Rollen einnehmen:

- **Anfragende Person**: erstellt eine Prüfung, sieht die Antwort und schließt den Vorgang.
- **Vertrauensperson**: sieht nur an sie gerichtete Prüfungen und kann genau einmal antworten.

Eine Vertrauensperson verliert nach dem Entfernen der Verbindung sofort den Zugriff auf gemeinsame Prüfungen und Anhänge. Die anfragende Person behält ihren eigenen Verlauf.

## Einladungen

- achtstelliger Code ohne leicht verwechselbare Zeichen
- nur als Hash in PostgreSQL gespeichert
- 48 Stunden gültig
- nur einmal nutzbar
- optional an eine konkrete E-Mail-Adresse gebunden
- eine eigene Einladung kann nicht angenommen werden

## Prüfanfragen

Unterstützt werden:

- Nachricht oder Anruf
- Zahlung oder Rechnung
- Link, QR-Code oder App
- Daten oder Dokumente

Zusätzlich: Beschreibung, optionaler Betrag, Zeitdruck und bis zu drei Bilder. Es werden ausschließlich JPG, PNG und WebP akzeptiert; maximal 8 MB je Datei.

## Aktualisierung

Das Frontend prüft alle 15 Sekunden auf neue Antworten. Push-Benachrichtigungen bleiben ein eigener späterer Schritt, da dafür Browser-Abonnements, Schlüsselverwaltung und ein datenschutzkonformes Benachrichtigungskonzept notwendig sind.
