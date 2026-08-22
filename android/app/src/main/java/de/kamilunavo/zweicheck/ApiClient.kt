package de.kamilunavo.zweicheck

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class ApiClient(context: Context) {
    private val sessionStore = SessionStore(context.applicationContext)
    private val cookieName = "zc_session"

    suspend fun me(): User = parseUser(request("/api/auth/me").getJSONObject("user"))

    suspend fun login(email: String, password: String): User = parseUser(
        request(
            "/api/auth/login",
            method = "POST",
            json = JSONObject().put("email", email).put("password", password),
        ).getJSONObject("user")
    )

    suspend fun register(name: String, email: String, password: String): User = parseUser(
        request(
            "/api/auth/register",
            method = "POST",
            json = JSONObject().put("name", name).put("email", email).put("password", password),
        ).getJSONObject("user")
    )

    suspend fun logout() {
        runCatching { request("/api/auth/logout", method = "POST") }
        sessionStore.clear()
    }

    suspend fun requestPasswordReset(email: String) {
        request("/api/auth/request-password-reset", "POST", JSONObject().put("email", email))
    }

    suspend fun checks(): List<CheckItem> {
        val array = request("/api/checks").getJSONArray("checks")
        return List(array.length()) { parseCheck(array.getJSONObject(it)) }
    }

    suspend fun check(id: String): CheckItem = parseCheck(request("/api/checks/$id").getJSONObject("check"))

    suspend fun trustRouting(): TrustRouting {
        val root = request("/api/trust-routing")
        val self = parsePresence(root.getJSONObject("self"))
        val array = root.getJSONArray("connections")
        return TrustRouting(self, List(array.length()) { parseConnection(array.getJSONObject(it)) })
    }

    suspend fun updatePresence(status: String, durationMinutes: Int?) {
        val body = JSONObject().put("status", status)
        durationMinutes?.let { body.put("durationMinutes", it) }
        request("/api/trust-routing/presence", "PUT", body)
    }

    suspend fun invite(email: String?): String {
        val body = JSONObject()
        email?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("email", it) }
        return request("/api/invitations", "POST", body).getString("code")
    }

    suspend fun acceptInvitation(code: String) {
        request("/api/invitations/accept", "POST", JSONObject().put("code", code.trim()))
    }

    suspend fun removeConnection(id: String) {
        request("/api/connections/$id", "DELETE")
    }

    suspend fun activities(filter: String = "all"): Activities {
        val root = request("/api/activities?limit=50&filter=${filter.encodeQueryValue()}")
        val array = root.getJSONArray("activities")
        return Activities(
            activities = List(array.length()) { parseActivity(array.getJSONObject(it)) },
            unreadCount = root.optInt("unreadCount", 0),
            nextBefore = root.nullableString("nextBefore"),
        )
    }

    suspend fun markActivityRead(id: String) {
        request("/api/activities/$id/read", "PATCH")
    }

    suspend fun markAllActivitiesRead() {
        request("/api/activities/read-all", "POST")
    }

    suspend fun respond(checkId: String, recommendation: Recommendation, note: String): CheckItem {
        val root = request(
            "/api/checks/$checkId/respond",
            "POST",
            JSONObject().put("recommendation", recommendation.wireValue).put("note", note),
        )
        return parseCheck(root.getJSONObject("check"))
    }

    suspend fun close(checkId: String) {
        request("/api/checks/$checkId/close", "POST")
    }

    suspend fun createCheck(
        reviewerId: String,
        fallbackReviewerId: String?,
        category: String,
        description: String,
        amount: String?,
        urgency: String,
        reminderMinutes: Int?,
        autoReroute: Boolean,
        images: List<UploadImage>,
    ): CheckItem {
        val fields = linkedMapOf(
            "reviewerId" to reviewerId,
            "category" to category,
            "description" to description,
            "urgency" to urgency,
        )
        amount?.trim()?.takeIf { it.isNotEmpty() }?.let { fields["amount"] = it }
        fallbackReviewerId?.takeIf { it.isNotBlank() }?.let { fields["fallbackReviewerId"] = it }
        reminderMinutes?.takeIf { it > 0 }?.let {
            fields["escalationReminderMinutes"] = it.toString()
            fields["escalationAutoReroute"] = autoReroute.toString()
        }

        val boundary = "ZweiCheck-${UUID.randomUUID()}"
        val out = ByteArrayOutputStream()
        fun write(value: String) = out.write(value.toByteArray(Charsets.UTF_8))
        for ((name, value) in fields) {
            write("--$boundary\r\n")
            write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
            write("$value\r\n")
        }
        images.take(3).forEach { image ->
            write("--$boundary\r\n")
            write("Content-Disposition: form-data; name=\"images\"; filename=\"${image.fileName.safeFileName()}\"\r\n")
            write("Content-Type: ${image.mimeType}\r\n\r\n")
            out.write(image.bytes)
            write("\r\n")
        }
        write("--$boundary--\r\n")

        val root = execute(
            path = "/api/checks",
            method = "POST",
            contentType = "multipart/form-data; boundary=$boundary",
            body = out.toByteArray(),
        )
        return parseCheck(root.getJSONObject("check"))
    }

    suspend fun deleteAccount(password: String) {
        request("/api/account", "DELETE", JSONObject().put("password", password))
        sessionStore.clear()
    }

    private suspend fun request(path: String, method: String = "GET", json: JSONObject? = null): JSONObject =
        execute(
            path = path,
            method = method,
            contentType = if (json != null) "application/json" else null,
            body = json?.toString()?.toByteArray(Charsets.UTF_8),
        )

    private suspend fun execute(
        path: String,
        method: String,
        contentType: String?,
        body: ByteArray?,
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = (URL("${BuildConfig.API_BASE_URL}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 30_000
            readTimeout = 60_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            sessionStore.load()?.takeIf { it.isNotEmpty() }?.let {
                setRequestProperty("Cookie", "$cookieName=$it")
            }
            if (contentType != null) setRequestProperty("Content-Type", contentType)
            if (body != null) {
                doOutput = true
                setFixedLengthStreamingMode(body.size)
            }
        }

        try {
            if (body != null) connection.outputStream.use { it.write(body) }
            val status = connection.responseCode
            captureSessionCookie(connection)
            val bytes = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.use { it.readBytes() }
                ?: ByteArray(0)
            val text = bytes.toString(Charsets.UTF_8)
            if (status !in 200..299) {
                if (status == 401) sessionStore.clear()
                val message = runCatching { JSONObject(text).optString("error") }
                    .getOrNull()?.takeIf { it.isNotBlank() }
                    ?: "ZweiCheck konnte die Anfrage nicht abschließen."
                throw ApiException(message, status)
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun captureSessionCookie(connection: HttpURLConnection) {
        val cookieHeaders = connection.headerFields.entries
            .filter { it.key?.equals("Set-Cookie", ignoreCase = true) == true }
            .flatMap { it.value.orEmpty() }
        val regex = Regex("(?:^|[;,]\\s*)${Regex.escape(cookieName)}=([^;]+)")
        cookieHeaders.firstNotNullOfOrNull { regex.find(it)?.groupValues?.getOrNull(1) }
            ?.takeIf { it.isNotBlank() }
            ?.let(sessionStore::save)
    }

    private fun parseUser(json: JSONObject) = User(
        id = json.getString("id"),
        email = json.getString("email"),
        name = json.getString("name"),
        emailVerified = json.optBoolean("emailVerified", false),
        createdAt = json.optString("createdAt"),
    )

    private fun parsePresence(json: JSONObject) = Presence(
        status = json.optString("status"),
        expiresAt = json.nullableString("expiresAt"),
        updatedAt = json.nullableString("updatedAt"),
    )

    private fun parseConnection(json: JSONObject): TrustConnection {
        val person = json.getJSONObject("person")
        return TrustConnection(
            connectionId = json.getString("connectionId"),
            person = Person(person.getString("id"), person.getString("name"), person.getString("email")),
            presence = parsePresence(json.getJSONObject("presence")),
        )
    }

    private fun parseAttachment(json: JSONObject) = Attachment(
        id = json.getString("id"),
        originalName = json.optString("originalName"),
        mimeType = json.optString("mimeType"),
        sizeBytes = json.optInt("sizeBytes", 0),
        url = json.optString("url"),
    )

    private fun parseCheck(json: JSONObject): CheckItem {
        val attachments = json.optJSONArray("attachments") ?: JSONArray()
        return CheckItem(
            id = json.getString("id"),
            requesterId = json.optString("requesterId"),
            requesterName = json.optString("requesterName"),
            reviewerId = json.optString("reviewerId"),
            reviewerName = json.optString("reviewerName"),
            category = json.optString("category"),
            description = json.optString("description"),
            amountCents = if (json.isNull("amountCents") || !json.has("amountCents")) null else json.optInt("amountCents"),
            urgency = json.optString("urgency"),
            status = json.optString("status"),
            recommendation = json.nullableString("recommendation"),
            responseNote = json.nullableString("responseNote"),
            respondedAt = json.nullableString("respondedAt"),
            closedAt = json.nullableString("closedAt"),
            createdAt = json.optString("createdAt"),
            updatedAt = json.optString("updatedAt"),
            attachments = List(attachments.length()) { parseAttachment(attachments.getJSONObject(it)) },
        )
    }

    private fun parseActivity(json: JSONObject) = ActivityItem(
        id = json.getString("id"),
        eventType = json.optString("eventType"),
        icon = json.optString("icon"),
        title = json.optString("title"),
        body = json.optString("body"),
        actorName = json.nullableString("actorName"),
        checkId = json.nullableString("checkId"),
        invitationId = json.nullableString("invitationId"),
        connectionId = json.nullableString("connectionId"),
        readAt = json.nullableString("readAt"),
        createdAt = json.optString("createdAt"),
    )

    private fun JSONObject.nullableString(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    private fun String.encodeQueryValue(): String = java.net.URLEncoder.encode(this, Charsets.UTF_8.name())
    private fun String.safeFileName(): String = replace(Regex("[^A-Za-z0-9._-]"), "_").take(100)
}
