plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val generatedIconResDir = layout.buildDirectory.dir("generated/zweicheckIcon/res").get().asFile
val generateZweiCheckIcon by tasks.registering(Copy::class) {
    val sourceIcon = rootProject.file("../ios/ZweiCheck/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")
    from(sourceIcon)
    into(generatedIconResDir.resolve("drawable-nodpi"))
    rename { "zweicheck_app_icon.png" }
    doFirst {
        if (!sourceIcon.isFile) {
            throw GradleException("Canonical ZweiCheck AppIcon-1024.png is missing: ${sourceIcon.path}")
        }
    }
}

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
    }

    sourceSets.getByName("main").res.srcDir(generatedIconResDir)

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

tasks.named("preBuild").configure {
    dependsOn(generateZweiCheckIcon)
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

    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
