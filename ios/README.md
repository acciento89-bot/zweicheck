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
- Konto, Datenschutz/Support, native Kontolöschung
- Universal-Link-Entitlement für `zweicheck.kamilunavo.com`
- Bundle-ID `de.kamilunavo.zweicheck`
- Apple Team `TKG684N5GL`

## Als Nächstes
- APNs Push
- Share Extension für Links/Text/Screenshots
- App Icon und Store Screenshots
- signierter TestFlight-Build
