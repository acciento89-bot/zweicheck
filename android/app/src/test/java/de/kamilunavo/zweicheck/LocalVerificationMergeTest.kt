package de.kamilunavo.zweicheck

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class LocalVerificationMergeTest {
    @Test fun staleRequestEditorPreservesOtherRequestAndCannotEraseNewHistory() {
        val owner = "00000000-0000-4000-8000-000000000001"
        val folder = Files.createTempDirectory("zweicheck-merge").toFile()
        try {
            val file = File(folder,"records.json")
            val first = VerificationArchive(file,owner); val second = VerificationArchive(file,owner)
            val context = LocalRequestContext("00000000-0000-4000-8000-000000000003",owner,"Initiator","00000000-0000-4000-8000-000000000002","Alex","message","A","open","2026-10-21T08:00:00Z",null,null,null)
            var a = LocalVerificationRecord(owner,context)
            val b = LocalVerificationRecord(owner,context.copy(requestID = "00000000-0000-4000-8000-000000000004",description = "B"))
            first.load(); second.load()
            first.upsert(a); second.upsert(b)
            a = a.replacingQuestion(VerificationQuestion(title = "A edited",note = "",status = QuestionStatus.OPEN))
            val merged = first.upsert(a)
            assertEquals(2,merged.size); assertTrue(merged.contains(a)); assertTrue(merged.contains(b))
            assertEquals(listOf(a),second.removeRecord(b.id))
            val historical = a.deciding(DecisionChoice.WAIT,"Another editor recorded this",true,1000L)
            second.upsert(historical)
            val bytes = file.readBytes()
            try { first.upsert(a); fail("Stale editor must not erase recorded decisions") } catch(expected: Exception) {}
            assertArrayEquals(bytes,file.readBytes())
            try { VerificationArchive(file,"00000000-0000-4000-8000-000000000005").upsert(a); fail("Wrong owner") } catch(expected: Exception) {}
            assertArrayEquals(bytes,file.readBytes())
        } finally { folder.deleteRecursively() }
    }
}
