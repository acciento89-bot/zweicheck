# Local Verification Notebook Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans inline; root exclusively runs tests/builds/UI/devices; no child agents.
**Goal:** Add native requester-owned device-local question/reply/decision records with factual export.
**Architecture:** Pure matching Swift/Kotlin value models and account-scoped archive, then independent native store/editor plus narrow existing request entry/account-deletion cleanup. Existing backend/web/auth/push/shareextension/billing unchanged.
**Tech Stack:** Foundation/SwiftUI, Kotlin/Compose/org.json, existing iOS17/Androidmin26.
**Spec:** ../specs/2026-10-21-local-verification-design.md

## Global constraints
Only owned ZweiCheck checkout. Base2b0a7cc08993839bb063cabc03b82fb63a1ec64d; identifierde.kamilunavo.zweicheck. No version/sign/store/push/transactions/message sending or customer network writes. Root observesRED thenGREEN; code handoff distinct native/Duo/store acceptance. Counts:25questions,20decisions,20replies,100records,10MiBarchive.

## Review focus
- Late authorization reads after account switch must not open another user's record.
- Local questions/decisions must never look like remotely sent messages or another person's typed replies.
- Changed questions/source leave prior decision historical, never silently apply old conclusion.
- Corrupt/future/wrong-owner/trailing/oversize and disk failures preserve existing bytes and draft.
- Native short/wide/large text and keyboard must keep save/cancel/share controls reachable without full-screen assumptions.

### Task1: Swift pure domain/archive
Create ios/ZweiCheck/LocalVerification.swift and ios/Tests/LocalVerificationTests.swift. Interfaces LocalRequestContext; VerificationQuestion(id,title,note,status); LocalVerificationRecord(ownerID:context:), replacingQuestion(_:), removingQuestion(id:), capturing(context:), deciding(choice:reason:confirmed:at:), currentDecision, report(german:). VerificationArchive(url:ownerID:).load()->[LocalVerificationRecord], save(_:).
- [ ] Write exact invariants/golden/byte-preservation failing tests; root swiftc twofiles RED.
- [ ] Implement afterRED, rootGREEN.

### Task2: Kotlin exact parity
Create android/.../LocalVerification.kt and test/.../LocalVerificationTest.kt, same behavior. Add test-only org.json JVM implementation dependency. Root targetedGradleRED before production, thenGREEN+assembleDebug. MinSDK26 supports java.nio atomic move; no platform-only dependency in model tests.

### Task3: Native editors and narrow adapters
Create Swift LocalVerificationView.swift/store and Compose LocalVerificationScreen.kt; map existing CheckItem fields into pure context without inventing replies. Add requester-only fresh-authorized request entry in ChecksView/MainActivity; account-change guard and existing successful account-delete local cleanup only. Keep original API client/push/subscription/shareextension untouched. Store publishes only durable success; dirty drafts survive save errors; deletion requires confirmation. New DEEN interface/export, scrolling/system-safe layouts and no hinge assumptions.
- [ ] Root source/node regressions and native build exactcommands requested after source frozen.
- [ ] Root actual native authorized read, questions/decision/reply/dated export and coldrelaunch/account isolation acceptance separate.

### Task4: Handoff
Independent source review root-dispatched; observedRED→GREEN for confirmed issues. Protected-source hash proof, per-app ledger/metadata/nativeQA/finalhandoff under ZweiCheckUpdate; local commit only after verified evidence, no push.
