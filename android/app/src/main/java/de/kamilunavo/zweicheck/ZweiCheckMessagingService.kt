package de.kamilunavo.zweicheck

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ZweiCheckMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        if (!FirebaseRuntime.isConfigured || token.isBlank()) return
        scope.launch {
            runCatching { ApiClient(applicationContext).registerFcmToken(token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val title = data["title"]?.take(140).orEmpty().ifBlank { "ZweiCheck" }
        val body = data["body"]?.take(500).orEmpty().ifBlank { "Es gibt eine neue Benachrichtigung." }
        val checkId = data["checkId"]?.takeIf { it.isNotBlank() }

        ensureNotificationChannel()
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            checkId?.let { putExtra(EXTRA_CHECK_ID, it) }
        }
        val requestCode = checkId?.hashCode() ?: System.currentTimeMillis().toInt()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(requestCode, notification)
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "ZweiCheck Prüfanfragen",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Neue Prüfanfragen, Antworten und wichtige ZweiCheck-Erinnerungen"
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val EXTRA_CHECK_ID = "zweicheck.checkId"
        private const val CHANNEL_ID = "zweicheck_checks"
    }
}
