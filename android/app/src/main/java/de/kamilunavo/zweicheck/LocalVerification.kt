package de.kamilunavo.zweicheck

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal fun canonicalVerificationID(value: String): String {
    val id = UUID.fromString(value).toString()
    require(id.equals(value,ignoreCase = true)); return id
}
private fun bounded(value: String,count: Int,required: Boolean = false) = value.codePointCount(0,value.length) <= count && (!required || value.isNotBlank())
private val recommendations = setOf("do_not_act","verify_personally","plausible","call_me")

data class LocalRequestContext(
    val requestID: String,val requesterID: String,val requesterName: String,val reviewerID: String,val reviewerName: String,
    val category: String,val description: String,val status: String,val updatedAt: String,
    val recommendation: String?,val responseNote: String?,val respondedAt: String?,
) {
    fun normalized(): LocalRequestContext {
        require(bounded(requesterName,200,true) && bounded(reviewerName,200,true) && bounded(category,100,true) && bounded(description,10000) && bounded(status,100,true) && bounded(updatedAt,100,true))
        require(responseNote?.let { bounded(it,10000) } != false && respondedAt?.let { bounded(it,100,true) } != false)
        if(recommendation != null) require(recommendation in recommendations && respondedAt != null)
        else require(responseNote == null && respondedAt == null)
        return copy(requestID = canonicalVerificationID(requestID),requesterID = canonicalVerificationID(requesterID),reviewerID = canonicalVerificationID(reviewerID))
    }
}
enum class QuestionStatus { OPEN,CHECKED,NOT_APPLICABLE }
enum class DecisionChoice { WAIT,DECLINE,CLARIFY,PROCEED }
data class VerificationQuestion(val id: String = UUID.randomUUID().toString(),val title: String,val note: String,val status: QuestionStatus) {
    fun normalized(): VerificationQuestion {
        val result = copy(id = canonicalVerificationID(id),title = title.trim())
        require(bounded(result.title,300,true) && bounded(note,2000)); return result
    }
}
data class VerificationReply(val requestID: String,val requesterID: String,val reviewerID: String,val reviewerName: String,val recommendation: String,val note: String,val respondedAt: String) {
    companion object {
        fun from(context: LocalRequestContext): VerificationReply? = context.recommendation?.let { recommendation -> context.respondedAt?.let { time -> VerificationReply(context.requestID,context.requesterID,context.reviewerID,context.reviewerName,recommendation,context.responseNote ?: "",time) } }
    }
    fun validate(ownerID: String,requestID: String) {
        require(this.requestID == requestID && requesterID == ownerID && canonicalVerificationID(reviewerID) == reviewerID && bounded(reviewerName,200,true) && bounded(note,10000) && bounded(respondedAt,100,true) && recommendation in recommendations)
    }
}
data class VerificationDecision(val id: String,val number: Int,val choice: DecisionChoice,val reason: String,val at: Long,val context: LocalRequestContext,val questions: List<VerificationQuestion>)
data class LocalVerificationRecord private constructor(
    val ownerID: String,val context: LocalRequestContext,val questions: List<VerificationQuestion>,
    val replySnapshots: List<VerificationReply>,val decisions: List<VerificationDecision>,
) {
    constructor(ownerID: String,context: LocalRequestContext): this(canonicalVerificationID(ownerID),context.normalized(),emptyList(),listOfNotNull(VerificationReply.from(context.normalized())),emptyList())
    init { validate() }
    val id: String get() = context.requestID
    val currentDecision: VerificationDecision? get() = decisions.lastOrNull()?.takeIf { it.context == context && it.questions == questions }
    private fun validateQuestions(values: List<VerificationQuestion>) {
        require(values.size <= 25 && values.map { it.id }.toSet().size == values.size && values.all { it.normalized() == it })
    }
    fun validate() {
        require(canonicalVerificationID(ownerID) == ownerID && context.normalized() == context && context.requesterID == ownerID && replySnapshots.size <= 20 && decisions.size <= 20 && decisions.map { it.id }.toSet().size == decisions.size)
        validateQuestions(questions)
        replySnapshots.forEach { it.validate(ownerID,id) }
        decisions.forEachIndexed { index,value ->
            require(canonicalVerificationID(value.id) == value.id && value.number == index+1 && bounded(value.reason,2000,true) && value.context.normalized() == value.context && value.context.requesterID == ownerID && value.context.requestID == id && value.questions.isNotEmpty())
            validateQuestions(value.questions)
        }
    }
    fun replacingQuestion(question: VerificationQuestion): LocalVerificationRecord {
        validate(); val value = question.normalized()
        val exists = questions.any { it.id == value.id }; require(exists || questions.size < 25)
        return copy(questions = if(exists) questions.map { if(it.id == value.id) value else it } else questions+value)
    }
    fun removingQuestion(id: String): LocalVerificationRecord {
        validate(); val key = canonicalVerificationID(id); return copy(questions = questions.filterNot { it.id == key })
    }
    fun capturing(context: LocalRequestContext): LocalVerificationRecord {
        validate(); val value = context.normalized(); require(value.requestID == id && value.requesterID == ownerID)
        val reply = VerificationReply.from(value)
        val snapshots = if(reply != null && replySnapshots.lastOrNull() != reply) { require(replySnapshots.size < 20); replySnapshots+reply } else replySnapshots
        return copy(context = value,replySnapshots = snapshots)
    }
    fun deciding(choice: DecisionChoice,reason: String,confirmed: Boolean,at: Long): LocalVerificationRecord {
        validate(); val text = reason.trim(); require(confirmed && questions.isNotEmpty() && bounded(text,2000,true))
        if(currentDecision?.let { it.choice == choice && it.reason == text } == true) return this
        require(decisions.size < 20)
        return copy(decisions = decisions+VerificationDecision(UUID.randomUUID().toString(),decisions.size+1,choice,text,at,context.copy(),questions.map { it.copy() }))
    }
    fun report(german: Boolean): String {
        fun l(de: String,en: String) = if(german) de else en
        fun q(text: String) = JSONObject.quote(text)
        fun questionLines(values: List<VerificationQuestion>) = values.mapIndexed { index,item -> "${index+1}. [${item.status.name.lowercase(Locale.ROOT)}] ${q(item.title)} · ${q(item.note)}" }
        fun source(value: LocalRequestContext) = listOf(l("Anfrage: ","Request: ")+value.requestID,l("Anfragende Person: ","Requester: ")+q(value.requesterName),l("Beschreibung: ","Description: ")+q(value.description),l("Anfragestatus: ","Request status: ")+q(value.status),l("Gemeldete Aktualisierung: ","Reported update: ")+q(value.updatedAt))
        val lines = mutableListOf(l("LOKALE PRÜFNOTIZEN","LOCAL VERIFICATION NOTES"),l("Nur auf diesem Gerät. Prüfpunkte und Entscheidungen wurden nicht gesendet. Keine Sicherheitsbewertung oder Identitätsprüfung.","Only on this device. Questions and decisions were not sent. This is no safety verdict or identity verification."),l("Konto: ","Account: ")+ownerID)
        lines += source(context); lines += listOf("",l("MEINE PRÜFPUNKTE","MY QUESTIONS")); lines += questionLines(questions)
        lines += listOf("",l("GELADENE RÜCKMELDUNGEN (LOKALE KOPIEN)","LOADED REPLIES (LOCAL COPIES)"))
        replySnapshots.forEach { reply -> lines += listOf(l("Antwort von: ","Reply from: ")+q(reply.reviewerName)+" [${reply.reviewerID}]",l("Empfehlung: ","Recommendation: ")+q(reply.recommendation),l("Originalnotiz: ","Original note: ")+q(reply.note),l("Gemeldete Antwortzeit: ","Reported reply time: ")+q(reply.respondedAt)) }
        lines += listOf("",l("MEINE ENTSCHEIDUNGEN","INITIATOR DECISIONS"),if(currentDecision == null) l("Aktueller Inhalt ohne zugeordnete eigene Entscheidung.","Current content has no associated initiator decision.") else l("Eigene Entscheidung zum aktuellen lokalen Inhalt vorhanden.","Initiator decision for current local content is recorded."))
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }
        decisions.forEach { decision ->
            lines += listOf("","${l("Entscheidung","Initiator decision")} ${decision.number} · ${if(currentDecision?.id == decision.id) l("Aktuell","Current") else l("Historisch","Historical")}",q(decision.choice.name.lowercase(Locale.ROOT)),q(decision.reason),l("Lokale Gerätezeit: ","Local device time: ")+date.format(Date(decision.at)))
            lines += source(decision.context); lines += questionLines(decision.questions)
            VerificationReply.from(decision.context)?.let { lines += listOf(l("Zugehörige Rückmeldung von: ","Associated reply from: ")+q(it.reviewerName),q(it.recommendation),q(it.note),q(it.respondedAt)) }
        }
        return lines.joinToString("\n")
    }
    companion object {
        internal fun restored(ownerID: String,context: LocalRequestContext,questions: List<VerificationQuestion>,replies: List<VerificationReply>,decisions: List<VerificationDecision>) = LocalVerificationRecord(ownerID,context,questions.toList(),replies.toList(),decisions.toList())
    }
}

