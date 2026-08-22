package de.kamilunavo.zweicheck

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelsTest {
    @Test
    fun recommendationWireValuesMatchIosAndApi() {
        assertEquals("do_not_act", Recommendation.DO_NOT_ACT.wireValue)
        assertEquals("verify_personally", Recommendation.VERIFY_PERSONALLY.wireValue)
        assertEquals("plausible", Recommendation.PLAUSIBLE.wireValue)
        assertEquals("call_me", Recommendation.CALL_ME.wireValue)
    }

    @Test
    fun checkCategoryLabelsMatchProductLanguage() {
        assertEquals("Zahlung", sample("payment").categoryLabel)
        assertEquals("Link oder Webseite", sample("link").categoryLabel)
        assertEquals("Persönliche Daten", sample("data").categoryLabel)
    }

    private fun sample(category: String) = CheckItem(
        id = "1",
        requesterId = "a",
        requesterName = "A",
        reviewerId = "b",
        reviewerName = "B",
        category = category,
        description = "Test",
        amountCents = null,
        urgency = "normal",
        status = "pending",
        recommendation = null,
        responseNote = null,
        respondedAt = null,
        closedAt = null,
        createdAt = "",
        updatedAt = "",
    )
}
