package de.kamilunavo.zweicheck

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ZweiCheckApp(this) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        recreate()
    }
}

private enum class Tab { HOME, CHECKS, TRUST, ACCOUNT }
private data class ShareDraft(val text: String = "", val images: List<UploadImage> = emptyList())

private val Navy = Color(0xFF061A2F)
private val NavySoft = Color(0xFF0B2945)
private val Teal = Color(0xFF0AA6A6)
private val TealBright = Color(0xFF13C1BA)
private val Orange = Color(0xFFDB6C20)
private val AppBackground = Color(0xFFF3F5F7)
private val ZweiCheckColors = lightColorScheme(
    primary = Teal, onPrimary = Color.White,
    secondary = NavySoft, onSecondary = Color.White,
    background = AppBackground, onBackground = Navy,
    surface = Color.White, onSurface = Navy,
    surfaceVariant = Color(0xFFE8EEF2), onSurfaceVariant = Color(0xFF50606D),
    outline = Color(0xFFC6D0D8), error = Color(0xFFC33D42),
)

@Composable
private fun ZweiCheckApp(activity: MainActivity) {
    val api = remember { ApiClient(activity.applicationContext) }
    val billing = remember { BillingManager(activity.applicationContext) }
    val scope = rememberCoroutineScope()
    val initialCheckId = remember { extractCheckId(activity.intent) }
    var user by remember { mutableStateOf<User?>(null) }
    var checks by remember { mutableStateOf<List<CheckItem>>(emptyList()) }
    var trust by remember { mutableStateOf<TrustRouting?>(null) }
    var tab by remember { mutableStateOf(if (initialCheckId != null) Tab.CHECKS else Tab.HOME) }
    var highlightedCheckId by remember { mutableStateOf(initialCheckId) }
    var creating by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var sharedDraft by remember { mutableStateOf(extractSharedDraft(activity)) }
    val preferences = remember { activity.getSharedPreferences("zweicheck_ui", 0) }
    var onboardingComplete by remember { mutableStateOf(preferences.getBoolean("onboarding_complete", false)) }

    fun registerPush() {
        scope.launch {
            runCatching { FcmRegistration.enableAndRegister(activity.applicationContext) }
                .onSuccess { enabled -> message = if (enabled) "Push-Benachrichtigungen sind eingerichtet." else "Firebase ist für diesen Build noch nicht konfiguriert." }
                .onFailure { message = it.message }
        }
    }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) registerPush() else message = "Push-Benachrichtigungen wurden nicht freigegeben."
    }

    fun requestPushOptIn() {
        if (!FirebaseRuntime.isConfigured) {
            message = "Firebase ist für diesen Build noch nicht konfiguriert."
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            registerPush()
        }
    }

    suspend fun refresh() {
        checks = api.checks()
        trust = api.trustRouting()
    }

    suspend fun refreshPushIfEnabled(currentUser: User?) {
        if (currentUser?.emailVerified != true) return
        runCatching { FcmRegistration.ensureRegistered(activity.applicationContext) }
    }

    LaunchedEffect(Unit) {
        loading = true
        try {
            user = api.me()
            refresh()
            refreshPushIfEnabled(user)
        } catch (cause: ApiException) {
            if (cause.statusCode != 401) message = cause.message
        } catch (cause: Exception) {
            message = cause.message
        } finally {
            loading = false
        }
    }

    BackHandler(enabled = user != null) {
        when {
            creating -> creating = false
            tab != Tab.HOME -> { tab = Tab.HOME; highlightedCheckId = null }
            else -> activity.moveTaskToBack(true)
        }
    }

    MaterialTheme(colorScheme = ZweiCheckColors, shapes = MaterialTheme.shapes.copy(
        small = RoundedCornerShape(12.dp),
        medium = RoundedCornerShape(18.dp),
        large = RoundedCornerShape(26.dp),
    )) {
        when {
            !onboardingComplete -> OnboardingScreen {
                preferences.edit().putBoolean("onboarding_complete", true).apply()
                onboardingComplete = true
            }
            loading -> Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator() }

            user == null -> AuthScreen(
                message = message,
                onLogin = { email, password ->
                    scope.launch {
                        loading = true
                        message = null
                        try {
                            user = api.login(email, password)
                            refresh()
                            refreshPushIfEnabled(user)
                        } catch (cause: Exception) {
                            message = cause.message
                        } finally { loading = false }
                    }
                },
                onRegister = { name, email, password ->
                    scope.launch {
                        loading = true
                        message = null
                        try {
                            user = api.register(name, email, password)
                            refresh()
                        } catch (cause: Exception) {
                            message = cause.message
                        } finally { loading = false }
                    }
                },
                onReset = { email ->
                    scope.launch {
                        runCatching { api.requestPasswordReset(email) }
                            .onSuccess { message = "Wenn die Adresse registriert ist, wurde eine Reset-Mail versendet." }
                            .onFailure { message = it.message }
                    }
                },
            )

            creating -> NewCheckScreen(
                activity = activity,
                trust = trust,
                isPremiumFamily = billing.isPremiumFamily,
                initialDraft = sharedDraft,
                onCancel = { creating = false },
                onOpenPremium = { creating = false; tab = Tab.ACCOUNT },
                onCreate = { reviewerId, fallbackReviewerId, category, description, amount, urgency, reminderMinutes, autoReroute, images ->
                    scope.launch {
                        loading = true
                        message = null
                        try {
                            api.createCheck(
                                reviewerId = reviewerId,
                                fallbackReviewerId = fallbackReviewerId,
                                category = category,
                                description = description,
                                amount = amount,
                                urgency = urgency,
                                reminderMinutes = reminderMinutes,
                                autoReroute = autoReroute,
                                images = images,
                            )
                            sharedDraft = null
                            refresh()
                            tab = Tab.CHECKS
                            creating = false
                        } catch (cause: Exception) {
                            message = cause.message
                        } finally { loading = false }
                    }
                },
            )

            else -> Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                bottomBar = {
                    NavigationBar(containerColor = Color.White, tonalElevation = 10.dp) {
                        AppNavItem(tab == Tab.HOME, { tab = Tab.HOME }, Icons.Default.Home, "Start")
                        AppNavItem(tab == Tab.CHECKS, { tab = Tab.CHECKS }, Icons.Default.VerifiedUser, "Prüfungen")
                        AppNavItem(tab == Tab.TRUST, { tab = Tab.TRUST }, Icons.Default.Groups, "Personen")
                        AppNavItem(tab == Tab.ACCOUNT, { tab = Tab.ACCOUNT }, Icons.Default.AccountCircle, "Konto")
                    }
                },
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp)) {
                    message?.let { Text(it, modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.error) }
                    billing.statusMessage?.let { status ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                Text(status)
                                TextButton(onClick = billing::clearMessage) { Text("OK") }
                            }
                        }
                    }
                    when (tab) {
                        Tab.HOME -> HomeScreen(user!!, checks, trust, billing.isPremiumFamily, onNewCheck = { creating = true }, onPremium = { tab = Tab.ACCOUNT })
                        Tab.CHECKS -> ChecksScreen(
                            checks = checks,
                            currentUserId = user!!.id,
                            highlightedCheckId = highlightedCheckId,
                            onRespond = { check, recommendation ->
                                scope.launch {
                                    runCatching { api.respond(check.id, recommendation, "") }
                                        .onSuccess { refresh(); highlightedCheckId = check.id }
                                        .onFailure { message = it.message }
                                }
                            },
                        )
                        Tab.TRUST -> TrustScreen(
                            trust = trust,
                            onPresence = { status ->
                                scope.launch {
                                    runCatching { api.updatePresence(status, null); trust = api.trustRouting() }
                                        .onFailure { message = it.message }
                                }
                            },
                            onInvite = { email ->
                                scope.launch {
                                    runCatching { api.invite(email) }
                                        .onSuccess { code -> message = "Einladung erstellt. Code: $code" }
                                        .onFailure { message = it.message }
                                }
                            },
                            onAccept = { code ->
                                scope.launch {
                                    runCatching { api.acceptInvitation(code); trust = api.trustRouting() }
                                        .onFailure { message = it.message }
                                }
                            },
                        )
                        Tab.ACCOUNT -> AccountScreen(
                            activity = activity,
                            user = user!!,
                            api = api,
                            billing = billing,
                            onEnablePush = ::requestPushOptIn,
                            onSignedOut = {
                                user = null
                                checks = emptyList()
                                trust = null
                            },
                            onMessage = { message = it },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AppNavItem(selected: Boolean, onClick: () -> Unit, icon: ImageVector, label: String) {
    NavigationBarItem(
        selected = selected,
        onClick = onClick,
        icon = { Icon(icon, contentDescription = label) },
        label = { Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) },
    )
}

private data class IntroPage(val icon: ImageVector, val title: String, val text: String, val color: Color)

@Composable
private fun OnboardingScreen(onComplete: () -> Unit) {
    val pages = remember {
        listOf(
            IntroPage(Icons.Default.VerifiedUser, "Erst prüfen. Dann handeln.", "ZweiCheck gibt dir einen einfachen zweiten Blick, wenn eine Nachricht, Zahlung, Webseite oder Anfrage komisch wirkt.", Teal),
            IntroPage(Icons.Default.Groups, "1. Vertrauensperson verbinden", "Verbinde jemanden, den du wirklich kennst. Diese Person bekommt deine Prüfanfrage direkt in ZweiCheck.", Navy),
            IntroPage(Icons.Default.AddPhotoAlternate, "2. Verdächtiges teilen", "Beschreibe kurz, worum es geht. Bilder und Inhalte kannst du direkt aus anderen Apps an ZweiCheck übergeben.", Orange),
            IntroPage(Icons.Default.Notifications, "3. Antwort bekommen", "Sobald deine Vertrauensperson antwortet, informiert dich ZweiCheck und öffnet die passende Prüfung.", Color(0xFF23866B)),
        )
    }
    var page by remember { mutableStateOf(0) }
    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        if (page < pages.size) {
            val item = pages[page]
            Column(Modifier.fillMaxSize().statusBarsPadding().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { page = pages.size }) { Text("Überspringen", color = Navy, fontWeight = FontWeight.SemiBold) }
                }
                Spacer(Modifier.weight(1f))
                Surface(color = item.color, shape = RoundedCornerShape(34.dp), shadowElevation = 14.dp) {
                    Icon(item.icon, null, tint = Color.White, modifier = Modifier.padding(30.dp).size(72.dp))
                }
                Text(item.title, fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold, color = Navy, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 28.dp))
                Text(item.text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, lineHeight = 25.sp, modifier = Modifier.padding(top = 14.dp, start = 8.dp, end = 8.dp))
                Spacer(Modifier.weight(1f))
                PageDots(pages.size + 1, page)
                PrimaryAction("Weiter", onClick = { page++ }, modifier = Modifier.padding(top = 22.dp))
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = androidx.compose.foundation.layout.PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { Text("Du entscheidest", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Navy) }
                item { Text("Die Grundfunktion bleibt kostenlos. Premium Familie ist optional und kann später im Konto aktiviert werden.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                item { PlanCard("Kostenlos", "Alles für den einfachen zweiten Blick", Icons.Default.Shield, Navy, listOf("Prüfanfragen senden und beantworten", "1 Bild pro Prüfung", "Push-Benachrichtigungen", "Vertrauenspersonen und Aktivitäten")) }
                item { PlanCard("Premium Familie", "Optional – später aktivierbar", Icons.Default.Groups, TealBright, listOf("Bis zu 3 Bilder pro Prüfung", "Automatische Erinnerungen", "Zweite Vertrauensperson fragen", "Google-Play-Familienbibliothek")) }
                item { PrimaryAction("Kostenlos starten", onComplete) }
            }
        }
    }
}

