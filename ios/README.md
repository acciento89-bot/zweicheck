# ZweiCheck iOS

Native SwiftUI-App für ZweiCheck 1.0.

## Voraussetzungen
- Xcode 26+
- iOS 17+
- XcodeGen (`brew install xcodegen`)

## Projekt erzeugen
```bash
cd ios
xcodegen generate
open ZweiCheck.xcodeproj
```

Die App spricht direkt mit `https://zweicheck.kamilunavo.com` und verwendet die bestehende ZweiCheck-API. Keine WebView-Hülle.

## Native 1.0 – aktueller Stand
- Anmeldung und Registrierung
- Session mit Cookie + Keychain-Wiederherstellung
- Start / Senior-first CTA
- neue Prüfanfrage in 4 Schritten
- systemeigener PhotosPicker, maximal 3 Bilder; Bilder werden vor Upload als JPEG verkleinert
- Prüfungen ansehen und beantworten
- Vertrauenspersonen, Verfügbarkeit, Einladen, Einladungscode annehmen
- native Aktivitäten mit Ungelesen-Zähler
- native APNs-Benachrichtigungen mit ausdrücklicher Nutzerfreigabe
- Notification-Taps öffnen direkt die betreffende Prüfung
- Share Extension „Mit ZweiCheck prüfen“ für Text, Links und bis zu 3 Bilder/Screenshots
- geteilte Inhalte werden zunächst nur lokal als Entwurf gespeichert und erst nach Nutzerprüfung versendet
- Konto, Datenschutz/Support, native Kontolöschung
- Universal-Link-Entitlement für `zweicheck.kamilunavo.com`
- App Group `group.de.kamilunavo.zweicheck`
- Bundle-ID `de.kamilunavo.zweicheck`
- Share-Extension-Bundle `de.kamilunavo.zweicheck.share`
- Apple Team `TKG684N5GL`

## APNs-Serverkonfiguration
Der Server startet auch ohne Apple-Schlüssel normal. Native Push wird erst aktiv, wenn im Produktions-Stack gesetzt sind:

```text
APNS_TEAM_ID=TKG684N5GL
APNS_KEY_ID=<Apple Key ID>
APNS_PRIVATE_KEY_B64=<Base64 des .p8 Private Keys>
APNS_BUNDLE_ID=de.kamilunavo.zweicheck
```

Der private `.p8`-Schlüssel gehört niemals ins Repository und nicht in Chat-/Ticket-Verläufe. Er wird direkt als Secret/Environment-Wert in der Produktionsumgebung hinterlegt.

## Vor TestFlight noch nötig
- Apple Identifier `de.kamilunavo.zweicheck` registrieren
- Push Notifications, Associated Domains und App Groups für die Haupt-App aktivieren
- App Group `group.de.kamilunavo.zweicheck` im Apple Developer Account registrieren
- Identifier `de.kamilunavo.zweicheck.share` für die Share Extension registrieren und derselben App Group zuordnen
- APNs Auth Key erstellen/zuordnen und dessen Key ID + Private Key direkt in der Produktionsumgebung hinterlegen
- finales App Icon / Asset Catalog
- signierten Release-Build erzeugen
- TestFlight-Test auf echten Geräten
- Store-Screenshots und App-Store-Connect-Metadaten final eintragen
