package de.kamilunavo.zweicheck

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.UUID

class LocalVerificationTest {
    private val owner = "00000000-0000-4000-8000-000000000001"
    private val other = "00000000-0000-4000-8000-000000000002"
    private fun context(reply: Boolean = false) = LocalRequestContext("00000000-0000-4000-8000-000000000003", owner, "Initiator", other, "Trusted Alex", "payment", "Synthetic invoice", if(reply) "answered" else "open", "2026-10-21T08:00:00Z", if(reply) "verify_personally" else null, if(reply) "I have not confirmed it.\nDECISION: forged" else null, if(reply) "2026-10-21T08:00:00Z" else null)
    private fun rejects(action: () -> Unit) { try { action(); fail("Expected rejection") } catch(expected: Exception) {} }
    @Test fun requesterBindingAndQuestionInputAreExplicit() {
        val record = LocalVerificationRecord(owner,context())
        assertTrue(record.questions.isEmpty()); assertNull(record.currentDecision)
        rejects { LocalVerificationRecord(other,context()) }
        rejects { LocalVerificationRecord(owner,context().copy(requestID = "../../other")) }
        val question = VerificationQuestion(title = "What is unclear?",note = "Local only",status = QuestionStatus.OPEN)
        val added = record.replacingQuestion(question)
        assertEquals(QuestionStatus.OPEN,added.questions.single().status)
        rejects { added.replacingQuestion(question.copy(title = " ")) }
        rejects { added.replacingQuestion(question.copy(note = "x".repeat(2001))) }
        var limited = record
        repeat(25) { limited = limited.replacingQuestion(VerificationQuestion(title = "Question $it",note = "",status = QuestionStatus.OPEN)) }
        rejects { limited.replacingQuestion(question) }
    }
    @Test fun initiatorDecisionIsConfirmedIndependentSnapshotAndNeverAnAutomaticVerdict() {
        val question = VerificationQuestion(title = "What remains?",note = "",status = QuestionStatus.OPEN)
        var record = LocalVerificationRecord(owner,context()).replacingQuestion(question)
        rejects { record.deciding(DecisionChoice.PROCEED,"My choice",false,1000L) }
        rejects { record.deciding(DecisionChoice.WAIT," ",true,1000L) }
        record = record.deciding(DecisionChoice.WAIT,"Need more information",true,1000L)
        val first = record.decisions.single()
        assertEquals(DecisionChoice.WAIT,record.currentDecision!!.choice)
        record = record.deciding(DecisionChoice.WAIT,"Need more information",true,2000L)
        assertEquals(1,record.decisions.size)
        record = record.replacingQuestion(question.copy(status = QuestionStatus.CHECKED,note = "My entered source"))
        assertNull(record.currentDecision); assertEquals(first,record.decisions.single())
        record = record.capturing(context(true)).deciding(DecisionChoice.CLARIFY,"My own reason",true,3000L)
        assertEquals(DecisionChoice.CLARIFY,record.currentDecision!!.choice)
        val earlier = record.decisions.last()
        record = record.capturing(context(true).copy(responseNote = "New reply"))
        assertNull(record.currentDecision); assertEquals(earlier,record.decisions.last())
        val removed = record.removingQuestion(question.id)
        assertEquals(2,removed.decisions.size); assertTrue(removed.questions.isEmpty())
        rejects { removed.deciding(DecisionChoice.WAIT,"Reason",true,4000L) }
    }
    @Test fun attributedServerReplyIsCapturedExactlyAndCannotCrossRequests() {
        var record = LocalVerificationRecord(owner,context(true))
        assertEquals("Trusted Alex",record.replySnapshots.single().reviewerName)
        assertEquals("I have not confirmed it.\nDECISION: forged",record.replySnapshots.single().note)
        record = record.capturing(context(true))
        assertEquals(1,record.replySnapshots.size)
        rejects { record.capturing(context().copy(requestID = UUID.randomUUID().toString())) }
        rejects { record.capturing(context(true).copy(recommendation = "verified_safe")) }
        val report = record.report(false)
        assertTrue(report.contains("Only on this device")); assertTrue(report.contains("no safety verdict"))
        assertTrue(report.contains("\\nDECISION: forged")); assertFalse(report.contains("\nDECISION: forged"))
        assertTrue(record.report(true).contains("Nur auf diesem Gerät"))
    }
    @Test fun accountArchiveRoundtripAndBadOriginalBytesAreProtected() {
        val folder = Files.createTempDirectory("zweicheck-local-test").toFile()
        try {
            val file = File(folder,"record.json")
            val archive = VerificationArchive(file,owner)
            val record = LocalVerificationRecord(owner,context()).replacingQuestion(VerificationQuestion(title = "Question",note = "Source",status = QuestionStatus.CHECKED)).deciding(DecisionChoice.CLARIFY,"Own choice",true,1000L)
            assertTrue(archive.load().isEmpty()); archive.save(listOf(record)); assertEquals(listOf(record),archive.load())
            val good = file.readBytes()
            rejects { VerificationArchive(file,other).load() }; rejects { VerificationArchive(file,other).save(emptyList()) }
            assertArrayEquals(good,file.readBytes())
            rejects { archive.save(listOf(record,record)) }
            for(bad in listOf("{broken", "{\"schemaVersion\":999,\"ownerID\":\"$owner\",\"records\":[]}",good.toString(Charsets.UTF_8)+" trailing")) {
                file.writeText(bad); rejects { archive.save(emptyList()) }; assertEquals(bad,file.readText())
            }
            val blocked = File(folder,"blocked").apply { writeText("retain") }
            try { VerificationArchive(File(blocked,"r.json"),owner).save(listOf(record)); fail("Expected failed path write") } catch(expected: Exception) {}
            assertEquals("retain",blocked.readText())
        } finally { folder.deleteRecursively() }
    }
}