@Composable
private fun PageDots(total: Int, selected: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(total) { index ->
            Surface(color = if (index == selected) TealBright else Color(0xFFC6D0D8), shape = RoundedCornerShape(8.dp), modifier = Modifier.width(if (index == selected) 24.dp else 8.dp).height(8.dp)) {}
        }
    }
}

@Composable
private fun PlanCard(title: String, subtitle: String, icon: ImageVector, accent: Color, features: List<String>) {
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(color = accent, shape = RoundedCornerShape(13.dp)) { Icon(icon, null, tint = Color.White, modifier = Modifier.padding(11.dp).size(26.dp)) }
            Column(Modifier.padding(start = 12.dp)) { Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        features.forEach { Text("✓  $it", fontWeight = FontWeight.SemiBold, color = Navy, modifier = Modifier.padding(top = 9.dp)) }
    }
}

@Composable
private fun AppCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Column(Modifier.padding(18.dp), content = content)
    }
}

@Composable
private fun PrimaryAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.fillMaxWidth().height(58.dp), shape = RoundedCornerShape(16.dp)) {
        Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AuthScreen(
    message: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
    onReset: (String) -> Unit,
) {
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(0.6f))
        Surface(color = Teal, shape = RoundedCornerShape(24.dp), shadowElevation = 10.dp) { Icon(Icons.Default.VerifiedUser, null, tint = Color.White, modifier = Modifier.padding(20.dp).size(52.dp)) }
        Text("ZweiCheck", style = MaterialTheme.typography.displaySmall, color = Navy, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
        Text("Gemeinsam prüfen. Sicher handeln.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth().padding(top = 28.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { register = false }, modifier = Modifier.weight(1f)) { Text("Anmelden", fontWeight = if (!register) FontWeight.Bold else FontWeight.Normal) }
            OutlinedButton(onClick = { register = true }, modifier = Modifier.weight(1f)) { Text("Konto erstellen", fontWeight = if (register) FontWeight.Bold else FontWeight.Normal) }
        }
        if (register) OutlinedTextField(name, { name = it }, label = { Text("Dein Name") }, modifier = Modifier.fillMaxWidth().padding(top = 14.dp), singleLine = true)
        OutlinedTextField(email, { email = it }, label = { Text("E-Mail-Adresse") }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true)
        OutlinedTextField(password, { password = it }, label = { Text("Passwort") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true)
        if (register) Text("Mindestens 10 Zeichen, Buchstaben und mindestens eine Zahl.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
        message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp)) }
        PrimaryAction(
            label = if (register) "Konto erstellen" else "Anmelden",
            onClick = { if (register) onRegister(name, email, password) else onLogin(email, password) },
            modifier = Modifier.padding(top = 16.dp),
            enabled = email.isNotBlank() && password.isNotBlank() && (!register || name.isNotBlank()),
        )
        if (!register) TextButton(onClick = { if (email.isNotBlank()) onReset(email) }) { Text("Passwort vergessen") }
        Spacer(Modifier.weight(1f))
        Text("Datenschutz · ZweiCheck", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun HomeScreen(
    user: User,
    checks: List<CheckItem>,
    trust: TrustRouting?,
    premium: Boolean,
    onNewCheck: () -> Unit,
    onPremium: () -> Unit,
) {
    val open = checks.count { it.status != "closed" }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 24.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
      item {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text("Hallo ${user.name}", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, color = Navy); Text("Wenn dir etwas komisch vorkommt, frag erst jemanden, dem du vertraust.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)) }
            IconButton(onClick = {}) { Icon(Icons.Default.Notifications, "Aktivitäten", tint = Navy) }
        }
      }
      item {
        Surface(color = Teal.copy(alpha = 0.11f), shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp)) {
                Icon(Icons.Default.Security, null, tint = Teal, modifier = Modifier.size(34.dp))
                Text("Bevor du zahlst, klickst oder Daten weitergibst", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Navy, modifier = Modifier.padding(top = 12.dp))
                Text("ZweiCheck holt den zweiten Blick einer vertrauten Person.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            }
        }
      }
      item {
        PrimaryAction("Ich bin unsicher – prüfen lassen", onNewCheck, enabled = !trust?.connections.isNullOrEmpty())
        if (trust?.connections.isNullOrEmpty()) Text("Verbinde zuerst eine Vertrauensperson.", modifier = Modifier.padding(top = 8.dp))
      }
      item { AppCard { Text("Aktuell", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceAround) { Stat("$open", "offen"); Stat("${trust?.connections?.size ?: 0}", "Personen") } } }
      item {
        checks.firstOrNull()?.let { newest -> AppCard { Text("Letzte Prüfung", fontWeight = FontWeight.Bold); Text(newest.categoryLabel, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)); Text(newest.statusLabel, color = if (newest.status == "open" || newest.status == "pending") Orange else Teal, fontWeight = FontWeight.SemiBold) } }
      }
        if (!premium) {
          item {
            AppCard {
                    Text("Premium Familie", fontWeight = FontWeight.Bold)
                    Text("Bis zu 3 Bilder, Erinnerungen und automatische zweite Vertrauensperson.")
                    TextButton(onClick = onPremium) { Text("Premium ansehen") }
            }
          }
        }
    }
}

