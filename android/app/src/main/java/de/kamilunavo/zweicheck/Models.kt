package de.kamilunavo.zweicheck

data class User(
    val id: String,
    val email: String,
    val name: String,
    val emailVerified: Boolean,
    val createdAt: String,
)

data class Presence(
    val status: String,
    val expiresAt: String?,
    val updatedAt: String?,
) {
    val label: String
        get() = when (status) {
            "available" -> "Ja, ich kann helfen"
            "urgent_only" -> "Nur wenn es dringend ist"
            "unavailable" -> "Gerade nicht"
            else -> "Keine Angabe"
        }
}

data class Person(val id: String, val name: String, val email: String)

data class TrustConnection(
    val connectionId: String,
    val person: Person,
    val presence: Presence,
)

data class TrustRouting(
    val selfPresence: Presence,
    val connections: List<TrustConnection>,
)

data class Attachment(
    val id: String,
    val originalName: String,
    val mimeType: String,
    val sizeBytes: Int,
    val url: String,
)

data class CheckItem(
    val id: String,
    val requesterId: String,
    val requesterName: String,
    val reviewerId: String,
    val reviewerName: String,
    val category: String,
    val description: String,
    val amountCents: Int?,
    val urgency: String,
    val status: String,
    val recommendation: String?,
    val responseNote: String?,
    val respondedAt: String?,
    val closedAt: String?,
    val createdAt: String,
    val updatedAt: String,
    val attachments: List<Attachment> = emptyList(),
) {
    val categoryLabel: String
        get() = when (category) {
            "message" -> "Nachricht"
            "payment" -> "Zahlung"
            "link" -> "Link oder Webseite"
            "data" -> "Persönliche Daten"
            else -> "Prüfanfrage"
        }
}

enum class Recommendation(val wireValue: String, val label: String) {
    DO_NOT_ACT("do_not_act", "Nicht handeln"),
    VERIFY_PERSONALLY("verify_personally", "Erst persönlich klären"),
    PLAUSIBLE("plausible", "Wirkt nachvollziehbar"),
    CALL_ME("call_me", "Ruf mich jetzt an"),
}

data class ActivityItem(
    val id: String,
    val eventType: String,
    val icon: String,
    val title: String,
    val body: String,
    val actorName: String?,
    val checkId: String?,
    val invitationId: String?,
    val connectionId: String?,
    val readAt: String?,
    val createdAt: String,
) {
    val isUnread: Boolean get() = readAt == null
}

data class Activities(
    val activities: List<ActivityItem>,
    val unreadCount: Int,
    val nextBefore: String?,
)

data class UploadImage(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String = "image/jpeg",
)

class ApiException(message: String, val statusCode: Int? = null) : Exception(message)
