import Foundation
import Observation
import StoreKit

@Observable
@MainActor
final class PremiumStore {
    static let familyMonthlyProductID = "de.kamilunavo.zweicheck.premium.family.monthly"
    static let familyYearlyProductID = "de.kamilunavo.zweicheck.premium.family.yearly"
    static let familyMonthlyTargetPrice = "4,99 €"
    static let familyYearlyTargetPrice = "39,99 €"

    var monthlyProduct: Product?
    var yearlyProduct: Product?
    var isPremiumFamily = false
    var activeProductID: String?
    var isLoading = false
    var message: String?

    // ZweiCheck ist zum Release nur für Deutschland freigeschaltet. TestFlight/Sandbox kann
    // vorübergehend veraltete Fremdwährungs-Metadaten cachen, obwohl Apples Kaufdialog bereits
    // den korrekten EUR-Preis verwendet. Solche Werte zeigen wir nicht in der Tarifkarte.
    var monthlyPriceText: String {
        euroDisplayPrice(for: monthlyProduct, fallback: Self.familyMonthlyTargetPrice)
    }

    var annualPriceText: String {
        euroDisplayPrice(for: yearlyProduct, fallback: Self.familyYearlyTargetPrice)
    }

    var activePlanLabel: String {
        switch activeProductID {
        case Self.familyMonthlyProductID: "Premium Familie · Monatlich"
        case Self.familyYearlyProductID: "Premium Familie · Jährlich"
        default: isPremiumFamily ? "Premium Familie" : "Kostenlos"
        }
    }

    private var updatesTask: Task<Void, Never>?
    private var didStart = false

    func start() async {
        guard !didStart else {
            await loadProducts()
            await refreshEntitlements()
            return
        }
        didStart = true
        startTransactionListener()
        await loadProducts()
        await refreshEntitlements()
    }

    func purchaseFamilyMonthly() async {
        await purchase(product: monthlyProduct, fallbackMessage: "ZweiCheck Premium Familie kostet 4,99 € pro Monat. Das Monatsabo muss in App Store Connect für den Verkauf freigeschaltet sein.")
    }

    func purchaseFamilyYearly() async {
        await purchase(product: yearlyProduct, fallbackMessage: "ZweiCheck Premium Familie kostet 39,99 € pro Jahr. Das Jahresabo muss in App Store Connect für den Verkauf freigeschaltet sein.")
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
        var activeID: String?
        let validProductIDs: Set<String> = [Self.familyMonthlyProductID, Self.familyYearlyProductID]

        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard validProductIDs.contains(transaction.productID) else { continue }
            guard transaction.revocationDate == nil else { continue }
            activeID = transaction.productID
            break
        }

        activeProductID = activeID
        isPremiumFamily = activeID != nil
    }

    private func euroDisplayPrice(for product: Product?, fallback: String) -> String {
        guard let displayPrice = product?.displayPrice else { return fallback }
        let normalized = displayPrice.uppercased()
        return normalized.contains("€") || normalized.contains("EUR") ? displayPrice : fallback
    }

    private func purchase(product: Product?, fallbackMessage: String) async {
        guard let product else {
            message = fallbackMessage
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

    private func loadProducts() async {
        do {
            let products = try await Product.products(for: [Self.familyMonthlyProductID, Self.familyYearlyProductID])
            monthlyProduct = products.first(where: { $0.id == Self.familyMonthlyProductID })
            yearlyProduct = products.first(where: { $0.id == Self.familyYearlyProductID })
        } catch {
            monthlyProduct = nil
            yearlyProduct = nil
        }
    }

    private func startTransactionListener() {
        updatesTask?.cancel()
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled else { return }
                guard case .verified(let transaction) = result else { continue }
                guard transaction.productID == Self.familyMonthlyProductID || transaction.productID == Self.familyYearlyProductID else { continue }
                await transaction.finish()
                await self?.refreshEntitlements()
            }
        }
    }
}