class VerificationArchive(val file: File,ownerID: String) {
    val ownerID = canonicalVerificationID(ownerID)
    fun load(): List<LocalVerificationRecord> {
        if(!file.exists()) return emptyList()
        require(file.length() <= 10*1024*1024)
        val bytes = file.readBytes(); require(bytes.size <= 10*1024*1024)
        val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        val token = JSONTokener(text); val root = token.nextValue(); require(root is JSONObject && token.nextClean() == 0.toChar())
        require(root.long("schemaVersion") == 1L && root.string("ownerID") == ownerID)
        return root.getJSONArray("records").objects(::decodeRecord).also(::validate)
    }
    fun save(records: List<LocalVerificationRecord>) {
        load(); validate(records)
        val bytes = JSONObject().put("schemaVersion",1).put("ownerID",ownerID).put("records",jsonArray(records,::encodeRecord)).toString().toByteArray(Charsets.UTF_8)
        require(bytes.size <= 10*1024*1024)
        val parent = file.absoluteFile.parentFile!!; require(parent.isDirectory || parent.mkdirs())
        val temporary = File.createTempFile("verification-",".tmp",parent)
        try {
            FileOutputStream(temporary).use { it.write(bytes); it.fd.sync() }
            Files.move(temporary.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)
        } finally { temporary.delete() }
    }
    fun upsert(record: LocalVerificationRecord): List<LocalVerificationRecord> {
        val current = load(); require(record.ownerID == ownerID); record.validate()
        current.firstOrNull { it.id == record.id }?.let { stored ->
            require(record.decisions.take(stored.decisions.size) == stored.decisions && record.replySnapshots.take(stored.replySnapshots.size) == stored.replySnapshots) { "History changed in another local view" }
        }
        return (current.filterNot { it.id == record.id }+record).also(::save)
    }
    fun removeRecord(requestID: String): List<LocalVerificationRecord> {
        val id = canonicalVerificationID(requestID)
        return load().filterNot { it.id == id }.also(::save)
    }
    private fun validate(records: List<LocalVerificationRecord>) {
        require(records.size <= 100 && records.map { it.id }.toSet().size == records.size)
        records.forEach { require(it.ownerID == ownerID); it.validate() }
    }
}
private fun JSONObject.string(key: String): String { val value = get(key); require(value is String); return value }
private fun JSONObject.optional(key: String): String? = if(!has(key) || isNull(key)) null else string(key)
private fun JSONObject.long(key: String): Long { val value = get(key); require(value is Number); return BigDecimal(value.toString()).longValueExact() }
private fun <T> JSONArray.objects(decode: (JSONObject) -> T): List<T> = (0 until length()).map { decode(getJSONObject(it)) }
private fun <T> jsonArray(values: List<T>,encode: (T) -> JSONObject) = JSONArray().apply { values.forEach { put(encode(it)) } }
private fun encodeContext(v: LocalRequestContext) = JSONObject().put("requestID",v.requestID).put("requesterID",v.requesterID).put("requesterName",v.requesterName).put("reviewerID",v.reviewerID).put("reviewerName",v.reviewerName).put("category",v.category).put("description",v.description).put("status",v.status).put("updatedAt",v.updatedAt).apply { v.recommendation?.let { put("recommendation",it) }; v.responseNote?.let { put("responseNote",it) }; v.respondedAt?.let { put("respondedAt",it) } }
private fun decodeContext(v: JSONObject) = LocalRequestContext(v.string("requestID"),v.string("requesterID"),v.string("requesterName"),v.string("reviewerID"),v.string("reviewerName"),v.string("category"),v.string("description"),v.string("status"),v.string("updatedAt"),v.optional("recommendation"),v.optional("responseNote"),v.optional("respondedAt"))
private fun encodeQuestion(v: VerificationQuestion) = JSONObject().put("id",v.id).put("title",v.title).put("note",v.note).put("status",v.status.name)
private fun decodeQuestion(v: JSONObject) = VerificationQuestion(v.string("id"),v.string("title"),v.string("note"),QuestionStatus.valueOf(v.string("status")))
private fun encodeReply(v: VerificationReply) = JSONObject().put("requestID",v.requestID).put("requesterID",v.requesterID).put("reviewerID",v.reviewerID).put("reviewerName",v.reviewerName).put("recommendation",v.recommendation).put("note",v.note).put("respondedAt",v.respondedAt)
private fun decodeReply(v: JSONObject) = VerificationReply(v.string("requestID"),v.string("requesterID"),v.string("reviewerID"),v.string("reviewerName"),v.string("recommendation"),v.string("note"),v.string("respondedAt"))
private fun encodeDecision(v: VerificationDecision) = JSONObject().put("id",v.id).put("number",v.number).put("choice",v.choice.name).put("reason",v.reason).put("at",v.at).put("context",encodeContext(v.context)).put("questions",jsonArray(v.questions,::encodeQuestion))
private fun decodeDecision(v: JSONObject): VerificationDecision {
    val number = v.long("number"); require(number in 1L..20L)
    return VerificationDecision(v.string("id"),number.toInt(),DecisionChoice.valueOf(v.string("choice")),v.string("reason"),v.long("at"),decodeContext(v.getJSONObject("context")),v.getJSONArray("questions").objects(::decodeQuestion))
}
private fun encodeRecord(v: LocalVerificationRecord) = JSONObject().put("ownerID",v.ownerID).put("context",encodeContext(v.context)).put("questions",jsonArray(v.questions,::encodeQuestion)).put("replySnapshots",jsonArray(v.replySnapshots,::encodeReply)).put("decisions",jsonArray(v.decisions,::encodeDecision))
private fun decodeRecord(v: JSONObject) = LocalVerificationRecord.restored(v.string("ownerID"),decodeContext(v.getJSONObject("context")),v.getJSONArray("questions").objects(::decodeQuestion),v.getJSONArray("replySnapshots").objects(::decodeReply),v.getJSONArray("decisions").objects(::decodeDecision))
