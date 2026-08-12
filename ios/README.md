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

## Phase 1
- Anmeldung und Registrierung
- native Session mit Cookie + Keychain-Wiederherstellung
- Start / Senior-first CTA
- neue Prüfanfrage in 4 Schritten
- Prüfungen ansehen und beantworten
- Vertrauenspersonen, Verfügbarkeit, Einladen, Einladungscode annehmen
- Konto, Datenschutz/Support, native Kontolöschung

## Danach
- PhotosPicker + Bildupload
- APNs Push
- Universal Links + AASA
- Share Extension für Links/Text/Screenshots
- App Icon und Store Screenshots
