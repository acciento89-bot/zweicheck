package de.kamilunavo.zweicheck

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object FcmRegistration {
    suspend fun enableAndRegister(context: Context): Boolean {
        if (!FirebaseRuntime.isConfigured) return false
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        val token = FirebaseMessaging.getInstance().token.await()
        registerToken(context, token)
        return true
    }

    suspend fun ensureRegistered(context: Context) {
        if (!FirebaseRuntime.isConfigured) return
        val messaging = FirebaseMessaging.getInstance()
        if (!messaging.isAutoInitEnabled) return
        val token = messaging.token.await()
        registerToken(context, token)
    }

    suspend fun registerToken(context: Context, token: String) {
        send(context, "/api/push/fcm/tokens", "POST", token)
    }

    suspend fun unregisterCurrentToken(context: Context) {
        if (!FirebaseRuntime.isConfigured) return
        val messaging = FirebaseMessaging.getInstance()
        if (!messaging.isAutoInitEnabled) return
        val token = runCatching { messaging.token.await() }.getOrNull() ?: return
        runCatching { send(context, "/api/push/fcm/tokens", "DELETE", token) }
        messaging.isAutoInitEnabled = false
    }

    private suspend fun send(context: Context, path: String, method: String, token: String) = withContext(Dispatchers.IO) {
        val session = SessionStore(context.applicationContext).load()
            ?: throw ApiException("Bitte melde dich erneut an, um Push zu aktivieren.", 401)
        val body = JSONObject().put("token", token).toString().toByteArray(Charsets.UTF_8)
        val connection = (URL("${BuildConfig.API_BASE_URL}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 30_000
            readTimeout = 60_000
            useCaches = false
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Cookie", "zc_session=$session")
            setFixedLengthStreamingMode(body.size)
        }
        try {
            connection.outputStream.use { it.write(body) }
            val status = connection.responseCode
            if (status !in 200..299) {
                val text = connection.errorStream?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                throw ApiException(message.ifBlank { "Push konnte nicht eingerichtet werden." }, status)
            }
        } finally {
            connection.disconnect()
        }
    }
}
