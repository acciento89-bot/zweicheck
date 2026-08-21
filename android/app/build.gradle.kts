plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun quotedBuildConfig(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val firebaseProjectId = providers.gradleProperty("ZWEICHECK_FIREBASE_PROJECT_ID")
    .orElse(providers.environmentVariable("ZWEICHECK_FIREBASE_PROJECT_ID"))
    .getOrElse("")
val firebaseApplicationId = providers.gradleProperty("ZWEICHECK_FIREBASE_APP_ID")
    .orElse(providers.environmentVariable("ZWEICHECK_FIREBASE_APP_ID"))
    .getOrElse("")
val firebaseApiKey = providers.gradleProperty("ZWEICHECK_FIREBASE_API_KEY")
    .orElse(providers.environmentVariable("ZWEICHECK_FIREBASE_API_KEY"))
    .getOrElse("")

android {
    namespace = "de.kamilunavo.zweicheck"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.kamilunavo.zweicheck"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"https://zweicheck.kamilunavo.com\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", quotedBuildConfig(firebaseProjectId))
        buildConfigField("String", "FIREBASE_APP_ID", quotedBuildConfig(firebaseApplicationId))
        buildConfigField("String", "FIREBASE_API_KEY", quotedBuildConfig(firebaseApiKey))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")

    implementation(platform("androidx.compose:compose-bom:2026.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.android.billingclient:billing-ktx:9.1.0")
    implementation(platform("com.google.firebase:firebase-bom:34.17.0"))
    implementation("com.google.firebase:firebase-messaging")

    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
