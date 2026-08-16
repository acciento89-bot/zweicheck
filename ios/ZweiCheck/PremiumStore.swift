import Foundation
import Observation
import StoreKit

@Observable
@MainActor
final class PremiumStore {
    static let familyMonthlyProductID = "de.kamilunavo.zweicheck.premium.family.monthly"
    static let familyYearlyProductID = "de.kamilunavo.zweicheck.premium.family.yearly"

    var monthlyProduct: Product?
    var yearlyProduct: Product?
    var isPremiumFamily = false
    var activeProductID: String?
    var isLoading = false
    var isLoadingProducts = false
    var productLoadError: String?
    var message: String?

    var productsAreReady: Bool {
        monthlyProduct != nil && yearlyProduct != nil
    }

    // Preise werden ausschließlich aus StoreKit übernommen. So zeigt ZweiCheck immer
    // den Preis und die Währung des aktuellen App-Store-Storefronts an und bietet
    // niemals eine nicht geladene Subscription mit einem hart codierten Preis an.
    var monthlyPriceText: String {
        monthlyProduct?.displayPrice ?? "—"
    }

    var annualPriceText: String {
        yearlyProduct?.displayPrice ?? "—"
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
        if !didStart {
            didStart = true
            startTransactionListener()
        }

        await loadProducts(showMessage: false)
        await refreshEntitlements()
    }

    func reloadProducts() async {
        await loadProducts(showMessage: true)
    }

    func purchaseFamilyMonthly() async {
        if monthlyProduct == nil {
            await loadProducts(showMessage: false)
        }

        guard let product = monthlyProduct else {
            message = productLoadError ?? "Das Monatsabo konnte gerade nicht vom App Store geladen werden. Bitte versuche es erneut."
            return
        }

        await purchase(product: product)
    }

    func purchaseFamilyYearly() async {
        if yearlyProduct == nil {
            await loadProducts(showMessage: false)
        }

        guard let product = yearlyProduct else {
            message = productLoadError ?? "Das Jahresabo konnte gerade nicht vom App Store geladen werden. Bitte versuche es erneut."
            return
        }

        await purchase(product: product)
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

    private func purchase(product: Product) async {
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

    private func loadProducts(showMessage: Bool) async {
        guard !isLoadingProducts else { return }

        isLoadingProducts = true
        defer { isLoadingProducts = false }

        do {
            let requestedIDs = [Self.familyMonthlyProductID, Self.familyYearlyProductID]
            let products = try await Product.products(for: requestedIDs)

            monthlyProduct = products.first(where: { $0.id == Self.familyMonthlyProductID })
            yearlyProduct = products.first(where: { $0.id == Self.familyYearlyProductID })

            if productsAreReady {
                productLoadError = nil
            } else {
                productLoadError = "Die Premium-Abos konnten vom App Store nicht vollständig geladen werden. Bitte versuche es erneut."
                if showMessage {
                    message = productLoadError
                }
            }
        } catch {
            monthlyProduct = nil
            yearlyProduct = nil
            productLoadError = "Die Premium-Abos konnten nicht geladen werden. Bitte prüfe deine Internetverbindung und versuche es erneut."
            if showMessage {
                message = productLoadError
            }
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
