package de.kamilunavo.zweicheck

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class ZweiCheckApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (!FirebaseRuntime.isConfigured) return
        if (FirebaseApp.getApps(this).isNotEmpty()) return
        val options = FirebaseOptions.Builder()
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
            .setApiKey(BuildConfig.FIREBASE_API_KEY)
            .build()
        FirebaseApp.initializeApp(this, options)
    }
}

object FirebaseRuntime {
    val isConfigured: Boolean
        get() = BuildConfig.FIREBASE_PROJECT_ID.isNotBlank()
            && BuildConfig.FIREBASE_APP_ID.isNotBlank()
            && BuildConfig.FIREBASE_API_KEY.isNotBlank()
}
