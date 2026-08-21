# ZweiCheck — Google Play release handoff

## Android identity

- App name: ZweiCheck
- Package / application ID: `de.kamilunavo.zweicheck`
- Version name: `1.0.0`
- Version code: `1`
- Target SDK: Android 16 / API 36
- Minimum SDK: API 26
- Base app price: Free
- Current monetization: none
- Backend: `https://zweicheck.kamilunavo.com`

## Native parity target

Android is a native client against the same ZweiCheck API as the SwiftUI app. It must not be replaced with a WebView shell.

Implemented in the first Android lane:

- login and registration;
- encrypted `zc_session` persistence using Android Keystore;
- password-reset request;
- native checks list;
- reviewer recommendations using the existing four API wire values;
- trust-routing and presence state;
- invitation creation and code acceptance;
- native four-step check creation;
- up to three image attachments through Android document/photo selection;
- incoming Android share intents for text and images;
- verified HTTPS-only networking;
- app links for `zweicheck.kamilunavo.com`;
- account logout and API support for account deletion.

Still required before production parity:

- FCM push transport and backend token registration for Android;
- notification tap routing to the relevant check;
- robust incoming `ACTION_SEND_MULTIPLE` draft handling for up to three shared images;
- native account/export/delete UI completion;
- accessibility/device QA and final icon/assets;
- signed Play upload key/AAB.

## Push / FCM external gate

The existing product already supports Web Push and native APNs. Android native push requires an FCM project/app for package `de.kamilunavo.zweicheck` plus server-side Firebase credentials. Secrets must stay in deployment configuration and must never be committed to the repository.

The Android app should register its FCM token only after notification permission is granted. Push payloads must retain ZweiCheck's privacy rule: do not include descriptions, images or other sensitive check contents in notifications.

## Store listing draft (DE)

### Short description
Gemeinsam prüfen, bevor du zahlst, klickst oder persönliche Daten weitergibst.

### Full description
ZweiCheck verbindet dich in unsicheren Situationen mit einer Person, der du vertraust – bevor du zahlst, auf einen Link klickst, etwas installierst oder persönliche Daten weitergibst.

Erstelle eine Prüfanfrage, beschreibe kurz die Situation und füge bei Bedarf Bilder hinzu. Deine Vertrauensperson kann dir anschließend eine klare Handlungsempfehlung geben.

Funktionen:
- private Vertrauensverbindungen statt öffentlicher Nutzersuche
- Prüfanfragen für Nachrichten, Zahlungen, Links und persönliche Daten
- bis zu drei Bilder pro Anfrage
- klare Empfehlungen wie „Nicht handeln“ oder „Erst persönlich klären“
- Verfügbarkeitsstatus für Vertrauenspersonen
- Einladungen per Code
- Verlauf und Aktivitäten
- sichere Konto- und Sitzungsverwaltung

ZweiCheck ersetzt keine professionelle Sicherheits-, Rechts- oder Finanzberatung und gibt keine Garantie dafür, dass ein Vorgang sicher oder betrügerisch ist. Teile keine Passwörter, TANs oder vollständigen Kartendaten.

## URLs / declarations

- Website: `https://zweicheck.kamilunavo.com`
- Support/Privacy: must be verified from the final public deployment before Play submission.
- Ads: No
- Current billing/IAP: No
- Account required for protected app functions: Yes
- Account deletion: supported by backend and must be exposed in the final Android account UI.

## Release gates

- [ ] Android CI: tests + debug AAB + minified release AAB green.
- [ ] Complete Android account/export/delete screen.
- [ ] Complete Android shared-image draft parity.
- [ ] Create Firebase Android app and FCM configuration.
- [ ] Add server-side FCM send/token lifecycle without exposing credentials in the app/repo.
- [ ] Final app icon and launcher assets.
- [ ] Generate persistent Play upload key and signed release AAB.
- [ ] Create Play Console app `ZweiCheck` / `de.kamilunavo.zweicheck`.
- [ ] Complete Data safety and account deletion declarations against final backend/mobile behavior.
- [ ] Internal-test fresh install, login/register, create/respond, share, invitation and deletion flows.
