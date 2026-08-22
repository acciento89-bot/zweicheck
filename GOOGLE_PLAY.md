# ZweiCheck — Google Play release handoff

## Android identity

- App name: ZweiCheck
- Package / application ID: `de.kamilunavo.zweicheck`
- Version name: `1.0.1`
- Version code: `2`
- Target SDK: Android 16 / API 36
- Minimum SDK: API 26
- Base app price: Free
- Backend: `https://zweicheck.kamilunavo.com`

## Monetization — Premium Familie

Google Play uses shorter Android-specific subscription IDs because Play limits subscription product IDs to 40 characters. The iOS StoreKit IDs remain unchanged.

| Product | Play subscription ID | Base plan | DE launch price |
| --- | --- | --- | ---: |
| Premium Familie Monthly | `de.kamilunavo.zweicheck.family.monthly` | `monthly` | €4.99 / month |
| Premium Familie Yearly | `de.kamilunavo.zweicheck.family.yearly` | `yearly` | €39.99 / year |

Runtime UI displays the localized price returned by Google Play.

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

The Android client uses Play Billing 9.1 for product query, monthly/yearly purchase, acknowledgement, restore and current Play entitlement state.

## Native Android parity

Implemented:

- login, registration and password reset;
- encrypted `zc_session` persistence using Android Keystore;
- native checks/respond flow;
- trust routing, presence and invitations;
- native four-step check creation;
- Free/Premium image limits;
- Premium reminder/fallback/auto-reroute controls;
- `ACTION_SEND` and `ACTION_SEND_MULTIPLE` draft handling;
- HTTPS-only API networking and app links;
- account JSON export;
- native account deletion;
- Google Play Billing Premium Family screen/restore;
- branded Android vector launcher icon;
- FCM client/service and server transport;
- explicit notification opt-in;
- FCM token removal on logout/account deletion;
- notification tap routes the relevant check to the top of the checks screen.

## Firebase / FCM architecture

The repository does not require or store `google-services.json`.

Android initializes Firebase programmatically from the public production Firebase Android app values locked into the release workflow:

- Project ID: `zweicheck`
- Firebase Android App ID: `1:569737949733:android:b959136242819d9367c5cc`
- package: `de.kamilunavo.zweicheck`

FCM auto-init is disabled in the manifest. The user explicitly taps **Push-Benachrichtigungen aktivieren**; Android then requests `POST_NOTIFICATIONS` where required, enables FCM auto-init and registers the token to the authenticated, email-verified ZweiCheck account.

Server credential:

- `FIREBASE_SERVICE_ACCOUNT_JSON_B64=<full Firebase/Google service-account JSON as base64>`

The production service-account credential is configured in the server deployment and stays server-side only. The existing ZweiCheck push worker sends Web Push, APNs and FCM from one queue. FCM uses the HTTP v1 API with short-lived OAuth credentials.

FCM payload privacy:

- allowed: generic title/body, `checkId`, event type, app URL/tag;
- not included: check description, image bytes/URLs, amount, passwords, TANs or other user-entered check content.

Invalid/unregistered FCM tokens are deleted server-side. Other transient failures retain the token and go through the existing push-worker retry logic.

## Persistent Play upload signing

A dedicated ZweiCheck RSA-4096 upload key has been created and must remain the permanent Google Play upload certificate for this package.

Upload certificate SHA-256 fingerprint:

`ED:A6:C1:93:EC:67:47:84:0D:F7:EA:F2:85:B6:B9:1C:E7:7D:CF:D4:A7:6D:7B:39:99:AD:1F:AA:6A:E2:3D:EB`

The manual workflow `.github/workflows/android-release.yml` builds the production-ready signed AAB with the production Firebase Android app configuration and permanent upload-key secrets.

Required GitHub repository secrets:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

The workflow runs tests, builds the minified release, validates version `1.0.1 (2)` and both Play subscription IDs, verifies the AAB signature and emits `ZweiCheck-1.0.1-2-PlayStore.aab` plus checksum.

## Store listing draft (DE)

**Short description**  
Gemeinsam prüfen, bevor du zahlst, klickst oder persönliche Daten weitergibst.

ZweiCheck verbindet dich in unsicheren Situationen mit einer Person, der du vertraust – bevor du zahlst, auf einen Link klickst, etwas installierst oder persönliche Daten weitergibst. Prüfanfragen können Nachrichten, Zahlungen, Links und persönliche Daten betreffen. Deine Vertrauensperson antwortet mit einer klaren menschlichen Handlungsempfehlung. Premium Familie ergänzt bis zu drei Bilder je Prüfung sowie Erinnerungs- und Ausweichpersonen-Funktionen.

ZweiCheck ersetzt keine professionelle Sicherheits-, Rechts- oder Finanzberatung und gibt keine Garantie dafür, dass ein Vorgang sicher oder betrügerisch ist. Teile keine Passwörter, TANs oder vollständigen Kartendaten.

## URLs / declarations

- Website: `https://zweicheck.kamilunavo.com`
- Privacy: `https://zweicheck.kamilunavo.com/privacy`
- Privacy choices: `https://zweicheck.kamilunavo.com/privacy-choices`
- Support: `https://zweicheck.kamilunavo.com/support`
- Ads: No
- Billing/IAP: Yes — two auto-renewing Premium Familie subscriptions
- Account required for protected functions: Yes
- Account deletion: implemented directly in Android and supported by backend.

## Release gates

- [x] API 36 native Android core.
- [x] Encrypted session storage.
- [x] Final Android/server CI green after FCM client changes.
- [x] Stable branded Android launcher icon; AAPT2 release crash resolved.
- [x] Play-compatible Premium Family product IDs and Free/Premium behavior.
- [x] Play Billing 9.1 query/purchase/restore and feature gates.
- [x] Native account export/delete UI.
- [x] Shared text/multiple-image draft parity.
- [x] Server-side FCM HTTP v1 transport/token lifecycle.
- [x] Explicit Android notification opt-in and push check routing.
- [x] Persistent Play upload key and reproducible signed release workflow.
- [x] Firebase Android app configured for `de.kamilunavo.zweicheck`.
- [x] Production Firebase Android app values locked into the build.
- [x] `FIREBASE_SERVICE_ACCOUNT_JSON_B64` configured in production and server redeployed.
- [x] Play Console app created and internal-test upload started.
- [x] Both Premium Familie subscriptions/base plans created and activated.
- [x] Build `1.0.1 (2)` CI green and locally signed with the permanent Play upload key.
- [ ] Upload build `1.0.1 (2)` to the internal-test track and roll it out to testers.
- [ ] Complete Data safety, account deletion and content-rating declarations.
- [ ] Internal test: fresh install/update, login/register, Free image limit, monthly/yearly purchase, restore, Premium gates, create/respond, share, invitation, push, notification routing, export and deletion.