@Composable
private fun Stat(value: String, label: String) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(value, fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Teal); Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun ChecksScreen(
    checks: List<CheckItem>,
    currentUserId: String,
    highlightedCheckId: String?,
    onRespond: (CheckItem, Recommendation) -> Unit,
) {
    if (checks.isEmpty()) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(color = Teal.copy(alpha = 0.12f), shape = RoundedCornerShape(24.dp)) { Icon(Icons.Default.VerifiedUser, null, tint = Teal, modifier = Modifier.padding(22.dp).size(52.dp)) }
            Text("Noch keine Prüfungen", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Navy, modifier = Modifier.padding(top = 18.dp))
            Text("Gesendete und erhaltene Prüfanfragen erscheinen hier.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp, start = 28.dp, end = 28.dp))
        }
        return
    }
    val ordered = checks.sortedWith(compareByDescending<CheckItem> { it.id == highlightedCheckId }.thenByDescending { it.createdAt })
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 24.dp, bottom = 28.dp)) {
        item { Text("Prüfungen", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, color = Navy) }
        items(ordered, key = { it.id }) { check ->
            AppCard {
                    if (check.id == highlightedCheckId) Text("Aus Benachrichtigung geöffnet", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = if (check.status == "open" || check.status == "pending") Orange.copy(alpha = 0.12f) else Teal.copy(alpha = 0.12f), shape = RoundedCornerShape(12.dp)) { Icon(Icons.Default.Shield, null, tint = if (check.status == "open" || check.status == "pending") Orange else Teal, modifier = Modifier.padding(9.dp).size(23.dp)) }
                        Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(check.categoryLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold); Text(check.statusLabel, color = if (check.status == "open" || check.status == "pending") Orange else Teal, fontWeight = FontWeight.Bold) }
                    }
                    Text(check.description, modifier = Modifier.padding(vertical = 12.dp), maxLines = 3)
                    Text(if (check.requesterId == currentUserId) "Bei ${check.reviewerName}" else "Von ${check.requesterName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (check.reviewerId == currentUserId && check.status != "responded" && check.status != "closed") {
                        Spacer(Modifier.height(10.dp))
                        Recommendation.entries.forEach { recommendation ->
                            OutlinedButton(onClick = { onRespond(check, recommendation) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) { Text(recommendation.label, fontWeight = FontWeight.Bold) }
                        }
                    }
                    check.recommendationLabel?.let { Text("Antwort: $it", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
            }
        }
    }
}

