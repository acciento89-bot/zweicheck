package de.kamilunavo.zweicheck

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import java.io.File
import java.text.DateFormat
import java.util.Date
import java.util.UUID

internal object LocalVerificationFiles {
    fun file(filesDir: File,ownerID: String) = File(File(filesDir,"LocalVerification"),canonicalVerificationID(ownerID)+".json")
    fun purge(filesDir: File,ownerID: String) {
        val target = file(filesDir,ownerID)
        check(!target.exists() || target.delete()) { "Could not delete local notes" }
    }
}
internal fun localContext(check: CheckItem) = LocalRequestContext(check.id,check.requesterId,check.requesterName,check.reviewerId,check.reviewerName,check.category,check.description,check.status,check.updatedAt,check.recommendation,check.responseNote,check.respondedAt)

internal class LocalNotebookSession(private val archive: VerificationArchive,private var source: LocalRequestContext): ViewModel() {
    var draft by mutableStateOf<LocalVerificationRecord?>(null); private set
    var loadFailed by mutableStateOf(false); private set
    var actionFailed by mutableStateOf(false); private set
    var saved by mutableStateOf(false); private set
    init { reload() }
    fun reload() {
        runCatching {
            val existing = archive.load().firstOrNull { it.id == source.requestID }
            val next = (existing ?: LocalVerificationRecord(archive.ownerID,source)).capturing(source)
            draft = next; saved = existing == next
        }.onSuccess { loadFailed = false; actionFailed = false }.onFailure { loadFailed = true }
    }
    fun acceptFresh(context: LocalRequestContext) {
        source = context
        if(saved || draft == null) reload()
        else runCatching { draft = draft!!.capturing(context) }.onFailure { actionFailed = true }
    }
    fun save(): Boolean {
        val value = draft ?: return false
        if(loadFailed) return false
        return runCatching { archive.upsert(value) }.fold({ saved = true; actionFailed = false; true },{ actionFailed = true; saved = false; false })
    }
    private fun apply(action: (LocalVerificationRecord) -> LocalVerificationRecord): Boolean {
        if(loadFailed || draft == null) return false
        return runCatching { draft = action(draft!!); saved = false; save() }.getOrElse { actionFailed = true; false }
    }
    fun replace(question: VerificationQuestion) = apply { it.replacingQuestion(question) }
    fun removeQuestion(id: String) = apply { it.removingQuestion(id) }
    fun decide(choice: DecisionChoice,reason: String,confirmed: Boolean) = apply { it.deciding(choice,reason,confirmed,System.currentTimeMillis()) }
    fun capture(context: LocalRequestContext): Boolean {
        val result = apply { it.capturing(context) }
        if(draft?.context == runCatching { context.normalized() }.getOrNull()) source = context
        return result
    }
    fun delete(): Boolean {
        if(loadFailed || draft == null) return false
        return runCatching { archive.removeRecord(draft!!.id) }.fold({ draft = null; actionFailed = false; true },{ actionFailed = true; false })
    }
}
private class NotebookFactory(private val filesDir: File,private val ownerID: String,private val source: LocalRequestContext): ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T: ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(LocalNotebookSession::class.java))
        return LocalNotebookSession(VerificationArchive(LocalVerificationFiles.file(filesDir,ownerID),ownerID),source) as T
    }
}
private fun notebookText(de: Boolean,german: String,english: String) = if(de) german else english
private fun questionStatus(de: Boolean,value: QuestionStatus) = when(value) {
    QuestionStatus.OPEN -> notebookText(de,"Offen","Open")
    QuestionStatus.CHECKED -> notebookText(de,"Von mir geprüft","Checked by me")
    QuestionStatus.NOT_APPLICABLE -> notebookText(de,"Für mich nicht zutreffend","Not applicable to me")
}
private fun decisionChoice(de: Boolean,value: DecisionChoice) = when(value) {
    DecisionChoice.WAIT -> notebookText(de,"Warten","Wait")
    DecisionChoice.DECLINE -> notebookText(de,"Nicht fortfahren","Do not proceed")
    DecisionChoice.CLARIFY -> notebookText(de,"Selbst weiter klären","Clarify separately")
    DecisionChoice.PROCEED -> notebookText(de,"Fortfahren","Proceed")
}
private fun replyLabel(de: Boolean,value: String) = if(de) Recommendation.entries.firstOrNull { it.wireValue == value }?.label ?: value else mapOf("do_not_act" to "Do not act","verify_personally" to "Clarify personally first","plausible" to "Appears plausible","call_me" to "Call me now")[value] ?: value

