# ZweiCheck

**Gemeinsam prüfen. Sicher handeln.**

ZweiCheck verbindet Menschen in unsicheren Situationen mit einer Person, der sie vertrauen – bevor sie zahlen, klicken, etwas installieren oder persönliche Daten weitergeben.

## Produktversprechen

> Bevor du etwas tust, das sich später nur schwer rückgängig machen lässt, holst du dir mit wenigen Schritten einen zweiten Blick aus deinem Vertrauenskreis.

ZweiCheck ist keine automatische Sicherheitsgarantie und keine Bank-App. Die App schafft eine bewusste Pause, bündelt die wichtigsten Informationen und ermöglicht eine schnelle menschliche Rückmeldung.

## Aktueller Stand

**Phase 2 – klickbarer Mobile-First-Prototyp**

Der Prototyp funktioniert vollständig im Browser, speichert Demoänderungen lokal und kann als PWA installiert werden. Es gibt bewusst noch kein Backend und keine echte Registrierung.

Enthalten sind:

- dreistufiges Onboarding
- Vertrauensperson verbinden
- kompakte Startseite mit einer dominierenden Aktion
- vier Prüfungsarten
- Beschreibung, Betrag, Zeitdruck und Beispielanhang
- Versand einer Prüfanfrage
- umschaltbare Ansicht für Schutz- und Vertrauensperson
- vier klar formulierte Handlungsempfehlungen
- Rückmeldung und Abschluss
- offene Prüfungen und Verlauf
- Vertrauenskreis und Familiencode
- Familienabo-Vorschau
- Offline-App-Shell und Installationsmanifest

## Online-Deployment

Der Prototyp ist für die Veröffentlichung unter folgender Adresse vorbereitet:

```text
https://zweicheck.kamilunavo.com
```

Die Anwendung wird als statische PWA in einem kleinen Nginx-Container ausgeliefert. Der Container stellt `/health` für Docker und Caddy bereit.

### Bestehendes Serverprojekt aktualisieren

Im Verzeichnis, in dem die anderen Kamilunavo-Dienste liegen:

```bash
git clone https://github.com/acciento89-bot/zweicheck.git
```

Existiert der Ordner bereits:

```bash
cd zweicheck
git pull origin main
cd ..
```

Den Dienst aus [`deploy/compose-snippet.yml`](deploy/compose-snippet.yml) in die bestehende `docker-compose.yml` übernehmen. Der erwartete Projektordner neben der Compose-Datei heißt `zweicheck`.

Danach den Caddy-Block aus [`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet) in die bestehende Caddyfile übernehmen.

Anschließend:

```bash
docker compose build --no-cache zweicheck
docker compose up -d --force-recreate zweicheck
docker compose restart caddy
```

### Deployment prüfen

```bash
docker compose ps zweicheck
docker compose logs --tail=100 zweicheck
curl -fsS https://zweicheck.kamilunavo.com/health
```

Erwartete Antwort:

```text
ok
```

Danach im Browser öffnen:

```text
https://zweicheck.kamilunavo.com
```

## Prototyp lokal öffnen

Ein einfacher lokaler Webserver reicht aus:

```bash
python3 -m http.server 8080
```

Danach im Browser öffnen:

```text
http://localhost:8080
```

Alternativ mit Node.js:

```bash
npx serve .
```

## Technische Prüfung

```bash
npm run check
docker build -t zweicheck:test .
```

Die GitHub Action prüft JavaScript, erforderliche Dateien, den Docker-Build, den Healthcheck und die ausgelieferte Startseite bei jedem Push und Pull Request.

## Demo-Hinweis

Über den schwebenden Schalter kann zwischen **Schutzperson** und **Vertrauensperson** gewechselt werden. Der Zurücksetzen-Button löscht den lokalen Demo-Stand.

## Produktprinzipien

1. **Eine Hauptaktion:** „Prüfung starten“.
2. **Mensch vor Maschine:** Die zweite Einschätzung kommt aus dem Vertrauenskreis.
3. **Keine falsche Sicherheit:** Formulierungen wie „garantiert sicher“ oder „freigegeben“ werden vermieden.
4. **Ruhe statt Alarmismus:** Klare Sprache, große Bedienelemente, wenige Entscheidungen.
5. **Privatheit als Standard:** Nur ausdrücklich verbundene Personen sehen einen Vorgang.
6. **Kleiner Start:** Kein Bankzugriff, kein soziales Netzwerk und keine unnötigen Zusatzmodule im MVP.

## Dokumentation

- [`docs/BRAND.md`](docs/BRAND.md) – Marke, Farben, Typografie und Tonalität
- [`docs/PRODUCT.md`](docs/PRODUCT.md) – Zielgruppe, Nutzen und Geschäftsmodell
- [`docs/USER-FLOWS.md`](docs/USER-FLOWS.md) – verbindliche Nutzerabläufe
- [`docs/MVP.md`](docs/MVP.md) – Umfang der ersten echten Version
- [`docs/DECISIONS.md`](docs/DECISIONS.md) – festgehaltene Produktentscheidungen
- [`docs/SCREEN-SPEC.md`](docs/SCREEN-SPEC.md) – verbindliche Spezifikation der Kernbildschirme

## Nächster Meilenstein

**Phase 3: echte Konten und Vertrauensverbindungen**

- technische App-Struktur festlegen
- Registrierung und Anmeldung
- sichere Einladungen
- persistente Prüfanfragen
- echte Datei-Uploads
- Push-Benachrichtigungen
- Datenschutz- und Sicherheitsmodell

---

© Kamilunavo · ZweiCheck
