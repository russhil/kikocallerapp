package com.kikocall.native_modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.util.Log

class SMSReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (SmsRetriever.SMS_RETRIEVED_ACTION == intent.action) {
            val extras = intent.extras
            val status = extras?.get(SmsRetriever.EXTRA_STATUS) as Status

            when (status.statusCode) {
                CommonStatusCodes.SUCCESS -> {
                    val message = extras.get(SmsRetriever.EXTRA_SMS_MESSAGE) as String
                    Log.d("SMSReceiver", "OTP Message received: $message")
                    
                    // Extract 6-digit OTP
                    val otp = Regex("(\\d{6})").find(message)?.value
                    if (otp != null) {
                        try {
                            val reactContext = (context.applicationContext as? com.facebook.react.ReactApplication)?.reactNativeHost?.reactInstanceManager?.currentReactContext
                            reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                ?.emit("onOTPReceived", otp)
                        } catch (e: Exception) {
                            Log.e("SMSReceiver", "Failed to emit OTP event", e)
                        }
                    }
                }
                CommonStatusCodes.TIMEOUT -> {
                    Log.d("SMSReceiver", "SMS Retriever timed out")
                }
            }
        }
    }
}
