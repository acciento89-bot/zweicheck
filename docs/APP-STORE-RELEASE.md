# ZweiCheck – App-Store-Releasepaket 1.0

Stand: 12.08.2026

## Ziel

ZweiCheck soll als eigenständige iOS-App veröffentlicht werden. Die bestehende Web/PWA-Anwendung bleibt Backend und Web-Zugang, darf für die App-Store-Version aber nicht nur unverändert in einen WebView verpackt werden. Apple Guideline 4.2 verlangt einen ausreichend eigenständigen, app-typischen Nutzen.

## Technische Apple-Basis

- Build für Einreichungen ab 28.04.2026: Xcode 26 oder neuer mit iOS-26-SDK oder neuer.
- Bundle Identifier: `de.kamilunavo.zweicheck`
- Share Extension: `de.kamilunavo.zweicheck.share`
- App Group: `group.de.kamilunavo.zweicheck`
- Apple Developer Team: `TKG684N5GL`
- Produktversion: `1.0.0`
- Mindestziel für die erste native Version: iOS 17+; Build selbst mit aktuellem iOS-26-SDK.
- Keine Werbung, kein Tracking, keine In-App-Käufe in Version 1.0.

## App-Store-Metadaten – Deutsch

**Name**  
ZweiCheck

**Untertitel**  
Gemeinsam sicher entscheiden

**Promotional Text**  
Unsicher bei einer Nachricht, Zahlung oder einem Link? Frag eine vertraute Person, bevor du handelst.

**Beschreibung**  
ZweiCheck gibt dir einen einfachen zweiten Blick, wenn du bei einer Nachricht, Zahlung, einem Link, einer Installation oder der Weitergabe persönlicher Daten unsicher bist.

Du entscheidest selbst, wem du vertraust. Eine Prüfanfrage wird nur an eine von dir verbundene Vertrauensperson geschickt. Diese kann dir eine klare Rückmeldung geben: nicht handeln, erst persönlich klären, wirkt nachvollziehbar oder direkt anrufen.

ZweiCheck ist bewusst einfach aufgebaut. Große Schaltflächen, eine geführte Prüfanfrage und klare Sprache helfen auch Menschen, die sich mit Smartphones oder Sicherheitsfragen nicht jeden Tag beschäftigen.

Funktionen:
- private Vertrauenspersonen verbinden
- verdächtige Nachrichten, Zahlungen, Links und Datenfreigaben gemeinsam prüfen
- optional Bilder und Screenshots mit dem systemeigenen iOS-Fotopicker mitschicken
- Inhalte aus dem iOS-Teilen-Menü als privaten ZweiCheck-Entwurf übernehmen
- klare menschliche Rückmeldung statt automatischer KI-Entscheidung
- native Aktivitäten mit Ungelesen-Zähler
- optionale native Push-Benachrichtigungen
- Erinnerungs- und Ausweichperson-Funktion bei offenen Anfragen
- eigene Daten herunterladen
- Konto direkt in ZweiCheck löschen

ZweiCheck ersetzt keine Bank, Polizei, Rechtsberatung oder professionelle Sicherheitsprüfung. Bei akutem Betrugsverdacht sollten zusätzlich die offiziellen Kontaktwege des betroffenen Anbieters genutzt werden.

**Keywords – Entwurf**  
Betrug,Scam,Sicherheit,Zweitmeinung,Senioren,Vertrauen,Phishing,Prüfen

**Primary Category**  
Utilities

**Secondary Category – optional**  
Lifestyle

**Copyright**  
2026 Piotr Kaminski – Kamilunavo

## Öffentliche URLs

Nach Deployment:

- Privacy Policy: `https://zweicheck.kamilunavo.com/privacy`
- Privacy Choices: `https://zweicheck.kamilunavo.com/privacy-choices`
- Support URL: `https://zweicheck.kamilunavo.com/support`
- Marketing URL: `https://zweicheck.kamilunavo.com/`
- Universal-Link Association: `https://zweicheck.kamilunavo.com/.well-known/apple-app-site-association`