@Composable internal fun LocalVerificationScreen(ownerID: String,check: CheckItem,isCurrentOwner: () -> Boolean,onRefresh: suspend () -> CheckItem?,onBack: () -> Unit) {
    val context = LocalContext.current
    val de = LocalConfiguration.current.locales[0].language == "de"
    fun l(german: String,english: String) = notebookText(de,german,english)
    val source = localContext(check)
    val factory = remember(ownerID,check.id) { NotebookFactory(context.filesDir,ownerID,source) }
    val session: LocalNotebookSession = viewModel(key = "local-notebook:$ownerID:${check.id}",factory = factory)
    LaunchedEffect(source) { session.acceptFresh(source) }
    var editingID by rememberSaveable(ownerID,check.id) { mutableStateOf<String?>(null) }
    var newID by rememberSaveable(ownerID,check.id) { mutableStateOf<String?>(null) }
    var deciding by rememberSaveable(ownerID,check.id) { mutableStateOf(false) }
    var deletingQuestion by rememberSaveable(ownerID,check.id) { mutableStateOf<String?>(null) }
    var deletingRecord by rememberSaveable(ownerID,check.id) { mutableStateOf(false) }
    var expandedID by rememberSaveable(ownerID,check.id) { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var accessFailed by rememberSaveable(ownerID,check.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val record = session.draft
    val failure = l("Nicht gespeichert. Prüfe Eingaben, Höchstgrenzen und lokalen Speicher. Dein Entwurf und bisher gespeicherte Daten bleiben erhalten. Falls eine andere Ansicht den Verlauf geändert hat, schließe diese Ansicht und öffne die Notizen erneut.","Not saved. Check inputs, limits and local storage. Your draft and previously saved data are retained. If another view changed the history, close this view and reopen the notes.")
    val allowed = isCurrentOwner() && !accessFailed
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).imePadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement = Arrangement.spacedBy(14.dp)) {
        TextButton(onClick = onBack) { Text(l("Zurück","Back")) }
        Text(l("Lokale Prüfnotizen","Local verification notes"),style = MaterialTheme.typography.headlineMedium)
        if(!allowed) Text(l("Die aktuelle Anmeldung oder Anfrage ist nicht mehr verfügbar.","The current account or request is no longer available."))
        else {
            Text(l("Nur auf diesem Gerät. Deine Prüfpunkte und Entscheidungen werden nicht gesendet. Rückmeldungen sind lokale Kopien bereits geladener Antworten.","Only on this device. Your questions and decisions are not sent. Replies are local copies of answers already loaded."))
            Text(l("Du entscheidest selbst. Keine Sicherheitsbewertung oder Identitätsprüfung durch diese Notizen.","You decide for yourself. These notes provide no safety verdict or identity verification."),style = MaterialTheme.typography.bodySmall)
            if(session.loadFailed) {
                Text(l("Lokale Notizen konnten nicht geladen werden. Die Datei bleibt erhalten; Speichern ist gesperrt.","Local notes could not be loaded. The file is preserved; saving is blocked."),color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = session::reload) { Text(l("Erneut laden","Retry loading")) }
            }
            if(record != null) {
                Text(l("Geladene Anfrage","Loaded request"),style = MaterialTheme.typography.titleLarge)
                Text(record.context.description)
                Text(l("Anfragende Person: ","Requester: ")+record.context.requesterName)
                Text(l("Zuständig: ","Assigned reviewer: ")+record.context.reviewerName)
                Text(l("Gemeldete Aktualisierung: ","Reported update: ")+record.context.updatedAt,style = MaterialTheme.typography.bodySmall)
                OutlinedButton(enabled = !refreshing,onClick = {
                    scope.launch {
                        refreshing = true
                        val fresh = onRefresh()
                        if(!isCurrentOwner() || fresh == null || fresh.requesterId != ownerID) accessFailed = true
                        else session.capture(localContext(fresh))
                        refreshing = false
                    }
                }) { Text(l("Aktuelle Anfrage lokal übernehmen","Capture current request locally")) }
                Text(l("Meine Prüfpunkte","My questions"),style = MaterialTheme.typography.titleLarge)
                record.questions.forEach { question ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp),verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(question.title,style = MaterialTheme.typography.titleMedium)
                            Text(questionStatus(de,question.status)); if(question.note.isNotEmpty()) Text(question.note)
                            TextButton(onClick = { editingID = question.id }) { Text(l("Bearbeiten","Edit")) }
                            TextButton(onClick = { deletingQuestion = question.id }) { Text(l("Entfernen","Remove")) }
                        }
                    }
                }
                OutlinedButton(enabled = record.questions.size < 25 && !session.loadFailed,onClick = { newID = UUID.randomUUID().toString() }) { Text(l("Prüfpunkt hinzufügen","Add question")) }
                Text(l("Bis zu 25 persönliche Prüfpunkte. „Von mir geprüft“ beschreibt nur deine eigene Eingabe.","Up to 25 personal questions. ‘Checked by me’ describes only your own entry."),style = MaterialTheme.typography.bodySmall)
                Text(l("Geladene Rückmeldungen · lokale Kopien","Loaded replies · local copies"),style = MaterialTheme.typography.titleLarge)
                if(record.replySnapshots.isEmpty()) Text(l("Noch keine Antwort übernommen.","No reply captured yet."))
                record.replySnapshots.forEach { reply ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp),verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(reply.reviewerName,style = MaterialTheme.typography.titleMedium); Text(replyLabel(de,reply.recommendation)); Text(reply.note); Text(reply.respondedAt,style = MaterialTheme.typography.bodySmall) } }
                }
                Text(l("Antworten werden hier nicht bearbeitet oder als neue Nachricht versendet.","Replies are not edited here or sent as a new message."),style = MaterialTheme.typography.bodySmall)
                Text(l("Meine Entscheidung","My decision"),style = MaterialTheme.typography.titleLarge)
                record.currentDecision?.let { Text(decisionChoice(de,it.choice),style = MaterialTheme.typography.titleMedium); Text(it.reason) }
                    ?: Text(l("Zum aktuellen Inhalt ist keine eigene Entscheidung festgehalten. Frühere Entscheidungen bleiben im Verlauf.","No decision is recorded for the current content. Earlier decisions remain in the history."))
                Text(l("Offene Prüfpunkte: ","Open questions: ")+record.questions.count { it.status == QuestionStatus.OPEN })
                OutlinedButton(enabled = record.questions.isNotEmpty() && record.decisions.size < 20 && !session.loadFailed,onClick = { deciding = true }) { Text(l("Eigene Entscheidung festhalten","Record my decision")) }
                Text(l("Bis zu 20 Einträge. Änderungen übernehmen keine frühere Entscheidung automatisch.","Up to 20 entries. Changes never inherit an earlier decision automatically."),style = MaterialTheme.typography.bodySmall)
                Text(l("Entscheidungsverlauf","Decision history"),style = MaterialTheme.typography.titleLarge)
                record.decisions.reversed().forEach { decision ->
                    OutlinedButton(modifier = Modifier.fillMaxWidth(),onClick = { expandedID = if(expandedID == decision.id) null else decision.id }) { Text("${decision.number}. ${decisionChoice(de,decision.choice)} · ${if(record.currentDecision?.id == decision.id) l("Aktuell","Current") else l("Historisch","Historical")}") }
                    if(expandedID == decision.id) {
                        Text(decision.reason); Text(DateFormat.getDateTimeInstance().format(Date(decision.at))); Text(decision.context.description)
                        decision.questions.forEach { Text(it.title+" · "+questionStatus(de,it.status)+"\n"+it.note) }
                        VerificationReply.from(decision.context)?.let { Text(it.reviewerName+" · "+replyLabel(de,it.recommendation)); Text(it.note) }
                    }
                }
                Button(onClick = { if(isCurrentOwner()) session.save() },enabled = !session.loadFailed) { Text(l("Lokal speichern","Save locally")) }
                Text(if(session.saved) l("Lokal gespeichert","Saved locally") else l("Aktueller Entwurf noch nicht gespeichert","Current draft is not saved yet"))
                OutlinedButton(enabled = session.saved && !session.loadFailed,onClick = {
                    if(isCurrentOwner()) context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT,record.report(de)) },l("Sachliches Protokoll teilen","Share factual record")))
                }) { Text(l("Sachliches Protokoll teilen","Share factual record")) }
                TextButton(enabled = !session.loadFailed,onClick = { deletingRecord = true }) { Text(l("Nur diese lokalen Notizen löschen","Delete only these local notes")) }
            }
            if(session.actionFailed) Text(failure,color = MaterialTheme.colorScheme.error)
        }
    }
    val edit = record?.questions?.firstOrNull { it.id == editingID } ?: newID?.let { VerificationQuestion(id = it,title = "",note = "",status = QuestionStatus.OPEN) }
    if(allowed && edit != null) LocalQuestionDialog(edit,de,if(session.actionFailed) failure else null,onDismiss = { editingID = null; newID = null }) {
        if(isCurrentOwner() && session.replace(it)) { editingID = null; newID = null }
    }
    if(allowed && deciding) LocalDecisionDialog(de,if(session.actionFailed) failure else null,onDismiss = { deciding = false }) { choice,reason,confirmed -> if(isCurrentOwner() && session.decide(choice,reason,confirmed)) deciding = false }
    deletingQuestion?.let { id -> if(allowed) LocalDeleteDialog(de,l("Diesen Prüfpunkt aus dem aktuellen Entwurf entfernen?","Remove this question from the current draft?"),onDismiss = { deletingQuestion = null }) { if(isCurrentOwner()) session.removeQuestion(id); deletingQuestion = null } }
    if(allowed && deletingRecord) LocalDeleteDialog(de,l("Nur die lokalen Notizen löschen? Die ursprüngliche Anfrage bleibt bestehen.","Delete only local notes? The original request is kept."),onDismiss = { deletingRecord = false }) { if(isCurrentOwner() && session.delete()) onBack(); deletingRecord = false }
}

