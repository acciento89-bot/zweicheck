package de.kamilunavo.zweicheck

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
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

    MaterialTheme(colorScheme = lightColorScheme()) {
        when {
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
                bottomBar = {
                    NavigationBar {
                        NavigationBarItem(selected = tab == Tab.HOME, onClick = { tab = Tab.HOME }, icon = { Text("⌂") }, label = { Text("Start") })
                        NavigationBarItem(selected = tab == Tab.CHECKS, onClick = { tab = Tab.CHECKS }, icon = { Text("✓") }, label = { Text("Prüfen") })
                        NavigationBarItem(selected = tab == Tab.TRUST, onClick = { tab = Tab.TRUST }, icon = { Text("◎") }, label = { Text("Personen") })
                        NavigationBarItem(selected = tab == Tab.ACCOUNT, onClick = { tab = Tab.ACCOUNT }, icon = { Text("●") }, label = { Text("Konto") })
                    }
                },
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("ZweiCheck", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(user?.name.orEmpty(), style = MaterialTheme.typography.bodySmall)
                        }
                        Text(if (billing.isPremiumFamily) "Premium Familie" else "Kostenlos", style = MaterialTheme.typography.labelMedium)
                    }
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
                        Tab.HOME -> HomeScreen(checks, trust, billing.isPremiumFamily, onNewCheck = { creating = true }, onPremium = { tab = Tab.ACCOUNT })
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
    Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center) {
        Text("ZweiCheck", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        Text("Gemeinsam prüfen. Sicher handeln.", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(24.dp))
        if (register) OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("E-Mail") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Passwort") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp)) }
        Button(
            onClick = { if (register) onRegister(name, email, password) else onLogin(email, password) },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            enabled = email.isNotBlank() && password.isNotBlank() && (!register || name.isNotBlank()),
        ) { Text(if (register) "Konto erstellen" else "Anmelden") }
        TextButton(onClick = { register = !register }) { Text(if (register) "Schon ein Konto? Anmelden" else "Noch kein Konto? Registrieren") }
        if (!register) TextButton(onClick = { if (email.isNotBlank()) onReset(email) }) { Text("Passwort vergessen") }
    }
}

@Composable
private fun HomeScreen(
    checks: List<CheckItem>,
    trust: TrustRouting?,
    premium: Boolean,
    onNewCheck: () -> Unit,
    onPremium: () -> Unit,
) {
    val open = checks.count { it.status != "closed" }
    Column(Modifier.fillMaxWidth().padding(top = 24.dp)) {
        Text("Bevor du zahlst, klickst oder Daten weitergibst.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Frag eine Person, der du vertraust.", modifier = Modifier.padding(top = 8.dp, bottom = 24.dp))
        Button(onClick = onNewCheck, modifier = Modifier.fillMaxWidth(), enabled = !trust?.connections.isNullOrEmpty()) { Text("Ich bin unsicher – prüfen lassen") }
        if (trust?.connections.isNullOrEmpty()) Text("Verbinde zuerst eine Vertrauensperson.", modifier = Modifier.padding(top = 8.dp))
        Card(Modifier.fillMaxWidth().padding(top = 24.dp)) {
            Column(Modifier.padding(18.dp)) {
                Text("Aktuell", fontWeight = FontWeight.Bold)
                Text("$open offene Prüfanfragen")
                Text("${trust?.connections?.size ?: 0} Vertrauenspersonen")
            }
        }
        if (!premium) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(18.dp)) {
                    Text("Premium Familie", fontWeight = FontWeight.Bold)
                    Text("Bis zu 3 Bilder, Erinnerungen und automatische zweite Vertrauensperson.")
                    TextButton(onClick = onPremium) { Text("Premium ansehen") }
                }
            }
        }
    }
}