## App Privacy – Arbeitsentwurf für App Store Connect

Die finale Auswahl muss vor Einreichung noch einmal direkt gegen den zu diesem Zeitpunkt aktuellen App-Store-Connect-Fragebogen geprüft werden.

Arbeitsstand für die native 1.0:

- Contact Info → Name, Email Address: für Konto, Authentifizierung und Vertrauensverbindungen; mit Identität verknüpft; kein Tracking.
- User Content → Photos or Videos, Other User Content: für optionale Screenshots/Bilder, geteilte Entwürfe und Prüfbeschreibungen; mit Identität verknüpft, sobald der Nutzer die Prüfanfrage absendet; kein Tracking.
- Financial Info → Other Financial Info: wegen des optionalen vom Nutzer selbst eingegebenen Betrags in einer Prüfanfrage; Funktionsbereitstellung; kein Tracking. Diese Kategorie vor Einreichung noch einmal gegen Apples aktuelle Definition prüfen.
- Identifiers → Device ID / gerätebezogener Push-Identifier: APNs-Gerätetoken wird dem angemeldeten Konto serverseitig zugeordnet, ausschließlich zur Zustellung von ZweiCheck-Benachrichtigungen; mit Identität verknüpft; kein Tracking.
- Diagnostics: für 1.0 ist kein externer Analytics- oder Crash-SDK vorgesehen. Nur angeben, falls vor Release noch ein solcher Dienst ergänzt wird.

Keine Daten werden für Werbung oder Tracking verwendet und keine Daten werden an Werbenetzwerke verkauft.

## Altersfreigabe

Erwartung: 4+ nach aktuellem Apple-Fragebogen. Die tatsächliche Freigabe wird von App Store Connect anhand des zum Einreichungszeitpunkt aktuellen Fragebogens erzeugt und muss dort final bestätigt werden.

## Review-Zugang

ZweiCheck benötigt wegen der privaten Vertrauensverbindungen zwei Testkonten, damit App Review den Kernablauf vollständig testen kann.

Vor Einreichung direkt in der Produktionsumgebung anlegen:

1. Review-Konto A – Anfragende Person
2. Review-Konto B – Vertrauensperson
3. beide E-Mails bestätigen
4. Verbindung herstellen
5. mindestens eine offene Test-Prüfanfrage vorbereiten

Passwörter niemals im Repository speichern. Die Zugangsdaten ausschließlich direkt im Feld „App Review Information“ in App Store Connect hinterlegen.

## App-Review-Notizen – Vorlage

ZweiCheck ist ein privater Zweitmeinungsdienst. Nutzer verbinden sich bewusst mit Personen, denen sie bereits vertrauen. Es gibt keine öffentliche Personensuche, keinen öffentlichen Feed und keine KI, die Sicherheitsentscheidungen für den Nutzer trifft.

Testablauf:
1. Mit Review-Konto A anmelden.
2. „Ich bin unsicher – prüfen lassen“ öffnen.
3. Review-Konto B als Vertrauensperson auswählen und eine Prüfanfrage absenden.
4. Mit Review-Konto B anmelden und die Anfrage beantworten.
5. Wieder Konto A öffnen; die Antwort erscheint in Aktivitäten und in der Prüfung.
6. Optional eine Nachricht, URL oder einen Screenshot über das iOS-Teilen-Menü mit „Mit ZweiCheck prüfen“ teilen. Der Inhalt wird nur lokal als Entwurf gespeichert und erst nach Auswahl der Vertrauensperson und ausdrücklichem Absenden übertragen.
7. Konto zeigt Datenschutz, Support, Push-Aktivierung und Kontolöschung.

Die Datenschutzrichtlinie ist in der App unter Konto erreichbar. Konto- und Dateiinhalte sind nicht öffentlich.

## Screenshot-Plan

Für die erste Einreichung mindestens folgende Motive vorbereiten:

