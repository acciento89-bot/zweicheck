import Foundation
import StoreKit
@main struct Smoke {
 @MainActor static func main() async {
  let manager=PremiumStore()
  await manager.start()
  await manager.reloadProducts()
  await manager.purchaseFamilyMonthly()
  await manager.purchaseFamilyYearly()
  await manager.restorePurchases()
  await manager.refreshEntitlements()
  for _ in 0..<30 {await Task.yield()}
  let expected=ProcessInfo.processInfo.environment["EXPECT_PROVIDER_CALLS"]=="1"
  if expected {
   for call in ["updates","products","purchase","sync","entitlements"] {precondition(ProviderProbe.calls.contains(call),"ordinary provider behavior lost: \(call)")}
   precondition(manager.productsAreReady,"ordinary products must remain available from fake catalog")
  } else {
   precondition(ProviderProbe.calls.isEmpty,"native QA reached provider: \(ProviderProbe.calls)")
   precondition(!manager.productsAreReady && !manager.isPremiumFamily && manager.activeProductID==nil,"QA must not grant access")
  }
  print(expected ? "ordinary fake-provider route preserved" : "isolated fake-provider route zero calls, no access grant")
 }
}
