import Foundation
@_exported import Combine
public enum ProviderProbe { public static var calls:[String]=[] }
public enum VerificationResult<T> { case verified(T),unverified; public var jwsRepresentation:String { "synthetic-only" } }
public struct Transaction {
 public var id:UInt64=1
 public var revocationDate:Date?=nil
 public var expirationDate:Date?=nil
 public var appAccountToken:UUID?=nil
 public static var currentEntitlements:AsyncStream<VerificationResult<Transaction>> { ProviderProbe.calls.append("entitlements"); return AsyncStream {$0.finish()} }
 public var productID:String="de.kamilunavo.zweicheck.premium.family.monthly"
 public static var updates:AsyncStream<VerificationResult<Transaction>> { ProviderProbe.calls.append("updates"); return AsyncStream {$0.finish()} }
 public static var unfinished:AsyncStream<VerificationResult<Transaction>> { ProviderProbe.calls.append("unfinished"); return AsyncStream {$0.finish()} }
 public func finish() async {ProviderProbe.calls.append("finish")}
}
public struct Product {
 public init(_ value:String="de.kamilunavo.zweicheck.premium.family.monthly") {id=value}
 public var id:String
 public var displayPrice:String {"synthetic only"}
 public enum PurchaseOption:Hashable {case appAccountToken(UUID)}
 public enum PurchaseResult {case success(VerificationResult<Transaction>),pending,userCancelled}
 public static func products<S:Sequence>(for ids:S) async throws -> [Product] where S.Element==String {ProviderProbe.calls.append("products"); return ids.map {Product($0)}}
 public func purchase(options: Set<PurchaseOption> = []) async throws -> PurchaseResult {ProviderProbe.calls.append("purchase"); return .userCancelled}
}
public enum AppStore {public static func sync() async throws {ProviderProbe.calls.append("sync")}}
