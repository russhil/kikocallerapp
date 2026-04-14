package com.kikocall.native_modules

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.core.content.ContextCompat

object PhoneUtil {

    fun normalize(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val digits = raw.replace(Regex("[^0-9]"), "")
        return when {
            digits.length == 10 -> digits
            digits.length == 12 && digits.startsWith("91") -> digits.substring(2)
            digits.length == 13 && digits.startsWith("091") -> digits.substring(3)
            else -> digits.takeIf { it.isNotEmpty() }
        }
    }

    fun lookupContactName(context: Context, phone: String?): String? {
        if (phone.isNullOrBlank()) return null
        val hasContactsPerm = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasContactsPerm) return null
        return try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phone)
            )
            context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    cursor.getString(0)?.takeIf { it.isNotBlank() }
                } else null
            }
        } catch (e: Exception) {
            null
        }
    }
}
