package com.kikocall.native_modules

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

data class CallEvent(
    var phone: String?,
    var direction: String,
    val callStartMs: Long,
    var callAnsweredMs: Long? = null,
    var callEndMs: Long? = null,
    var source: String,
    var finalized: Boolean = false
) {
    fun toJson(): JSONObject = JSONObject().apply {
        if (phone != null) put("phone", phone) else put("phone", JSONObject.NULL)
        put("direction", direction)
        put("callStartMs", callStartMs)
        if (callAnsweredMs != null) put("callAnsweredMs", callAnsweredMs) else put("callAnsweredMs", JSONObject.NULL)
        if (callEndMs != null) put("callEndMs", callEndMs) else put("callEndMs", JSONObject.NULL)
        put("source", source)
        put("finalized", finalized)
    }

    companion object {
        fun fromJson(o: JSONObject): CallEvent = CallEvent(
            phone = if (o.isNull("phone")) null else o.optString("phone").takeIf { it.isNotEmpty() },
            direction = o.optString("direction", "UNKNOWN"),
            callStartMs = o.optLong("callStartMs", 0L),
            callAnsweredMs = if (o.isNull("callAnsweredMs")) null else o.optLong("callAnsweredMs"),
            callEndMs = if (o.isNull("callEndMs")) null else o.optLong("callEndMs"),
            source = o.optString("source", "UNKNOWN"),
            finalized = o.optBoolean("finalized", false)
        )
    }
}

object CallEventStore {
    private const val TAG = "CallEventStore"
    private const val PREFS = "kikocall_call_events"
    private const val KEY = "events_json"
    private const val MAX_SIZE = 50
    private const val MATCH_TOLERANCE_MS = 180_000L
    private const val IN_PROGRESS_WINDOW_MS = 5 * 60 * 1000L
    private const val STALE_UNFINALIZED_TTL_MS = 30 * 60 * 1000L

    private val lock = ReentrantReadWriteLock()
    private val inMemory: ArrayDeque<CallEvent> = ArrayDeque()

    @Volatile
    private var initialized = false

    fun init(context: Context) {
        if (initialized) return
        lock.write {
            if (initialized) return
            try {
                val raw = prefs(context).getString(KEY, null)
                if (!raw.isNullOrEmpty()) {
                    val arr = JSONArray(raw)
                    for (i in 0 until arr.length()) {
                        inMemory.addLast(CallEvent.fromJson(arr.getJSONObject(i)))
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to rehydrate call events", e)
                inMemory.clear()
            }
            initialized = true
        }
    }

    fun beginIncoming(context: Context, phone: String?, startMs: Long, source: String): CallEvent {
        init(context)
        val normalized = PhoneUtil.normalize(phone)
        lock.write {
            reapStaleUnfinalized(startMs)
            // If an unfinalized event exists within the last ~5 minutes, update it instead of creating a new one.
            val recent = inMemory.lastOrNull()
            if (recent != null && !recent.finalized && (startMs - recent.callStartMs) < IN_PROGRESS_WINDOW_MS) {
                if (recent.phone.isNullOrBlank() && !normalized.isNullOrBlank()) recent.phone = normalized
                // Prefer earliest source winning; don't overwrite SCREENING with PHONE_STATE
                if (recent.source == "PHONE_STATE_BROADCAST" && source == "SCREENING") recent.source = source
                persist(context)
                return recent
            }
            val ev = CallEvent(
                phone = normalized,
                direction = "INCOMING",
                callStartMs = startMs,
                source = source
            )
            inMemory.addLast(ev)
            while (inMemory.size > MAX_SIZE) inMemory.removeFirst()
            persist(context)
            Log.d(TAG, "beginIncoming: phone=$normalized source=$source total=${inMemory.size}")
            return ev
        }
    }

    /** Treat unfinalized events older than TTL as implicitly finalized so they don't accumulate. */
    private fun reapStaleUnfinalized(now: Long) {
        for (ev in inMemory) {
            if (!ev.finalized && (now - ev.callStartMs) > STALE_UNFINALIZED_TTL_MS) {
                ev.finalized = true
                if (ev.callEndMs == null) ev.callEndMs = ev.callStartMs + STALE_UNFINALIZED_TTL_MS
            }
        }
    }

    fun markAnswered(context: Context, ts: Long) {
        init(context)
        lock.write {
            val ev = inMemory.lastOrNull { !it.finalized }
            if (ev != null) {
                ev.callAnsweredMs = ts
                persist(context)
            }
        }
    }

    fun markEnded(context: Context, ts: Long, direction: String? = null): CallEvent? {
        init(context)
        var result: CallEvent? = null
        lock.write {
            val ev = inMemory.lastOrNull { !it.finalized }
            if (ev != null) {
                ev.callEndMs = ts
                ev.finalized = true
                if (direction != null) ev.direction = direction
                persist(context)
                result = ev
                Log.d(TAG, "markEnded: phone=${ev.phone} direction=${ev.direction} source=${ev.source}")
            } else if (direction == "OUTGOING") {
                // Outgoing call we didn't see RINGING for — record a stub
                val stub = CallEvent(
                    phone = null,
                    direction = "OUTGOING",
                    callStartMs = ts - 1000L,
                    callEndMs = ts,
                    source = "TELEPHONY",
                    finalized = true
                )
                inMemory.addLast(stub)
                while (inMemory.size > MAX_SIZE) inMemory.removeFirst()
                persist(context)
                result = stub
            }
        }
        return result
    }

    fun updatePhoneIfMissing(context: Context, phone: String?) {
        if (phone.isNullOrBlank()) return
        init(context)
        val normalized = PhoneUtil.normalize(phone) ?: return
        lock.write {
            val ev = inMemory.lastOrNull { !it.finalized }
            if (ev != null && ev.phone.isNullOrBlank()) {
                ev.phone = normalized
                persist(context)
            }
        }
    }

    fun findNearest(ts: Long): CallEvent? {
        lock.read {
            if (inMemory.isEmpty()) return null
            var best: CallEvent? = null
            var bestDelta = Long.MAX_VALUE
            for (ev in inMemory) {
                // Skip stale unfinalized events older than the TTL; they are likely orphaned.
                if (!ev.finalized && (ts - ev.callStartMs) > STALE_UNFINALIZED_TTL_MS) continue
                val reference = ev.callEndMs ?: ev.callAnsweredMs ?: ev.callStartMs
                val delta = kotlin.math.abs(reference - ts)
                if (delta < bestDelta) {
                    bestDelta = delta
                    best = ev
                }
            }
            return if (bestDelta <= MATCH_TOLERANCE_MS) best else null
        }
    }

    fun snapshot(): List<CallEvent> {
        lock.read {
            return inMemory.toList()
        }
    }

    fun clearAll(context: Context) {
        lock.write {
            inMemory.clear()
            prefs(context).edit().remove(KEY).apply()
        }
    }

    private fun persist(context: Context) {
        val arr = JSONArray().apply { inMemory.forEach { put(it.toJson()) } }
        prefs(context).edit().putString(KEY, arr.toString()).apply()
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