@Composable
private fun TrustScreen(trust: TrustRouting?, onPresence: (String) -> Unit, onInvite: (String?) -> Unit, onAccept: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 24.dp, bottom = 28.dp)) {
        item { Text("Personen", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, color = Navy) }
        item {
          AppCard {
            Text("Wann kannst du helfen?", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(trust?.selfPresence?.label ?: "Keine Angabe", color = Teal, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 10.dp)) {
                PresenceButton("Ja, ich kann helfen", "available", trust, onPresence)
                PresenceButton("Nur wenn es dringend ist", "urgent_only", trust, onPresence)
                PresenceButton("Gerade nicht", "unavailable", trust, onPresence)
            }
          }
        }
        item { Text("Deine Vertrauenspersonen", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        items(trust?.connections.orEmpty(), key = { it.connectionId }) { connection ->
            AppCard {
                    Row(verticalAlignment = Alignment.CenterVertically) { Surface(color = Navy.copy(alpha = 0.09f), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Default.Person, null, tint = Navy, modifier = Modifier.padding(10.dp)) }; Column(Modifier.padding(start = 12.dp)) {
                    Text(connection.person.name, fontWeight = FontWeight.Bold)
                    Text(connection.person.email)
                    Text(connection.presence.label, style = MaterialTheme.typography.bodySmall, color = Teal)
                    } }
            }
        }
        item {
          AppCard {
            Text("Person einladen", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Ohne E-Mail erzeugt ZweiCheck einen Code, den du selbst teilen kannst.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
            OutlinedTextField(email, { email = it }, label = { Text("E-Mail optional") }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true)
            PrimaryAction("Einladung erstellen", { onInvite(email.takeIf { it.isNotBlank() }) }, modifier = Modifier.padding(top = 10.dp))
            OutlinedTextField(code, { code = it }, label = { Text("Einladungscode") }, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
            OutlinedButton(onClick = { if (code.isNotBlank()) onAccept(code) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp)) { Text("Code annehmen", fontWeight = FontWeight.Bold) }
          }
        }
    }
}

@Composable
private fun PresenceButton(label: String, status: String, trust: TrustRouting?, onPresence: (String) -> Unit) {
    val selected = trust?.selfPresence?.status == status
    OutlinedButton(onClick = { onPresence(status) }, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(14.dp)) {
        Icon(if (selected) Icons.Default.CheckCircle else Icons.Default.AccountCircle, null, tint = if (selected) Teal else Navy, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, modifier = Modifier.weight(1f)); if (selected) Text("✓", color = Teal)
    }
}

@Composable
private fun NewCheckScreen(
    activity: MainActivity,
    trust: TrustRouting?,
    isPremiumFamily: Boolean,
    initialDraft: ShareDraft?,
    onCancel: () -> Unit,
    onOpenPremium: () -> Unit,
    onCreate: (String, String?, String, String, String?, String, Int?, Boolean, List<UploadImage>) -> Unit,
) {
    val imageLimit = if (isPremiumFamily) 3 else 1
    var step by remember { mutableStateOf(1) }
    var reviewerId by remember { mutableStateOf(trust?.connections?.firstOrNull()?.person?.id.orEmpty()) }
    var fallbackReviewerId by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("message") }
    var description by remember { mutableStateOf(initialDraft?.text.orEmpty()) }
    var amount by remember { mutableStateOf("") }
    var urgency by remember { mutableStateOf("none") }
    var reminderMinutes by remember { mutableStateOf(0) }
    var autoReroute by remember { mutableStateOf(false) }
    var images by remember { mutableStateOf(initialDraft?.images.orEmpty().take(imageLimit)) }

    LaunchedEffect(isPremiumFamily) {
        if (!isPremiumFamily) {
            images = images.take(1)
            fallbackReviewerId = ""
            reminderMinutes = 0
            autoReroute = false
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        images = uris.take(imageLimit).mapNotNull(activity::readUploadImage)
    }

    LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { if (step > 1) step-- else onCancel() }) { Icon(Icons.Default.ArrowBack, "Zurück") }
                Text("Prüfen lassen", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Navy)
                TextButton(onClick = onCancel) { Text("Schließen") }
            }
        }
        item {
            LinearProgressIndicator(progress = { step / 4f }, modifier = Modifier.fillMaxWidth().height(7.dp), color = Teal, trackColor = Color(0xFFDCE5E9))
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("Schritt $step von 4", color = Teal, fontWeight = FontWeight.Bold); Text(if (isPremiumFamily) "PREMIUM FAMILIE" else "KOSTENLOS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Navy) }
        }
        if (step == 1) {
          item { Text("Wer soll dir helfen?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Navy); Text("Wähle eine Person, die du kennst und der du vertraust.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
          items(trust?.connections.orEmpty(), key = { it.connectionId }) { connection ->
            SelectionCard(reviewerId == connection.person.id, { reviewerId = connection.person.id }) {
                Column(Modifier.weight(1f)) { Text(connection.person.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold); Text(connection.presence.label, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
          }
        }
        if (step == 2) {
          item { Text("Worum geht es?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Navy) }
          items(listOf("message" to "Nachricht", "payment" to "Zahlung", "link" to "Link oder Webseite", "data" to "Persönliche Daten")) { (wire, label) ->
            SelectionCard(category == wire, { category = wire }) { Icon(Icons.Default.Security, null, tint = if (category == wire) Teal else Navy); Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).padding(start = 12.dp)) }
          }
        }
        if (step == 3) {
          item {
            Text("Was ist passiert?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Navy)
            Text("Beschreibe kurz, warum du unsicher bist. Keine Passwörter oder TANs eingeben.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            OutlinedTextField(description, { description = it }, label = { Text("Deine Beschreibung") }, modifier = Modifier.fillMaxWidth().padding(top = 14.dp), minLines = 5, shape = RoundedCornerShape(16.dp))
            OutlinedTextField(amount, { amount = it }, label = { Text("Betrag – optional") }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true, shape = RoundedCornerShape(14.dp))
            OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth().height(54.dp).padding(top = 8.dp), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Default.AddPhotoAlternate, null); Spacer(Modifier.width(8.dp)); Text(if (images.isEmpty()) "Bild auswählen – optional" else "Bilder ändern (${images.size}/$imageLimit)", fontWeight = FontWeight.Bold) }
            if (!isPremiumFamily) {
                Text("Kostenlos ist 1 Bild möglich. Premium Familie erlaubt bis zu 3 Bilder pro Prüfung.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                TextButton(onClick = onOpenPremium) { Text("Premium Familie ansehen") }
            }
          }
        }
        if (step == 4) item {
            Text("Alles richtig?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Navy)
            AppCard(Modifier.padding(top = 8.dp)) { Text("Vertrauensperson", fontWeight = FontWeight.Bold); Text(trust?.connections?.firstOrNull { it.person.id == reviewerId }?.person?.name ?: "–"); Text("Thema", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)); Text(listOf("message" to "Nachricht", "payment" to "Zahlung", "link" to "Link oder Webseite", "data" to "Persönliche Daten").first { it.first == category }.second); Text("Beschreibung", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)); Text(description) }
            Text("Wie dringend ist es?", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { urgency = "none" }) { Text((if (urgency == "none") "✓ " else "") + "Normal") }
                OutlinedButton(onClick = { urgency = "high" }) { Text((if (urgency == "high") "✓ " else "") + "Dringend") }
            }
            OutlinedButton(onClick = { urgency = "very_high" }, modifier = Modifier.fillMaxWidth()) { Text((if (urgency == "very_high") "✓ " else "") + "Sehr dringend") }

            if (isPremiumFamily) {
                Spacer(Modifier.height(8.dp))
                Text("Wenn niemand antwortet", fontWeight = FontWeight.Bold)
                Text("Erinnerung: ${if (reminderMinutes == 0) "aus" else "$reminderMinutes Minuten"}")
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(0, 5, 15, 30, 60, 120).forEach { minutes ->
                        TextButton(onClick = { reminderMinutes = minutes; if (minutes == 0) autoReroute = false }) { Text(if (minutes == 0) "Aus" else "$minutes") }
                    }
                }
                Text("Zweite Vertrauensperson (optional)")
                trust?.connections.orEmpty().filter { it.person.id != reviewerId }.forEach { connection ->
                    TextButton(onClick = { fallbackReviewerId = if (fallbackReviewerId == connection.person.id) "" else connection.person.id }) {
                        Text((if (fallbackReviewerId == connection.person.id) "✓ " else "") + connection.person.name)
                    }
                }
                if (fallbackReviewerId.isNotBlank() && reminderMinutes > 0) {
                    OutlinedButton(onClick = { autoReroute = !autoReroute }, modifier = Modifier.fillMaxWidth()) { Text((if (autoReroute) "✓ " else "") + "Danach automatisch die zweite Person fragen") }
                }
            } else {
                AppCard(Modifier.padding(vertical = 8.dp)) {
                        Text("PREMIUM · Wenn niemand antwortet", fontWeight = FontWeight.Bold)
                        Text("Erinnerungen und automatische zweite Vertrauensperson sind Teil von Premium Familie.")
                        TextButton(onClick = onOpenPremium) { Text("Premium freischalten") }
                }
            }
        }
        item {
            val canContinue = when (step) { 1 -> reviewerId.isNotBlank(); 3 -> description.trim().length >= 5; else -> true }
            PrimaryAction(if (step == 4) "Jetzt sicher prüfen lassen" else "Weiter", {
                if (step < 4) step++ else onCreate(reviewerId, fallbackReviewerId.takeIf { isPremiumFamily && it.isNotBlank() }, category, description, amount.takeIf { it.isNotBlank() }, urgency, reminderMinutes.takeIf { isPremiumFamily && it > 0 }, isPremiumFamily && autoReroute, images.take(imageLimit))
            }, enabled = canContinue)
        }
    }
}

@Composable
private fun SelectionCard(selected: Boolean, onClick: () -> Unit, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(16.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(if (selected) 2.dp else 1.dp, if (selected) Teal else Color(0xFFC6D0D8)), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { content(); Icon(Icons.Default.CheckCircle, null, tint = if (selected) Teal else Color(0xFFC6D0D8), modifier = Modifier.size(24.dp)) }
    }
}

@Composable
private fun AccountScreen(
    activity: MainActivity,
    user: User,
    api: ApiClient,
    billing: BillingManager,
    onEnablePush: () -> Unit,
    onSignedOut: () -> Unit,
    onMessage: (String?) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val exportClient = remember { AccountExportClient(activity.applicationContext) }
    var exportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var password by remember { mutableStateOf("") }
    var deleteConfirmation by remember { mutableStateOf("") }

    val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val bytes = exportBytes
        exportBytes = null
        if (uri != null && bytes != null) {
            runCatching { activity.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }
                .onFailure { onMessage("Der Datenexport konnte nicht gespeichert werden.") }
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 12.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Dein Konto", fontWeight = FontWeight.Bold)
                    Text(user.name)
                    Text(user.email)
                    Text(if (billing.isPremiumFamily) "Tarif: Premium Familie" else "Tarif: Kostenlos")
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Benachrichtigungen", fontWeight = FontWeight.Bold)
                    Text("ZweiCheck kann dich bei neuen Prüfanfragen und Antworten informieren. Push wird erst nach deiner Freigabe aktiviert.")
                    Button(onClick = onEnablePush, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), enabled = user.emailVerified) { Text("Push-Benachrichtigungen aktivieren") }
                    if (!user.emailVerified) Text("Bestätige zuerst deine E-Mail-Adresse.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Premium Familie", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Bis zu 3 Bilder pro Prüfung, Erinnerungen und automatische zweite Vertrauensperson.")
                    if (billing.isPremiumFamily) {
                        Text("Aktiv", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
                    } else {
                        Button(onClick = { billing.purchaseMonthly(activity) }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), enabled = billing.monthlyPrice != null && !billing.loading) { Text("Monatlich · ${billing.monthlyPrice ?: "wird geladen"}") }
                        Button(onClick = { billing.purchaseYearly(activity) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), enabled = billing.yearlyPrice != null && !billing.loading) { Text("Jährlich · ${billing.yearlyPrice ?: "wird geladen"}") }
                    }
                    OutlinedButton(onClick = billing::restorePurchases, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), enabled = !billing.loading) { Text("Käufe wiederherstellen") }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Deine Daten", fontWeight = FontWeight.Bold)
                    Text("Du kannst deine bei ZweiCheck gespeicherten Kontodaten als JSON-Datei exportieren.")
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                runCatching { exportClient.download() }
                                    .onSuccess { bytes -> exportBytes = bytes; saveExport.launch("zweicheck-datenexport.json") }
                                    .onFailure { onMessage(it.message) }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Datenexport erstellen") }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Datenschutz und Hilfe", fontWeight = FontWeight.Bold)
                    TextButton(onClick = { activity.openUrl("https://zweicheck.kamilunavo.com/privacy") }) { Text("Datenschutz") }
                    TextButton(onClick = { activity.openUrl("https://zweicheck.kamilunavo.com/privacy-choices") }) { Text("Datenschutz-Einstellungen") }
                    TextButton(onClick = { activity.openUrl("https://zweicheck.kamilunavo.com/support") }) { Text("Hilfe & Support") }
                    TextButton(onClick = { activity.openUrl("https://play.google.com/store/account/subscriptions") }) { Text("Google-Play-Abos verwalten") }
                }
            }
        }
        item {
            OutlinedButton(
                onClick = {
                    scope.launch {
                        runCatching { FcmRegistration.unregisterCurrentToken(activity.applicationContext) }
                        api.logout()
                        onSignedOut()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Abmelden") }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Konto löschen", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                    Text("Diese Aktion kann nicht rückgängig gemacht werden.")
                    OutlinedTextField(password, { password = it }, label = { Text("Aktuelles Passwort") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(deleteConfirmation, { deleteConfirmation = it }, label = { Text("Zum Bestätigen LÖSCHEN eingeben") }, modifier = Modifier.fillMaxWidth())
                    Button(
                        onClick = {
                            scope.launch {
                                runCatching { FcmRegistration.unregisterCurrentToken(activity.applicationContext) }
                                runCatching { api.deleteAccount(password) }
                                    .onSuccess { onSignedOut() }
                                    .onFailure { onMessage(it.message) }
                            }
                        },
                        enabled = password.isNotBlank() && deleteConfirmation == "LÖSCHEN",
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Konto dauerhaft löschen") }
                }
            }
        }
    }
}

private fun MainActivity.openUrl(url: String) {
    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}

private fun MainActivity.readUploadImage(uri: Uri): UploadImage? = runCatching {
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
    if (bytes.size > 8 * 1024 * 1024) return@runCatching null
    val mime = contentResolver.getType(uri) ?: "image/jpeg"
    val extension = when {
        mime.contains("png") -> "png"
        mime.contains("webp") -> "webp"
        else -> "jpg"
    }
    UploadImage(bytes = bytes, fileName = "zweicheck-${System.nanoTime()}.$extension", mimeType = mime)
}.getOrNull()

private fun extractCheckId(intent: Intent?): String? {
    intent ?: return null
    intent.getStringExtra(ZweiCheckMessagingService.EXTRA_CHECK_ID)?.takeIf { it.isNotBlank() }?.let { return it }
    val fragment = intent.data?.fragment.orEmpty()
    return fragment.split('&').firstOrNull { it.startsWith("check=") }
        ?.substringAfter("check=")
        ?.takeIf { it.isNotBlank() }
}

@Suppress("DEPRECATION")
private fun extractSharedDraft(activity: MainActivity): ShareDraft? {
    val intent = activity.intent ?: return null
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return null
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    val uris = when (intent.action) {
        Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
        else -> emptyList()
    }
    val images = uris.take(3).mapNotNull(activity::readUploadImage)
    if (text.isBlank() && images.isEmpty()) return null
    return ShareDraft(text = text, images = images)
}
