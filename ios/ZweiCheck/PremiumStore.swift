import Foundation
import Observation
import StoreKit

@Observable
@MainActor
final class PremiumStore {
    static let familyYearlyProductID = "de.kamilunavo.zweicheck.premium.family.yearly"

    var product: Product?
    var isPremiumFamily = false
    var isLoading = false
    var message: String?

    private var updatesTask: Task<Void, Never>?
    private var didStart = false

    func start() async {
        guard !didStart else {
            await refreshEntitlements()
            return
        }
        didStart = true
        startTransactionListener()
        await loadProduct()
        await refreshEntitlements()
    }

    func purchaseFamilyYearly() async {
        guard let product else {
            message = "Das Premium-Familienabo wird im App Store gerade vorbereitet."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    message = "Der Kauf konnte nicht sicher bestätigt werden."
                    return
                }
                await transaction.finish()
                await refreshEntitlements()
                message = isPremiumFamily ? "ZweiCheck Premium Familie ist jetzt aktiv." : "Der Kauf wird noch verarbeitet."
            case .pending:
                message = "Der Kauf wartet noch auf Freigabe."
            case .userCancelled:
                break
            @unknown default:
                message = "Der Kauf konnte nicht abgeschlossen werden."
            }
        } catch {
            message = error.localizedDescription
        }
    }

    func restorePurchases() async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await AppStore.sync()
            await refreshEntitlements()
            message = isPremiumFamily ? "Dein Premium-Familienabo wurde wiederhergestellt." : "Es wurde kein aktives Premium-Familienabo gefunden."
        } catch {
            message = error.localizedDescription
        }
    }

    func refreshEntitlements() async {
        var active = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.productID == Self.familyYearlyProductID else { continue }
            if transaction.revocationDate == nil {
                active = true
            }
        }
        isPremiumFamily = active
    }

    private func loadProduct() async {
        do {
            product = try await Product.products(for: [Self.familyYearlyProductID]).first
        } catch {
            product = nil
        }
    }

    private func startTransactionListener() {
        updatesTask?.cancel()
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled else { return }
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self?.refreshEntitlements()
            }
        }
    }
}