1. Startseite: „Ich bin unsicher – prüfen lassen“
2. Geführte Prüfanfrage, Schritt „Worum geht es?“
3. Prüfanfrage mit optional ausgewählten Screenshots
4. Prüfanfrage „Alles richtig?“
5. klare Rückmeldung „Erst persönlich klären“ oder „Nicht handeln“
6. Vertrauenspersonen / Verfügbarkeitsstatus
7. Aktivitäten / Antwort erhalten
8. optional: Share Extension „Mit ZweiCheck prüfen“

Keine echten Namen, E-Mail-Adressen, Telefonnummern, Bankdaten oder realen Betrugsnachrichten in Store-Screenshots verwenden.

## Native iOS-Funktionen für Guideline 4.2

Bereits umgesetzt:

- echte SwiftUI-Oberfläche statt WebView
- systemeigener PhotosPicker ohne pauschalen Vollzugriff auf die Fotobibliothek
- Bildaufbereitung und Upload an die bestehende geschützte ZweiCheck-API
- Universal-Link-Entitlement für `zweicheck.kamilunavo.com`
- AASA-Datei für Einladungscodes und direkte Prüfanfragen
- sichere Sitzungsspeicherung im iOS Keychain
- native Aktivitäten und Deep-Link-Navigation
- native APNs-Registrierung mit ausdrücklicher Nutzerfreigabe
- serverseitige APNs Provider API über HTTP/2 und tokenbasierte Authentifizierung
- Notification-Taps führen direkt zur betreffenden Prüfanfrage
- echte iOS Share Extension für Text, Web-Links und bis zu drei Bilder/Screenshots
- Share Extension speichert Inhalte zuerst ausschließlich im privaten App-Group-Container; der Nutzer wählt anschließend in ZweiCheck selbst die Vertrauensperson und bestätigt das Absenden
- systemgerechte Accessibility / Dynamic Type durch native SwiftUI-/UIKit-Komponenten

Optionaler Feinschliff vor oder nach 1.0:

- native Haptik bei wichtigen Bestätigungen

Das Kernprodukt und Backend bleiben identisch; die native Oberfläche nutzt dieselben abgesicherten API-Endpunkte.

## APNs-Konfiguration in Produktion

Der Server startet ohne Apple-Schlüssel weiterhin normal; native APNs-Zustellung ist dann lediglich deaktiviert. Nach Erstellung eines Apple Push Authentication Keys werden direkt in der Produktionsumgebung gesetzt:

- `APNS_TEAM_ID=TKG684N5GL`
- `APNS_KEY_ID=<Apple Key ID>`
- `APNS_PRIVATE_KEY_B64=<Base64 des privaten .p8 Keys>`
- `APNS_BUNDLE_ID=de.kamilunavo.zweicheck`

Der private `.p8`-Key wird niemals im Repository, in Chat-Verläufen oder Support-Tickets gespeichert.

## Vor Einreichung noch extern nötig

Diese Punkte benötigen Apple Developer / App Store Connect und können nicht allein durch das Server-Repository abgeschlossen werden:

- App-ID `de.kamilunavo.zweicheck` im Apple Developer Account registrieren
- Push Notifications, Associated Domains und App Groups für die Haupt-App aktivieren
- App Group `group.de.kamilunavo.zweicheck` registrieren
- Share-Extension-Identifier `de.kamilunavo.zweicheck.share` registrieren und derselben App Group zuordnen
- Apple Push Authentication Key erstellen/zuordnen; Key ID und privaten `.p8`-Key ausschließlich direkt in der Produktionsumgebung konfigurieren
- Xcode-26-Projekt signieren / Provisioning vervollständigen
- finales App-Icon als Xcode Asset Catalog einbinden
- Store-Screenshots im Simulator bzw. auf Geräten aufnehmen
- Demo-Zugangsdaten in App Store Connect eintragen
- App Privacy, Altersfreigabe, DSA-/Trader-Status und Verfügbarkeit in App Store Connect final ausfüllen
- signierten Build über TestFlight auf echten Geräten testen
- anschließend zur App Review einreichen
