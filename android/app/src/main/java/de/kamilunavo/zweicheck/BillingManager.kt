package de.kamilunavo.zweicheck

import android.app.Activity
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

class BillingManager(context: Context) : PurchasesUpdatedListener {
    companion object {
        const val MONTHLY_PRODUCT_ID = "de.kamilunavo.zweicheck.premium.family.monthly"
        const val YEARLY_PRODUCT_ID = "de.kamilunavo.zweicheck.premium.family.yearly"
        private val PRODUCT_IDS = setOf(MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID)
    }

    var isPremiumFamily by mutableStateOf(false)
        private set
    var activeProductId by mutableStateOf<String?>(null)
        private set
    var monthlyPrice by mutableStateOf<String?>(null)
        private set
    var yearlyPrice by mutableStateOf<String?>(null)
        private set
    var billingReady by mutableStateOf(false)
        private set
    var loading by mutableStateOf(false)
        private set
    var statusMessage by mutableStateOf<String?>(null)
        private set

    private val details = mutableMapOf<String, ProductDetails>()
    private val billingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .enableAutoServiceReconnection()
        .build()

    init {
        connect()
    }

    fun clearMessage() {
        statusMessage = null
    }

    fun purchaseMonthly(activity: Activity) = launchPurchase(activity, MONTHLY_PRODUCT_ID, "monthly")

    fun purchaseYearly(activity: Activity) = launchPurchase(activity, YEARLY_PRODUCT_ID, "yearly")

    fun restorePurchases() {
        statusMessage = null
        refreshPurchases(showRestoreMessage = true)
    }

    private fun connect() {
        if (billingClient.isReady) {
            billingReady = true
            queryProducts()
            refreshPurchases(showRestoreMessage = false)
            return
        }

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                billingReady = result.responseCode == BillingClient.BillingResponseCode.OK
                if (billingReady) {
                    queryProducts()
                    refreshPurchases(showRestoreMessage = false)
                } else {
                    statusMessage = "Google Play Billing ist gerade nicht verfügbar (${result.responseCode})."
                }
            }

            override fun onBillingServiceDisconnected() {
                billingReady = false
            }
        })
    }

    private fun queryProducts() {
        if (!billingClient.isReady) return
        val products = PRODUCT_IDS.map { productId ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        billingClient.queryProductDetailsAsync(params) { result, queryResult ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                statusMessage = result.debugMessage.ifBlank { "Premium Familie konnte nicht aus Google Play geladen werden." }
                return@queryProductDetailsAsync
            }

            details.clear()
            queryResult.productDetailsList.forEach { details[it.productId] = it }
            monthlyPrice = formattedPrice(details[MONTHLY_PRODUCT_ID], "monthly")
            yearlyPrice = formattedPrice(details[YEARLY_PRODUCT_ID], "yearly")
        }
    }

    private fun formattedPrice(product: ProductDetails?, preferredBasePlanId: String): String? {
        val offer = eligibleOffer(product, preferredBasePlanId) ?: return null
        return offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice
    }

    private fun eligibleOffer(product: ProductDetails?, preferredBasePlanId: String): ProductDetails.SubscriptionOfferDetails? {
        val offers = product?.subscriptionOfferDetails.orEmpty()
        return offers.firstOrNull { it.basePlanId == preferredBasePlanId && it.offerId == null }
            ?: offers.firstOrNull { it.basePlanId == preferredBasePlanId }
            ?: offers.firstOrNull { it.offerId == null }
            ?: offers.firstOrNull()
    }

    private fun launchPurchase(activity: Activity, productId: String, preferredBasePlanId: String) {
        statusMessage = null
        val product = details[productId] ?: run {
            statusMessage = "Dieses Premium-Abo ist in Google Play noch nicht verfügbar."
            queryProducts()
            return
        }
        val offer = eligibleOffer(product, preferredBasePlanId) ?: run {
            statusMessage = "Für dieses Premium-Abo ist keine gültige Kaufoption verfügbar."
            return
        }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product)
            .setOfferToken(offer.offerToken)
            .build()
        loading = true
        val result = billingClient.launchBillingFlow(
            activity,
            BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(productParams))
                .build(),
        )
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            loading = false
            statusMessage = result.debugMessage.ifBlank { "Der Kauf konnte nicht gestartet werden." }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        loading = false
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> processPurchases(purchases.orEmpty(), showRestoreMessage = false)
            BillingClient.BillingResponseCode.USER_CANCELED -> Unit
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> refreshPurchases(showRestoreMessage = false)
            else -> statusMessage = result.debugMessage.ifBlank { "Der Kauf konnte nicht abgeschlossen werden." }
        }
    }

    private fun refreshPurchases(showRestoreMessage: Boolean) {
        if (!billingClient.isReady) {
            connect()
            return
        }
        loading = true
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        billingClient.queryPurchasesAsync(params) { result, purchases ->
            loading = false
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                processPurchases(purchases, showRestoreMessage)
            } else {
                statusMessage = result.debugMessage.ifBlank { "Käufe konnten nicht wiederhergestellt werden." }
            }
        }
    }

    private fun processPurchases(purchases: List<Purchase>, showRestoreMessage: Boolean) {
        val owned = purchases.firstOrNull { purchase ->
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED &&
                purchase.products.any { it in PRODUCT_IDS }
        }

        activeProductId = owned?.products?.firstOrNull { it in PRODUCT_IDS }
        isPremiumFamily = owned != null

        owned?.let { purchase ->
            if (!purchase.isAcknowledged) {
                val params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
                billingClient.acknowledgePurchase(params) { result ->
                    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                        statusMessage = result.debugMessage.ifBlank { "Der Kauf konnte nicht bestätigt werden." }
                    }
                }
            }
        }

        if (showRestoreMessage) {
            statusMessage = if (isPremiumFamily) {
                "Premium Familie wurde wiederhergestellt."
            } else {
                "Es wurde kein aktives Premium-Familienabo gefunden."
            }
        } else if (owned != null) {
            statusMessage = "ZweiCheck Premium Familie ist aktiv."
        }
    }
}
