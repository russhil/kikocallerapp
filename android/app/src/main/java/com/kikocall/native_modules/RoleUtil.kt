package com.kikocall.native_modules

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

object RoleUtil {
    private const val TAG = "RoleUtil"
    const val ROLE_REQUEST_CODE = 8421

    fun hasScreeningRole(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val rm = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager ?: return false
            rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) &&
                rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        } catch (e: Exception) {
            Log.w(TAG, "hasScreeningRole failed", e)
            false
        }
    }

    fun isScreeningRoleAvailable(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val rm = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager ?: return false
            rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)
        } catch (e: Exception) {
            false
        }
    }

    fun requestScreeningRole(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val rm = activity.getSystemService(Context.ROLE_SERVICE) as? RoleManager ?: return false
            if (!rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
                Log.w(TAG, "ROLE_CALL_SCREENING not available on this device")
                return false
            }
            if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                Log.d(TAG, "Screening role already held")
                return true
            }
            val intent: Intent = rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
            activity.startActivityForResult(intent, ROLE_REQUEST_CODE)
            true
        } catch (e: Exception) {
            Log.e(TAG, "requestScreeningRole failed", e)
            false
        }
    }
}