@Composable
private fun ChecksScreen(
    checks: List<CheckItem>,
    currentUserId: String,
    highlightedCheckId: String?,
    onRespond: (CheckItem, Recommendation) -> Unit,
) {
    if (checks.isEmpty()) {
        Text("Noch keine Prüfanfragen.", modifier = Modifier.padding(top = 24.dp))
        return
    }
    val ordered = checks.sortedWith(compareByDescending<CheckItem> { it.id == highlightedCheckId }.thenByDescending { it.createdAt })
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
        items(ordered, key = { it.id }) { check ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    if (check.id == highlightedCheckId) Text("Aus Benachrichtigung geöffnet", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Text(check.categoryLabel, fontWeight = FontWeight.Bold)
                    Text(check.description, modifier = Modifier.padding(vertical = 6.dp))
                    Text("${check.requesterName} → ${check.reviewerName} · ${check.status}", style = MaterialTheme.typography.bodySmall)
                    if (check.reviewerId == currentUserId && check.status != "responded" && check.status != "closed") {
                        Spacer(Modifier.height(10.dp))
                        Recommendation.entries.forEach { recommendation ->
                            OutlinedButton(onClick = { onRespond(check, recommendation) }, modifier = Modifier.fillMaxWidth()) { Text(recommendation.label) }
                        }
                    }
                    check.recommendation?.let { Text("Antwort: $it", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TrustScreen(trust: TrustRouting?, onPresence: (String) -> Unit, onInvite: (String?) -> Unit, onAccept: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
        item {
            Text("Meine Verfügbarkeit", fontWeight = FontWeight.Bold)
            Text(trust?.selfPresence?.label ?: "Keine Angabe")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = { onPresence("available") }) { Text("Verfügbar") }
                OutlinedButton(onClick = { onPresence("urgent_only") }) { Text("Nur dringend") }
            }
            OutlinedButton(onClick = { onPresence("unavailable") }) { Text("Gerade nicht") }
        }
        item { Text("Vertrauenspersonen", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)) }
        items(trust?.connections.orEmpty(), key = { it.connectionId }) { connection ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(connection.person.name, fontWeight = FontWeight.Bold)
                    Text(connection.person.email)
                    Text(connection.presence.label, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Text("Einladen", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            OutlinedTextField(email, { email = it }, label = { Text("E-Mail (optional)") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onInvite(email.takeIf { it.isNotBlank() }) }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) { Text("Einladung erstellen") }
            OutlinedTextField(code, { code = it }, label = { Text("Einladungscode") }, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
            OutlinedButton(onClick = { if (code.isNotBlank()) onAccept(code) }, modifier = Modifier.fillMaxWidth()) { Text("Code annehmen") }
        }
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

    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Neue Prüfanfrage", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(if (isPremiumFamily) "Premium Familie" else "Kostenlos · 1 Bild")
                }
                TextButton(onClick = onCancel) { Text("Abbrechen") }
            }
        }
        item { Text("1. Wer soll dir helfen?", fontWeight = FontWeight.Bold) }
        items(trust?.connections.orEmpty(), key = { it.connectionId }) { connection ->
            OutlinedButton(onClick = { reviewerId = connection.person.id }, modifier = Modifier.fillMaxWidth()) {
                Text((if (reviewerId == connection.person.id) "✓ " else "") + connection.person.name)
            }
        }
        item {
            Text("2. Worum geht es?", fontWeight = FontWeight.Bold)
            listOf("message" to "Nachricht", "payment" to "Zahlung", "link" to "Link", "data" to "Daten").forEach { (wire, label) ->
                TextButton(onClick = { category = wire }) { Text((if (category == wire) "✓ " else "") + label) }
            }
        }
        item {
            Text("3. Was ist passiert?", fontWeight = FontWeight.Bold)
            OutlinedTextField(description, { description = it }, label = { Text("Beschreibung") }, modifier = Modifier.fillMaxWidth(), minLines = 4)
            if (category == "payment") OutlinedTextField(amount, { amount = it }, label = { Text("Betrag (optional)") }, modifier = Modifier.fillMaxWidth())
            OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Bilder auswählen (${images.size}/$imageLimit)") }
            if (!isPremiumFamily) {
                Text("Kostenlos ist 1 Bild möglich. Premium Familie erlaubt bis zu 3 Bilder pro Prüfung.")
                TextButton(onClick = onOpenPremium) { Text("Premium Familie ansehen") }
            }
        }
        item {
            Text("4. Alles richtig?", fontWeight = FontWeight.Bold)
            Text("Wie dringend ist es?")
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
                Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Text("PREMIUM · Wenn niemand antwortet", fontWeight = FontWeight.Bold)
                        Text("Erinnerungen und automatische zweite Vertrauensperson sind Teil von Premium Familie.")
                        TextButton(onClick = onOpenPremium) { Text("Premium freischalten") }
                    }
                }
            }

            Button(
                onClick = { onCreate(reviewerId, fallbackReviewerId.takeIf { isPremiumFamily && it.isNotBlank() }, category, description, amount.takeIf { it.isNotBlank() }, urgency, reminderMinutes.takeIf { isPremiumFamily && it > 0 }, isPremiumFamily && autoReroute, images.take(imageLimit)) },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                enabled = reviewerId.isNotBlank() && description.trim().length >= 5,
            ) { Text("Jetzt sicher prüfen lassen") }
        }
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
