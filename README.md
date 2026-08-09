# ZweiCheck

**Gemeinsam prüfen. Sicher handeln.**

ZweiCheck verbindet Menschen in unsicheren Situationen mit einer Person, der sie vertrauen – bevor sie zahlen, klicken, etwas installieren oder persönliche Daten weitergeben.

## Aktueller Entwicklungsstand

**Phase 3 – echte Konten und Vertrauensverbindungen**

Der Branch `phase-3-mvp` enthält eine vollständige serverfähige MVP-Grundlage:

- Registrierung und Anmeldung
- sichere Cookie-Sitzungen
- E-Mail-Bestätigung und Passwort-Reset
- Einladung per Code oder E-Mail-Link
- private Vertrauensverbindungen
- echte Prüfanfragen zwischen zwei Konten
- geschützte Bild-Uploads
- vier Handlungsempfehlungen
- automatisches Aktualisieren neuer Antworten
- Verlauf und sofortiger Zugriffsentzug
- PostgreSQL und persistente Docker-Volumes

## Lokaler Start

```bash
cp .env.example .env
docker compose up --build
```

Danach:

```text
http://localhost:3000
```

Im lokalen Standardmodus werden Bestätigungs- und Reset-Links in den Container-Logs ausgegeben:

```bash
docker compose logs -f app
```

## Portainer

Als Git-Stack verwenden:

```text
docker-compose.portainer.yml
```

Erforderliche Variablen:

```text
PROXY_NETWORK=kamilunavo-infrastructure_frontend
POSTGRES_PASSWORD=<langes-zufälliges-passwort>
APP_BASE_URL=https://zweicheck.kamilunavo.com
EMAIL_MODE=log
```

Für echten E-Mail-Versand zusätzlich:

```text
EMAIL_MODE=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ZweiCheck <noreply@kamilunavo.com>
```

Caddy muss auf den neuen App-Port zeigen:

```caddy
zweicheck.kamilunavo.com {
    encode zstd gzip
    reverse_proxy zweicheck:3000
}
```

## Prüfung

```bash
npm install
npm run check
npm test
```

Die GitHub Action startet zusätzlich PostgreSQL, wendet das Schema an, führt einen Server-Smoke-Test aus und baut das Docker-Image.

## Sicherheitsgrenzen

- ZweiCheck gibt keine Sicherheitsgarantie.
- Keine TANs, Passwörter oder vollständigen Kartendaten teilen.
- Keine öffentliche Nutzersuche.
- Keine Bank- oder Versicherungsintegration im MVP.
- Push-Benachrichtigungen folgen nach der stabilen Grundversion.

## Dokumentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PRIVACY-AND-DELETION.md`](docs/PRIVACY-AND-DELETION.md)
- [`docs/BRAND.md`](docs/BRAND.md)
- [`docs/PRODUCT.md`](docs/PRODUCT.md)
- [`docs/USER-FLOWS.md`](docs/USER-FLOWS.md)

---

© Kamilunavo · ZweiCheck
