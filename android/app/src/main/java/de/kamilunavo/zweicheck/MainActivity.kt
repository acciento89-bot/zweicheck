package de.kamilunavo.zweicheck

import android.content.Intent
import android.net.Uri
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
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ZweiCheckApp(this) }
    }
}

private enum class Tab { HOME, CHECKS, TRUST }

@Composable
private fun ZweiCheckApp(activity: MainActivity) {
    val api = remember { ApiClient(activity.applicationContext) }
    val scope = rememberCoroutineScope()
    var user by remember { mutableStateOf<User?>(null) }
    var checks by remember { mutableStateOf<List<CheckItem>>(emptyList()) }
    var trust by remember { mutableStateOf<TrustRouting?>(null) }
    var tab by remember { mutableStateOf(Tab.HOME) }
    var creating by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var sharedDraft by remember { mutableStateOf(extractSharedText(activity.intent)) }

    suspend fun refresh() {
        checks = api.checks()
        trust = api.trustRouting()
    }

    LaunchedEffect(Unit) {
        loading = true
        try {
            user = api.me()
            refresh()
        } catch (cause: ApiException) {
            if (cause.statusCode != 401) error = cause.message
        } catch (cause: Exception) {
            error = cause.message
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
                error = error,
                onLogin = { email, password ->
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            user = api.login(email, password)
                            refresh()
                        } catch (cause: Exception) {
                            error = cause.message
                        } finally { loading = false }
                    }
                },
                onRegister = { name, email, password ->
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            user = api.register(name, email, password)
                            refresh()
                        } catch (cause: Exception) {
                            error = cause.message
                        } finally { loading = false }
                    }
                },
                onReset = { email ->
                    scope.launch {
                        runCatching { api.requestPasswordReset(email) }
                            .onSuccess { error = "Wenn die Adresse registriert ist, wurde eine Reset-Mail versendet." }
                            .onFailure { error = it.message }
                    }
                },
            )

            creating -> NewCheckScreen(
                activity = activity,
                trust = trust,
                initialDescription = sharedDraft.orEmpty(),
                onCancel = { creating = false },
                onCreate = { reviewerId, category, description, amount, urgency, images ->
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            api.createCheck(
                                reviewerId = reviewerId,
                                fallbackReviewerId = null,
                                category = category,
                                description = description,
                                amount = amount,
                                urgency = urgency,
                                reminderMinutes = null,
                                autoReroute = false,
                                images = images,
                            )
                            sharedDraft = null
                            refresh()
                            tab = Tab.CHECKS
                            creating = false
                        } catch (cause: Exception) {
                            error = cause.message
                        } finally { loading = false }
                    }
                },
            )

            else -> Scaffold(
                bottomBar = {
                    NavigationBar {
                        NavigationBarItem(selected = tab == Tab.HOME, onClick = { tab = Tab.HOME }, icon = { Text("⌂") }, label = { Text("Start") })
                        NavigationBarItem(selected = tab == Tab.CHECKS, onClick = { tab = Tab.CHECKS }, icon = { Text("✓") }, label = { Text("Prüfungen") })
                        NavigationBarItem(selected = tab == Tab.TRUST, onClick = { tab = Tab.TRUST }, icon = { Text("◎") }, label = { Text("Vertrauen") })
                    }
                },
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("ZweiCheck", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(user?.name.orEmpty(), style = MaterialTheme.typography.bodySmall)
                        }
                        TextButton(onClick = {
                            scope.launch {
                                api.logout()
                                user = null
                                checks = emptyList()
                                trust = null
                            }
                        }) { Text("Abmelden") }
                    }
                    error?.let { Text(it, modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.error) }
                    when (tab) {
                        Tab.HOME -> HomeScreen(checks, trust, onNewCheck = { creating = true })
                        Tab.CHECKS -> ChecksScreen(
                            checks = checks,
                            currentUserId = user!!.id,
                            onRespond = { check, recommendation ->
                                scope.launch {
                                    runCatching { api.respond(check.id, recommendation, "") }
                                        .onSuccess { refresh() }
                                        .onFailure { error = it.message }
                                }
                            },
                        )
                        Tab.TRUST -> TrustScreen(
                            trust = trust,
                            onPresence = { status ->
                                scope.launch {
                                    runCatching { api.updatePresence(status, null); trust = api.trustRouting() }
                                        .onFailure { error = it.message }
                                }
                            },
                            onInvite = { email ->
                                scope.launch {
                                    runCatching { api.invite(email) }
                                        .onSuccess { code -> error = "Einladung erstellt. Code: $code" }
                                        .onFailure { error = it.message }
                                }
                            },
                            onAccept = { code ->
                                scope.launch {
                                    runCatching { api.acceptInvitation(code); trust = api.trustRouting() }
                                        .onFailure { error = it.message }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AuthScreen(
    error: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
    onReset: (String) -> Unit,
) {
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("ZweiCheck", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        Text("Gemeinsam prüfen. Sicher handeln.", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(24.dp))
        if (register) OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("E-Mail") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            password,
            { password = it },
            label = { Text("Passwort") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp)) }
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
private fun HomeScreen(checks: List<CheckItem>, trust: TrustRouting?, onNewCheck: () -> Unit) {
    val open = checks.count { it.status != "closed" }
    Column(Modifier.fillMaxWidth().padding(top = 24.dp)) {
        Text("Bevor du zahlst, klickst oder Daten weitergibst.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Frag eine Person, der du vertraust.", modifier = Modifier.padding(top = 8.dp, bottom = 24.dp))
        Button(onClick = onNewCheck, modifier = Modifier.fillMaxWidth(), enabled = !trust?.connections.isNullOrEmpty()) { Text("Jemanden fragen") }
        if (trust?.connections.isNullOrEmpty()) Text("Verbinde zuerst eine Vertrauensperson.", modifier = Modifier.padding(top = 8.dp))
        Card(Modifier.fillMaxWidth().padding(top = 24.dp)) {
            Column(Modifier.padding(18.dp)) {
                Text("Aktuell", fontWeight = FontWeight.Bold)
                Text("$open offene Prüfanfragen")
                Text("${trust?.connections?.size ?: 0} Vertrauenspersonen")
            }
        }
    }
}

@Composable
private fun ChecksScreen(checks: List<CheckItem>, currentUserId: String, onRespond: (CheckItem, Recommendation) -> Unit) {
    if (checks.isEmpty()) {
        Text("Noch keine Prüfanfragen.", modifier = Modifier.padding(top = 24.dp))
        return
    }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
        items(checks, key = { it.id }) { check ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(check.categoryLabel, fontWeight = FontWeight.Bold)
                    Text(check.description, modifier = Modifier.padding(vertical = 6.dp))
                    Text("${check.requesterName} → ${check.reviewerName} · ${check.status}", style = MaterialTheme.typography.bodySmall)
                    if (check.reviewerId == currentUserId && check.status != "responded" && check.status != "closed") {
                        Spacer(Modifier.height(10.dp))
                        Recommendation.entries.forEach { recommendation ->
                            OutlinedButton(onClick = { onRespond(check, recommendation) }, modifier = Modifier.fillMaxWidth()) {
                                Text(recommendation.label)
                            }
                        }
                    }
                    check.recommendation?.let { Text("Antwort: $it", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TrustScreen(
    trust: TrustRouting?,
    onPresence: (String) -> Unit,
    onInvite: (String?) -> Unit,
    onAccept: (String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
        item {
            Text("Meine Verfügbarkeit", fontWeight = FontWeight.Bold)
            Text(trust?.selfPresence?.label ?: "Keine Angabe")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = { onPresence("available") }) { Text("Verfügbar") }
                OutlinedButton(onClick = { onPresence("urgent_only") }) { Text("Dringend") }
            }
            OutlinedButton(onClick = { onPresence("unavailable") }) { Text("Gerade nicht") }
        }
        item {
            Text("Vertrauenspersonen", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
        }
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
    initialDescription: String,
    onCancel: () -> Unit,
    onCreate: (String, String, String, String?, String, List<UploadImage>) -> Unit,
) {
    var reviewerId by remember { mutableStateOf(trust?.connections?.firstOrNull()?.person?.id.orEmpty()) }
    var category by remember { mutableStateOf("message") }
    var description by remember { mutableStateOf(initialDescription) }
    var amount by remember { mutableStateOf("") }
    var urgency by remember { mutableStateOf("normal") }
    var images by remember { mutableStateOf<List<UploadImage>>(emptyList()) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        images = uris.take(3).mapNotNull { uri -> activity.readUploadImage(uri) }
    }

    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Neue Prüfanfrage", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = onCancel) { Text("Abbrechen") }
            }
        }
        item { Text("1. Vertrauensperson", fontWeight = FontWeight.Bold) }
        items(trust?.connections.orEmpty(), key = { it.connectionId }) { connection ->
            OutlinedButton(onClick = { reviewerId = connection.person.id }, modifier = Modifier.fillMaxWidth()) {
                Text((if (reviewerId == connection.person.id) "✓ " else "") + connection.person.name)
            }
        }
        item {
            Text("2. Worum geht es?", fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("message" to "Nachricht", "payment" to "Zahlung", "link" to "Link", "data" to "Daten").forEach { (wire, label) ->
                    TextButton(onClick = { category = wire }) { Text((if (category == wire) "✓ " else "") + label) }
                }
            }
            OutlinedTextField(description, { description = it }, label = { Text("Was soll geprüft werden?") }, modifier = Modifier.fillMaxWidth(), minLines = 4)
            if (category == "payment") OutlinedTextField(amount, { amount = it }, label = { Text("Betrag (optional)") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Text("3. Belege", fontWeight = FontWeight.Bold)
            OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth()) { Text("Bilder auswählen (${images.size}/3)") }
        }
        item {
            Text("4. Dringlichkeit", fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { urgency = "normal" }) { Text((if (urgency == "normal") "✓ " else "") + "Normal") }
                OutlinedButton(onClick = { urgency = "urgent" }) { Text((if (urgency == "urgent") "✓ " else "") + "Dringend") }
            }
            Button(
                onClick = { onCreate(reviewerId, category, description, amount.takeIf { it.isNotBlank() }, urgency, images) },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                enabled = reviewerId.isNotBlank() && description.isNotBlank(),
            ) { Text("Prüfanfrage senden") }
        }
    }
}

private fun MainActivity.readUploadImage(uri: Uri): UploadImage? = runCatching {
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
    if (bytes.size > 10 * 1024 * 1024) return@runCatching null
    val mime = contentResolver.getType(uri) ?: "image/jpeg"
    UploadImage(bytes = bytes, fileName = "zweicheck-${System.currentTimeMillis()}.${if (mime.contains("png")) "png" else "jpg"}", mimeType = mime)
}.getOrNull()

private fun extractSharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
    return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }
}
