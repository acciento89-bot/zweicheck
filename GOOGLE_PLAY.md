# ZweiCheck — Google Play release handoff

## Android identity

- App name: ZweiCheck
- Package / application ID: `de.kamilunavo.zweicheck`
- Version name: `1.0.0`
- Version code: `1`
- Target SDK: Android 16 / API 36
- Minimum SDK: API 26
- Base app price: Free
- Backend: `https://zweicheck.kamilunavo.com`

## Monetization — Premium Familie

The current native iOS product already contains the voluntary `Premium Familie` subscription. Android must mirror it; the older App-Store handoff that said “no IAP in 1.0” is stale and must not be used as product truth.

Current iOS product IDs:

- Monthly: `de.kamilunavo.zweicheck.premium.family.monthly`
- Yearly: `de.kamilunavo.zweicheck.premium.family.yearly`

Google Play should use the same two identifiers as independent Play subscription records so cross-platform product mapping stays obvious.

| Product | Play subscription ID | Base plan ID | German launch price |
| --- | --- | --- | ---: |
| Premium Familie Monthly | `de.kamilunavo.zweicheck.premium.family.monthly` | `monthly` | €4.99 / month |
| Premium Familie Yearly | `de.kamilunavo.zweicheck.premium.family.yearly` | `yearly` | €39.99 / year |

The monthly/annual launch-price decision comes from the current product/UI regression history; runtime UI must always display the localized price returned by Google Play, never a hard-coded price.

Current native entitlement behavior to mirror:

### Free
- core check/request and response flow;
- trust connections;
- push notifications;
- one image per check.

### Premium Familie
- up to three images per check;
- automatic reminder after 5–120 minutes;
- optional fallback/second trusted person;
- optional automatic reroute to that second person after the reminder.

The Play client must query both subscription products, show localized Play prices, acknowledge successful purchases, restore ownership, and derive the local Premium entitlement from current Play subscription ownership. Any future server-side cross-platform entitlement sync is a separate hardening gate; do not invent a backend entitlement that does not currently exist in the iOS architecture.

## Native parity target

Android is a native client against the same ZweiCheck API as the SwiftUI app. It must not be replaced with a WebView shell.

Implemented in the Android lane:

- login and registration;
- encrypted `zc_session` persistence using Android Keystore;
- password-reset request;
- native checks list;
- reviewer recommendations using the existing four API wire values;
- trust-routing and presence state;
- invitation creation and code acceptance;
- native four-step check creation;
- Android document/photo selection;
- incoming Android share intents;
- verified HTTPS-only networking;
- app links for `zweicheck.kamilunavo.com`;
- account logout and API support for account deletion;
- canonical 1024×1024 product icon shared with the iOS asset source.

Still required before production parity:

- Google Play Billing subscription UI/restore and Premium gates;
- FCM push transport and backend token registration for Android;
- notification tap routing to the relevant check;
- robust incoming `ACTION_SEND_MULTIPLE` draft handling for up to three shared images while respecting Free/Premium image limits;
- native account/export/delete UI completion;
- accessibility/device QA;
- persistent Play upload key and signed AAB.

## Push / FCM external gate

The existing product already supports Web Push and native APNs. Android native push requires an FCM project/app for package `de.kamilunavo.zweicheck` plus server-side Firebase credentials. Secrets must stay in deployment configuration and must never be committed to the repository.

The Android app should register its FCM token only after notification permission is granted. Push payloads must retain ZweiCheck's privacy rule: do not include descriptions, images or other sensitive check contents in notifications.

## Store listing draft (DE)

### Short description
Gemeinsam prüfen, bevor du zahlst, klickst oder persönliche Daten weitergibst.

### Full description
ZweiCheck verbindet dich in unsicheren Situationen mit einer Person, der du vertraust – bevor du zahlst, auf einen Link klickst, etwas installierst oder persönliche Daten weitergibst.

Erstelle eine Prüfanfrage, beschreibe kurz die Situation und füge bei Bedarf ein Bild hinzu. Deine Vertrauensperson kann dir anschließend eine klare Handlungsempfehlung geben.

Funktionen:
- private Vertrauensverbindungen statt öffentlicher Nutzersuche
- Prüfanfragen für Nachrichten, Zahlungen, Links und persönliche Daten
- klare Empfehlungen wie „Nicht handeln“ oder „Erst persönlich klären“
- Verfügbarkeitsstatus für Vertrauenspersonen
- Einladungen per Code
- Verlauf und Aktivitäten
- sichere Konto- und Sitzungsverwaltung

Premium Familie erweitert ZweiCheck unter anderem auf bis zu drei Bilder je Prüfung und zusätzliche Erinnerungs-/Ausweichpersonen-Funktionen. Preise und Verfügbarkeit werden direkt über Google Play angezeigt.

ZweiCheck ersetzt keine professionelle Sicherheits-, Rechts- oder Finanzberatung und gibt keine Garantie dafür, dass ein Vorgang sicher oder betrügerisch ist. Teile keine Passwörter, TANs oder vollständigen Kartendaten.

## URLs / declarations

- Website: `https://zweicheck.kamilunavo.com`
- Privacy: `https://zweicheck.kamilunavo.com/privacy`
- Privacy choices: `https://zweicheck.kamilunavo.com/privacy-choices`
- Support: `https://zweicheck.kamilunavo.com/support`
- Ads: No
- Billing/IAP: Yes — two auto-renewing Premium Familie subscriptions
- Account required for protected app functions: Yes
- Account deletion: supported by backend and must be exposed in the final Android account UI.

## Release gates

- [x] Android core CI: tests + debug AAB + minified release AAB green before icon/premium follow-up.
- [x] Canonical product icon wired from existing 1024×1024 iOS asset.
- [x] Premium Family product IDs and Free/Premium behavior reconciled against current iOS code.
- [ ] Add Play Billing 9.1 subscription query/purchase/restore and entitlement gates.
- [ ] Re-run Android CI after billing/icon changes.
- [ ] Complete Android account/export/delete screen.
- [ ] Complete Android shared-image draft parity.
- [ ] Create Firebase Android app and FCM configuration.
- [ ] Add server-side FCM send/token lifecycle without exposing credentials in the app/repo.
- [ ] Generate persistent Play upload key and signed release AAB after all code gates are green.
- [ ] Create Play Console app `ZweiCheck` / `de.kamilunavo.zweicheck`.
- [ ] Create and activate both Premium Familie subscriptions/base plans at the locked launch prices.
- [ ] Complete Data safety and account deletion declarations against final backend/mobile behavior.
- [ ] Internal-test fresh install, login/register, Free image limit, monthly/yearly purchase, restore, Premium feature gates, create/respond, share, invitation and deletion flows.
