package de.kamilunavo.zweicheck

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AccountExportClient(context: Context) {
    private val sessionStore = SessionStore(context.applicationContext)

    suspend fun download(): ByteArray = withContext(Dispatchers.IO) {
        val token = sessionStore.load() ?: throw ApiException("Bitte melde dich erneut an.", 401)
        val connection = (URL("${BuildConfig.API_BASE_URL}/api/account/export").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 30_000
            readTimeout = 60_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cookie", "zc_session=$token")
        }
        try {
            val status = connection.responseCode
            val bytes = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.use { it.readBytes() }
                ?: ByteArray(0)
            if (status !in 200..299) {
                if (status == 401) sessionStore.clear()
                val message = runCatching { JSONObject(bytes.toString(Charsets.UTF_8)).optString("error") }
                    .getOrNull()?.takeIf { it.isNotBlank() }
                    ?: "Der Datenexport konnte nicht erstellt werden."
                throw ApiException(message, status)
            }
            bytes
        } finally {
            connection.disconnect()
        }
    }
}
