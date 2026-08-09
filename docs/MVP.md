# ZweiCheck – MVP-Umfang

## Ziel der ersten echten Version

Die erste Version muss beweisen, dass Menschen:

1. eine Vertrauensperson verbinden,
2. in einer unsicheren Situation tatsächlich eine Prüfung starten,
3. zeitnah eine verständliche Rückmeldung erhalten,
4. den Ablauf als hilfreich genug empfinden, um erneut darauf zurückzugreifen.

Der MVP soll bewusst klein bleiben. Er ist kein vollständiges Sicherheitsportal.

## Muss enthalten sein

### Konto und Identität

- Registrierung mit E-Mail
- Anmeldung
- Vorname und Profilbild optional
- Konto löschen
- Datenschutzhinweise und Einwilligungen

### Vertrauenskreis

- Person per Link oder Code einladen
- Einladung annehmen oder ablehnen
- Verbindung entfernen
- eine Prioritäts-Vertrauensperson festlegen

### Prüfanfrage

- vier feste Kategorien
- kurze Beschreibung
- Bild oder Screenshot hinzufügen
- optional Betrag und Zeitdruck
- eine oder mehrere Vertrauenspersonen auswählen
- Anfrage absenden
- Status „gesendet“, „gesehen“ und „beantwortet“

### Rückmeldung

- vier feste Handlungsempfehlungen
- optionale Begründung
- direkte Anrufaktion
- zusätzliche Vertrauensperson hinzuziehen

### Verlauf

- offene Prüfungen
- abgeschlossene Prüfungen
- Detailansicht
- Vorgang schließen
- Vorgang löschen, soweit keine Aufbewahrungspflicht besteht

### Benachrichtigungen

- neue Anfrage
- Erinnerung an offene Anfrage
- Rückmeldung erhalten
- Einladung angenommen

### Basissicherheit

- Transportverschlüsselung
- Zugriff nur für ausdrücklich beteiligte Personen
- sensible Inhalte nicht vollständig in Push-Nachrichten anzeigen
- zeitlich begrenzte Einladungslinks
- Schutz vor einfachem Missbrauch und zu vielen Anfragen

## Sollte enthalten sein

- Sprachnachricht als Anhang
- Familiencode
- mehrere Vertrauenspersonen
- leichte Offline-Unterstützung für noch nicht versendete Entwürfe
- barrierearme Schriftgrößen
- biometrische App-Sperre

## Später

- Apple- und Google-Anmeldung
- echtes Familienabo
- automatische Warnsignal-Erkennung
- Link- und Rufnummernprüfung
- aktuelle Betrugsszenarien
- Bank- oder Versicherungskooperationen
- SAFEUP-Lernmissionen als separates oder verbundenes Produkt
- mehrsprachige App

## Nicht im MVP

- Bankkonto anbinden
- Zahlungen ausführen oder blockieren
- Fernzugriff auf ein anderes Gerät
- öffentliche Nutzerprofile
- öffentliche Warnmeldungen
- Chatgruppen
- allgemeiner Messenger
- vollautomatische Entscheidung „Betrug“ oder „sicher“
- umfangreiches Web-Dashboard
- Unternehmensverwaltung
- komplexe Rollen und Rechte
- Gamification

## Hauptbildschirme

1. Splash und Willkommen
2. Registrierung und Anmeldung
3. Vertrauensperson verbinden
4. Startseite
5. Kategorie wählen
6. Details und Anhänge hinzufügen
7. Anfrage gesendet
8. Anfrage für Vertrauensperson
9. Empfehlung abgeben
10. Rückmeldung ansehen
11. Vertrauenskreis
12. Verlauf
13. Profil und Datenschutz
14. Familienabo-Vorschau

## Definition of Done für den Prototyp

Der klickbare Prototyp ist bereit für Nutzertests, wenn eine Testperson ohne Erklärung:

- versteht, wofür ZweiCheck da ist,
- eine Prüfung in weniger als 60 Sekunden anlegen kann,
- erkennt, dass sie bis zur Antwort nicht handeln sollte,
- als Vertrauensperson eine Rückmeldung in weniger als 30 Sekunden geben kann,
- die Bedeutung aller vier Empfehlungen versteht.

## Frühe Testfragen

- War sofort verständlich, was ZweiCheck macht?
- Würdest du die App mit deinen Eltern, deinem Partner oder deinem Kind verbinden?
- In welcher realen Situation hättest du sie zuletzt gebraucht?
- War eine Formulierung zu streng, beschämend oder unklar?
- Würdest du 39,99 € pro Jahr für deine Familie bezahlen?
- Welche Information muss in einer Prüfanfrage unbedingt sichtbar sein?

## Technische Leitplanke für Phase 2

Die erste technische Umsetzung soll mobile-first und als echte iOS-/Android-App planbar sein. Bevor die Architektur festgelegt wird, wird der klickbare Prototyp getestet. Keine Backend- oder Plattformarchitektur wird nur auf Verdacht gebaut.