@Composable private fun LocalQuestionDialog(question: VerificationQuestion,de: Boolean,error: String?,onDismiss: () -> Unit,onSave: (VerificationQuestion) -> Unit) {
    fun l(german: String,english: String) = notebookText(de,german,english)
    var title by rememberSaveable(question.id) { mutableStateOf(question.title) }
    var note by rememberSaveable(question.id) { mutableStateOf(question.note) }
    var statusName by rememberSaveable(question.id) { mutableStateOf(question.status.name) }
    val value = runCatching { question.copy(title = title,note = note,status = QuestionStatus.valueOf(statusName)).normalized() }.getOrNull()
    AlertDialog(onDismissRequest = onDismiss,title = { Text(l("Prüfpunkt","Question")) },text = {
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding(),verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(title,{ title = it },label = { Text(l("Meine Frage","My question")) },modifier = Modifier.fillMaxWidth())
            OutlinedTextField(note,{ note = it },label = { Text(l("Meine Notiz / Quelle","My note / source")) },modifier = Modifier.fillMaxWidth())
            QuestionStatus.entries.forEach { item -> FilterChip(selected = statusName == item.name,onClick = { statusName = item.name },label = { Text(questionStatus(de,item)) }) }
            Text(l("Frage bis 300, Notiz bis 2.000 Zeichen. Nur lokal, wird nicht gesendet.","Question up to 300, note up to 2,000 characters. Local only; not sent."),style = MaterialTheme.typography.bodySmall)
            if(error != null) Text(error,color = MaterialTheme.colorScheme.error)
        }
    },dismissButton = { TextButton(onClick = onDismiss) { Text(l("Abbrechen","Cancel")) } },confirmButton = { TextButton(enabled = value != null,onClick = { value?.let(onSave) }) { Text(l("Speichern","Save")) } })
}
@Composable private fun LocalDecisionDialog(de: Boolean,error: String?,onDismiss: () -> Unit,onSave: (DecisionChoice,String,Boolean) -> Unit) {
    fun l(german: String,english: String) = notebookText(de,german,english)
    var choiceName by rememberSaveable { mutableStateOf(DecisionChoice.WAIT.name) }
    var reason by rememberSaveable { mutableStateOf("") }
    var confirmed by rememberSaveable { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onDismiss,title = { Text(l("Entscheidung festhalten","Record decision")) },text = {
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding(),verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DecisionChoice.entries.forEach { choice -> FilterChip(selected = choiceName == choice.name,onClick = { choiceName = choice.name },label = { Text(decisionChoice(de,choice)) }) }
            OutlinedTextField(reason,{ reason = it },label = { Text(l("Meine Begründung","My reason")) },modifier = Modifier.fillMaxWidth())
            Row { Checkbox(checked = confirmed,onCheckedChange = { confirmed = it }); Text(l("Das ist meine eigene Entscheidung. Die App gibt keine Sicherheitsbewertung ab.","This is my own decision. The app gives no safety verdict."),Modifier.weight(1f)) }
            Text(l("Auch offene Prüfpunkte bleiben offen. Frühere Einträge werden nicht verändert. Zeitangabe von diesem Gerät.","Open questions stay open. Earlier entries are not changed. Time comes from this device."),style = MaterialTheme.typography.bodySmall)
            if(error != null) Text(error,color = MaterialTheme.colorScheme.error)
        }
    },dismissButton = { TextButton(onClick = onDismiss) { Text(l("Abbrechen","Cancel")) } },confirmButton = { TextButton(enabled = confirmed && reason.isNotBlank() && reason.codePointCount(0,reason.length) <= 2000,onClick = { onSave(DecisionChoice.valueOf(choiceName),reason,confirmed) }) { Text(l("Speichern","Save")) } })
}
@Composable private fun LocalDeleteDialog(de: Boolean,title: String,onDismiss: () -> Unit,onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss,title = { Text(title) },dismissButton = { TextButton(onClick = onDismiss) { Text(notebookText(de,"Abbrechen","Cancel")) } },confirmButton = { TextButton(onClick = onConfirm) { Text(notebookText(de,"Entfernen","Remove")) } })
}
