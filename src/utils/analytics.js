/**
 * Centralized Firebase Analytics utility for Kiko AI Order Taker.
 * All custom event tracking is routed through this module.
 */
import analytics from '@react-native-firebase/analytics';

// ─── App Lifecycle ───
export const trackAppOpened = () => {
  analytics().logEvent('app_opened', { timestamp: Date.now() });
};

// ─── Onboarding ───
export const trackOnboardingStarted = () => {
  analytics().logEvent('onboarding_started', { timestamp: Date.now() });
};

export const trackOnboardingSlideViewed = (slideIndex) => {
  analytics().logEvent('onboarding_slide_viewed', { slide_index: slideIndex });
};

export const trackOnboardingSkipped = (slideIndex) => {
  analytics().logEvent('onboarding_skipped', { skipped_at_slide: slideIndex });
};

export const trackOnboardingCompleted = () => {
  analytics().logEvent('onboarding_completed', { timestamp: Date.now() });
};

// ─── Login / Auth ───
export const trackLoginScreenViewed = () => {
  analytics().logEvent('login_screen_viewed', { timestamp: Date.now() });
};

export const trackOtpRequested = (phone) => {
  analytics().logEvent('otp_requested', { phone_last4: phone.slice(-4) });
};

export const trackOtpVerifyAttempt = () => {
  analytics().logEvent('otp_verify_attempt', { timestamp: Date.now() });
};

export const trackLoginSuccess = (phone) => {
  analytics().logEvent('login_success', { phone_last4: phone.slice(-4) });
  analytics().setUserId(phone);
};

export const trackLoginFailed = (reason) => {
  analytics().logEvent('login_failed', { reason: reason || 'unknown' });
};

export const trackSignupStarted = () => {
  analytics().logEvent('signup_started', { timestamp: Date.now() });
};

export const trackSignupCompleted = (shopName) => {
  analytics().logEvent('signup_completed', { shop_name: shopName || '' });
};

// ─── Permissions ───
export const trackPermissionScreenViewed = () => {
  analytics().logEvent('permission_screen_viewed', { timestamp: Date.now() });
};

export const trackPermissionsGranted = () => {
  analytics().logEvent('permissions_all_granted', { timestamp: Date.now() });
};

export const trackSetupComplete = () => {
  analytics().logEvent('setup_complete', { timestamp: Date.now() });
};

// ─── Home / Orders ───
export const trackHomeScreenViewed = (orderCount) => {
  analytics().logEvent('home_screen_viewed', { order_count: orderCount || 0 });
};

export const trackOrderViewed = (orderId) => {
  analytics().logEvent('order_viewed', { order_id: orderId });
};

export const trackOrderCreated = (orderId, productCount, totalAmount) => {
  analytics().logEvent('order_created', {
    order_id: orderId,
    product_count: productCount || 0,
    total_amount: totalAmount || 0,
  });
};

export const trackOrderEdited = (orderId) => {
  analytics().logEvent('order_edited', { order_id: orderId });
};

export const trackOrderCancelled = (orderId) => {
  analytics().logEvent('order_cancelled', { order_id: orderId });
};

export const trackOrderRestored = (orderId) => {
  analytics().logEvent('order_restored', { order_id: orderId });
};

export const trackOrderDelivered = (orderId) => {
  analytics().logEvent('order_delivered', { order_id: orderId });
};

// ─── WhatsApp ───
export const trackWhatsappSent = (orderId) => {
  analytics().logEvent('whatsapp_order_sent', { order_id: orderId });
};

export const trackWhatsappShared = (orderId) => {
  analytics().logEvent('whatsapp_order_shared', { order_id: orderId });
};

// ─── Recordings / Transcription ───
export const trackRecordingsScreenViewed = (recordingCount) => {
  analytics().logEvent('recordings_screen_viewed', { recording_count: recordingCount || 0 });
};

export const trackTranscribeStarted = (filename) => {
  analytics().logEvent('transcribe_started', { filename: filename || '' });
};

export const trackTranscribeSuccess = (filename, classification) => {
  analytics().logEvent('transcribe_success', {
    filename: filename || '',
    classification: classification || 'unknown',
  });
};

export const trackTranscribeFailed = (filename, reason) => {
  analytics().logEvent('transcribe_failed', {
    filename: filename || '',
    reason: reason || 'unknown',
  });
};

export const trackProcessAllStarted = (count) => {
  analytics().logEvent('process_all_started', { recording_count: count });
};

// ─── Settings ───
export const trackSettingsViewed = () => {
  analytics().logEvent('settings_screen_viewed', { timestamp: Date.now() });
};

export const trackSettingsSaved = (language) => {
  analytics().logEvent('settings_saved', { language: language || 'auto' });
};

export const trackLogoutClicked = () => {
  analytics().logEvent('logout_clicked', { timestamp: Date.now() });
};

// ─── Help Button ───
export const trackHelpButtonClicked = () => {
  analytics().logEvent('help_button_clicked', { timestamp: Date.now() });
};

export const trackHelpLanguageSelected = (lang) => {
  analytics().logEvent('help_language_selected', { language: lang });
};

// ─── Navigation / Button Clicks ───
export const trackButtonClick = (screenName, buttonName) => {
  analytics().logEvent('button_click', {
    screen: screenName,
    button: buttonName,
  });
};

export const trackScreenView = (screenName) => {
  analytics().logScreenView({ screen_name: screenName, screen_class: screenName });
};
